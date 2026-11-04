'use strict';
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { hashPassword, verifyPassword, rateLimit, createSessions, EMAIL_RE, clean, csvSafe } = require('./lib/security');
const { createStore } = require('./lib/store');
const { createMailer } = require('./lib/mailer');
const { ALLOWED_FILES, FILE_ID, extOf, sniffFile, safeFileName } = require('./lib/files');
const mailer = createMailer();

const PROD = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const { db, save } = createStore(DATA_DIR);
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const PRIVATE_DIR = path.join(DATA_DIR, 'private'); // paid files live here and are never served as static files
fs.mkdirSync(PRIVATE_DIR, { recursive: true });

/* ---------- Secrets ---------- */
function loadSecret() {
  if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
  const f = path.join(DATA_DIR, '.session_secret');
  try { return fs.readFileSync(f, 'utf8'); } catch {}
  const s = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
}
let ADMIN_HASH = process.env.ADMIN_PASSWORD_HASH;
if (!ADMIN_HASH && !PROD && process.env.ADMIN_PASSWORD) {
  ADMIN_HASH = hashPassword(process.env.ADMIN_PASSWORD); // development convenience only
  console.log('[dev] Using ADMIN_PASSWORD from your environment.');
}
if (!ADMIN_HASH) {
  if (PROD) {
    console.error('FATAL: ADMIN_PASSWORD_HASH is not set. Run "npm run set-password" and add the result to your environment.');
    process.exit(1);
  }
  const temp = crypto.randomBytes(9).toString('base64url');
  ADMIN_HASH = hashPassword(temp);
  console.warn(`\n[dev] No ADMIN_PASSWORD_HASH set. Temporary admin password for this run: ${temp}\n`);
}
const sessions = createSessions({ secret: loadSecret(), secure: PROD });

/* ---------- App + global hardening ---------- */
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY);

app.use((req, res, next) => {
  res.set({
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin'
  });
  if (PROD) res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (req.path.startsWith('/api/') || req.path.startsWith('/admin')) {
    res.set('Cache-Control', 'no-store');
    res.set('X-Robots-Tag', 'noindex, nofollow');
  }
  next();
});

app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

// Hosts our own pages may be served from (your domain, and the Codespaces preview address when developing).
const allowedHosts = new Set();
try { if (process.env.SITE_URL) allowedHosts.add(new URL(process.env.SITE_URL).host); } catch {}
if (process.env.CODESPACE_NAME && process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN)
  allowedHosts.add(`${process.env.CODESPACE_NAME}-${PORT}.${process.env.GITHUB_CODESPACES_PORT_FORWARDING_DOMAIN}`);

// Block cross-site form/API abuse: any state-changing request must come from our own origin.
app.use('/api', (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.get('origin');
  if (origin) {
    try {
      const host = new URL(origin).host;
      const ok = host === req.get('host')
        || (process.env.TRUST_PROXY && host === req.get('x-forwarded-host'))
        || allowedHosts.has(host);
      if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked.' });
    } catch { return res.status(403).json({ error: 'Bad origin.' }); }
  }
  if (!['/admin/upload', '/admin/upload-file'].includes(req.path) && Number(req.get('content-length')) > 0 && !req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
  next();
});

/* ---------- Rate limiters ---------- */
const apiLimiter = rateLimit({ name: 'api', windowMs: 60_000, max: 120 });
const formLimiter = rateLimit({ name: 'form', windowMs: 10 * 60_000, max: 8, message: 'Too many submissions. Please wait a few minutes and try again.' });
const loginLimiter = rateLimit({ name: 'login', windowMs: 15 * 60_000, max: 5, message: 'Too many login attempts. Try again in 15 minutes.' });
app.use('/api', apiLimiter);

/* ---------- Public API ---------- */
app.get('/api/posts', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
  const posts = [...db.posts]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, limit)
    .map(({ id, title, content, createdAt, price, file }) => ({ id, title, content, createdAt, price: price || 0, hasFile: !!file }));
  res.json(posts);
});

function notifyBooking(b) {
  if (!mailer.enabled) return;
  mailer.send({
    to: mailer.owner, replyTo: b.email, subject: `New booking: ${b.service} from ${b.name}`,
    text: `You have a new booking request.\n\nName: ${b.name}\nEmail: ${b.email}\nPhone/WhatsApp: ${b.phone || '(not given)'}\nService: ${b.service}\nPreferred date: ${b.preferredDate || '(not given)'}\n\nDetails:\n${b.details}\n\nReply to this email to answer the customer, or open your admin dashboard.`
  });
  mailer.send({
    to: b.email, replyTo: mailer.owner, subject: 'We received your booking request',
    text: `Hi ${b.name},\n\nThanks for your booking request for ${b.service}. I have received it and will reply to this email soon.\n\nWhat you sent me:\n${b.details}\n\nEric Azibataram`
  });
}
function notifyOrder(o) {
  if (!mailer.enabled) return;
  const link = `${o.base || (process.env.SITE_URL || '').replace(/\/$/, '')}/lesson?id=${encodeURIComponent(o.postId)}&token=${encodeURIComponent(o.token)}`;
  mailer.send({
    to: o.email, replyTo: mailer.owner, subject: `Your lesson: ${o.title}`,
    text: `Thank you for your payment of N${Number(o.amount).toLocaleString('en-NG')}.\n\nOpen your lesson here (keep this link, it works on any device):\n${link}\n\nEric Azibataram`
  });
  mailer.send({ to: mailer.owner, subject: `Lesson sold: ${o.title}`, text: `${o.email} paid N${Number(o.amount).toLocaleString('en-NG')} for "${o.title}".` });
}
const serviceNames = () => [...db.services.map((x) => x.name), 'Something else'];

app.post('/api/book', formLimiter, (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ success: true }); // honeypot: bots fill this, humans never see it
  const name = clean(b.name, 100), email = clean(b.email, 254).toLowerCase();
  const service = clean(b.service, 60), details = clean(b.details, 2000);
  const preferredDate = /^\d{4}-\d{2}-\d{2}$/.test(b.preferredDate || '') ? b.preferredDate : '';
  const phone = clean(b.phone, 25);
  if (name.length < 2) return res.status(400).json({ error: 'Please enter your full name.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (phone && !/^\+?[\d\s\-()]{7,25}$/.test(phone)) return res.status(400).json({ error: 'Please enter a valid phone number, or leave it empty.' });
  if (!serviceNames().includes(service)) return res.status(400).json({ error: 'Please choose a service.' });
  if (details.length < 10) return res.status(400).json({ error: 'Please tell me a little more (at least 10 characters).' });
  if (db.bookings.length >= 5000) return res.status(503).json({ error: 'Bookings are temporarily closed.' });
  const booking = { id: crypto.randomUUID(), name, email, phone, service, preferredDate, details, status: 'new', createdAt: new Date().toISOString() };
  db.bookings.push(booking);
  save();
  notifyBooking(booking); // email you + the customer (does not delay the reply)
  res.status(201).json({ success: true, message: "Booking received! I'll reply to your email soon." });
});

app.post('/api/subscribe', formLimiter, (req, res) => {
  const b = req.body || {};
  if (b.website) return res.json({ success: true });
  const email = clean(b.email, 254).toLowerCase();
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (db.subscribers.length >= 20000) return res.status(503).json({ error: 'Subscriptions are temporarily closed.' });
  if (!db.subscribers.some((s) => s.email === email)) {
    db.subscribers.push({ id: crypto.randomUUID(), email, createdAt: new Date().toISOString() });
    save();
  }
  res.status(201).json({ success: true, message: "You're subscribed!" }); // same reply either way: no email enumeration
});


/* ---------- Public catalogue ---------- */
const WHATSAPP = String(process.env.WHATSAPP_NUMBER || '').replace(/\D/g, '');
const PAYSTACK_KEY = process.env.PAYSTACK_SECRET_KEY || '';
const PAYSTACK_API = process.env.PAYSTACK_API || 'https://api.paystack.co';
app.get('/api/config', (req, res) => res.json({ whatsapp: WHATSAPP, paymentsEnabled: !!PAYSTACK_KEY }));
app.get('/api/images', (req, res) => res.json(db.images));
app.get('/api/services', (req, res) => res.json(db.services));
app.get('/api/portfolio', (req, res) => res.json(db.portfolio));

/* ---------- Paid lessons (Paystack) ---------- */
async function paystack(method, pathname, body) {
  const r = await fetch(PAYSTACK_API + pathname, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${PAYSTACK_KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.status === false) throw new Error(data.message || 'Payment provider error');
  return data.data;
}
function markPaid(order) {
  if (order.status !== 'paid') {
    order.status = 'paid';
    order.token = crypto.randomBytes(24).toString('base64url');
    order.paidAt = new Date().toISOString();
    save();
    notifyOrder(order);
  }
}
const sameToken = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
};
const payLimiter = rateLimit({ name: 'pay', windowMs: 10 * 60_000, max: 10 });

app.post('/api/pay/init', payLimiter, async (req, res) => {
  if (!PAYSTACK_KEY) return res.status(503).json({ error: 'Payments are not set up yet. Please contact me to get access.' });
  const email = clean(req.body?.email, 254).toLowerCase();
  const post = db.posts.find((p) => p.id === req.body?.postId);
  if (!post || !(post.price > 0)) return res.status(400).json({ error: 'This lesson is not for sale.' });
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  const reference = 'EA-' + crypto.randomBytes(10).toString('hex');
  const base = (process.env.SITE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  try {
    const data = await paystack('POST', '/transaction/initialize', {
      email, amount: post.price * 100, currency: 'NGN', reference, callback_url: `${base}/paid`,
      metadata: { postId: post.id }
    });
    db.orders.push({ id: crypto.randomUUID(), reference, base, postId: post.id, title: post.title, email, amount: post.price, status: 'pending', createdAt: new Date().toISOString() });
    save();
    res.json({ url: data.authorization_url });
  } catch (e) { console.error('paystack init:', e.message); res.status(502).json({ error: 'Could not start payment. Please try again.' }); }
});

app.get('/api/pay/verify', payLimiter, async (req, res) => {
  const reference = clean(req.query.reference, 80);
  const order = db.orders.find((o) => o.reference === reference);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  try {
    if (order.status !== 'paid') {
      const tx = await paystack('GET', '/transaction/verify/' + encodeURIComponent(reference));
      if (tx.status !== 'success' || tx.amount !== order.amount * 100 || tx.currency !== 'NGN')
        return res.status(402).json({ error: 'Payment not completed yet.' });
      markPaid(order);
    }
    res.json({ success: true, postId: order.postId, token: order.token });
  } catch (e) { console.error('paystack verify:', e.message); res.status(502).json({ error: 'Could not confirm payment. Please refresh in a moment.' }); }
});

// Paystack calls this itself (signed). It makes sure paid orders unlock even if the buyer closes the tab.
app.post('/api/paystack/webhook', (req, res) => {
  if (!PAYSTACK_KEY || !req.rawBody) return res.sendStatus(400);
  const sig = crypto.createHmac('sha512', PAYSTACK_KEY).update(req.rawBody).digest('hex');
  if (!sameToken(sig, req.get('x-paystack-signature'))) return res.sendStatus(401);
  const ev = req.body;
  if (ev?.event === 'charge.success') {
    const d = ev.data || {};
    const order = db.orders.find((o) => o.reference === d.reference);
    if (order && d.status === 'success' && d.amount === order.amount * 100 && d.currency === 'NGN') markPaid(order);
  }
  res.sendStatus(200);
});

app.get('/api/lessons/:id', (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post) return res.status(404).json({ error: 'Lesson not found.' });
  const price = post.price || 0;
  const base = { id: post.id, title: post.title, createdAt: post.createdAt, price, preview: post.content, file: post.file ? { name: post.file.name, size: post.file.size } : null };
  const unlocked = price === 0 || db.orders.some((o) => o.postId === post.id && o.status === 'paid' && sameToken(o.token, req.query.token));
  if (!unlocked) return res.status(402).json({ ...base, locked: true });
  res.json({ ...base, locked: false, body: post.premium ? post.content + '\n\n' + post.premium : post.content });
});


const dlLimiter = rateLimit({ name: 'dl', windowMs: 10 * 60_000, max: 30 });
app.get('/api/lessons/:id/file', dlLimiter, (req, res) => {
  const post = db.posts.find((p) => p.id === req.params.id);
  if (!post || !post.file) return res.status(404).json({ error: 'No file for this lesson.' });
  if ((post.price || 0) > 0) {
    const order = db.orders.find((o) => o.postId === post.id && o.status === 'paid' && sameToken(o.token, req.query.token));
    if (!order) return res.status(402).json({ error: 'Please purchase this lesson to download the file.' });
    if ((order.downloads || 0) >= 30) return res.status(429).json({ error: 'Download limit reached. Please contact me and I will help.' });
    order.downloads = (order.downloads || 0) + 1; save();
  }
  const full = path.join(PRIVATE_DIR, post.file.id);
  if (!FILE_ID.test(post.file.id) || !fs.existsSync(full)) return res.status(404).json({ error: 'The file is missing. Please contact me.' });
  res.set('Content-Type', ALLOWED_FILES[extOf(post.file.id)]);
  res.download(full, post.file.name, (err) => { if (err && !res.headersSent) res.status(500).json({ error: 'Download failed.' }); });
});

/* ---------- Admin auth ---------- */
app.post('/api/admin/login', loginLimiter, (req, res) => {
  const pw = typeof req.body?.password === 'string' ? req.body.password.slice(0, 200) : '';
  if (!pw || !verifyPassword(pw, ADMIN_HASH)) return res.status(401).json({ error: 'Incorrect password.' });
  loginLimiter.reset(req);
  const s = sessions.create(res);
  res.json({ success: true, csrf: s.csrf });
});

app.get('/api/admin/session', (req, res) => {
  const s = sessions.read(req);
  res.json(s ? { authenticated: true, csrf: s.csrf } : { authenticated: false });
});

function requireAdmin(req, res, next) {
  const s = sessions.read(req);
  if (!s) return res.status(401).json({ error: 'Not logged in.' });
  if (!['GET', 'HEAD'].includes(req.method)) {
    const given = Buffer.from(req.get('x-csrf-token') || '');
    const want = Buffer.from(s.csrf);
    if (given.length !== want.length || !crypto.timingSafeEqual(given, want)) return res.status(403).json({ error: 'Invalid security token. Refresh the page.' });
  }
  req.session = s;
  next();
}

app.post('/api/admin/test-email', requireAdmin, async (req, res) => {
  if (!mailer.enabled) return res.status(400).json({ error: 'Email is not set up yet. Add BREVO_API_KEY and MAIL_FROM in your hosting settings.' });
  const r = await mailer.send({ to: mailer.owner, subject: 'Test email from your website', text: 'If you can read this, booking and sales emails are working.' });
  if (!r.ok) return res.status(502).json({ error: 'Brevo refused it: ' + r.error });
  res.json({ success: true, to: mailer.owner });
});
app.post('/api/admin/logout', requireAdmin, (req, res) => { sessions.destroy(req, res); res.json({ success: true }); });

const httpUrl = (v) => { try { const u = new URL(String(v)); return /^https?:$/.test(u.protocol) ? u.href : ''; } catch { return ''; } };
/* ---------- Admin API (all behind login + CSRF) ---------- */
app.get('/api/admin/data', requireAdmin, (req, res) => {
  res.json({ posts: db.posts, bookings: db.bookings, subscribers: db.subscribers, services: db.services, portfolio: db.portfolio, orders: db.orders, mail: { enabled: mailer.enabled, to: mailer.owner } });
});

app.post('/api/admin/posts', requireAdmin, (req, res) => {
  const title = clean(req.body?.title, 150), content = clean(req.body?.content, 8000);
  const premium = clean(req.body?.premium, 40000);
  const price = Math.round(Number(req.body?.price) || 0);
  if (!title || !content) return res.status(400).json({ error: 'Title and content are required.' });
  if (price < 0 || price > 10_000_000) return res.status(400).json({ error: 'Price must be between 0 and 10,000,000.' });
  const fileId = clean(req.body?.fileId, 60), fileName = clean(req.body?.fileName, 100);
  let file = null;
  if (fileId) {
    const full = path.join(PRIVATE_DIR, fileId);
    if (!FILE_ID.test(fileId) || !fs.existsSync(full)) return res.status(400).json({ error: 'The uploaded file was not found. Please choose it again.' });
    file = { id: fileId, name: safeFileName(fileName, extOf(fileId)), size: fs.statSync(full).size };
  }
  if (price > 0 && !premium && !file) return res.status(400).json({ error: 'A paid lesson needs paid content: write it in the paid box, or attach a file.' });
  const post = { id: crypto.randomUUID(), title, content, premium, price, file, createdAt: new Date().toISOString() };
  db.posts.unshift(post); save();
  res.status(201).json({ success: true, post });
});

app.delete('/api/admin/posts/:id', requireAdmin, (req, res) => {
  const gone = db.posts.find((p) => p.id === req.params.id);
  if (!gone) return res.status(404).json({ error: 'Not found.' });
  db.posts = db.posts.filter((p) => p.id !== req.params.id);
  if (gone.file && FILE_ID.test(gone.file.id)) fs.rm(path.join(PRIVATE_DIR, gone.file.id), { force: true }, () => {});
  save(); res.json({ success: true });
});

app.patch('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const status = req.body?.status;
  if (!['new', 'confirmed', 'done'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const b = db.bookings.find((x) => x.id === req.params.id);
  if (!b) return res.status(404).json({ error: 'Not found.' });
  b.status = status; save(); res.json({ success: true });
});

app.delete('/api/admin/bookings/:id', requireAdmin, (req, res) => {
  const n = db.bookings.length;
  db.bookings = db.bookings.filter((b) => b.id !== req.params.id);
  if (db.bookings.length === n) return res.status(404).json({ error: 'Not found.' });
  save(); res.json({ success: true });
});

app.delete('/api/admin/subscribers/:id', requireAdmin, (req, res) => {
  const n = db.subscribers.length;
  db.subscribers = db.subscribers.filter((s) => s.id !== req.params.id);
  if (db.subscribers.length === n) return res.status(404).json({ error: 'Not found.' });
  save(); res.json({ success: true });
});


app.post('/api/admin/services', requireAdmin, (req, res) => {
  const name = clean(req.body?.name, 80), description = clean(req.body?.description, 400), unit = clean(req.body?.unit, 40);
  const price = Math.round(Number(req.body?.price) || 0);
  if (!name) return res.status(400).json({ error: 'Service name is required.' });
  if (price < 0 || price > 100_000_000) return res.status(400).json({ error: 'Invalid price.' });
  if (name.toLowerCase() === 'something else' || db.services.some((x) => x.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: 'A service with that name already exists.' });
  db.services.push({ id: crypto.randomUUID(), name, description, price, unit }); save(); res.status(201).json({ success: true });
});
app.patch('/api/admin/services/:id', requireAdmin, (req, res) => {
  const sv = db.services.find((x) => x.id === req.params.id);
  if (!sv) return res.status(404).json({ error: 'Not found.' });
  const price = Math.round(Number(req.body?.price));
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) return res.status(400).json({ error: 'Invalid price.' });
  sv.price = price; save(); res.json({ success: true });
});
app.delete('/api/admin/services/:id', requireAdmin, (req, res) => {
  const n = db.services.length; db.services = db.services.filter((x) => x.id !== req.params.id);
  if (db.services.length === n) return res.status(404).json({ error: 'Not found.' });
  save(); res.json({ success: true });
});
app.post('/api/admin/portfolio', requireAdmin, (req, res) => {
  const title = clean(req.body?.title, 120), description = clean(req.body?.description, 600), category = clean(req.body?.category, 40);
  const rawLink = clean(req.body?.link, 500), link = rawLink ? httpUrl(rawLink) : '';
  if (!title) return res.status(400).json({ error: 'Project title is required.' });
  if (rawLink && !link) return res.status(400).json({ error: 'Link must start with http:// or https://' });
  db.portfolio.unshift({ id: crypto.randomUUID(), title, description, category, link, createdAt: new Date().toISOString() });
  save(); res.status(201).json({ success: true });
});
app.delete('/api/admin/portfolio/:id', requireAdmin, (req, res) => {
  const n = db.portfolio.length; db.portfolio = db.portfolio.filter((x) => x.id !== req.params.id);
  if (db.portfolio.length === n) return res.status(404).json({ error: 'Not found.' });
  save(); res.json({ success: true });
});


/* ---------- Masterclass files (PDF, Word, ...) ---------- */
const rawFile = express.raw({ type: 'application/octet-stream', limit: '25mb' });
app.put('/api/admin/upload-file', requireAdmin, rawFile, (req, res) => {
  let orig = ''; try { orig = decodeURIComponent(req.get('x-file-name') || ''); } catch {}
  const ext = extOf(orig);
  if (!ALLOWED_FILES[ext]) return res.status(400).json({ error: 'Please choose a PDF, Word (.doc/.docx), PowerPoint (.pptx), Excel (.xlsx) or .zip file.' });
  if (!sniffFile(req.body, ext)) return res.status(400).json({ error: `That file is damaged or is not a real .${ext} file.` });
  if (fs.readdirSync(PRIVATE_DIR).length >= 200) return res.status(400).json({ error: 'Too many files stored. Delete old lessons first.' });
  const stored = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(PRIVATE_DIR, stored), req.body, { mode: 0o600 });
  res.status(201).json({ fileId: stored, name: safeFileName(orig, ext), size: req.body.length });
});

/* ---------- Pictures (upload or link) ---------- */
const SLOTS = ['profile', 'home-banner', 'about-extra'];
const LOCAL_SRC = /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (b.subarray(0, 4).toString('latin1') === 'GIF8') return 'gif';
  if (b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}
const rawImage = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], limit: '6mb' });
app.put('/api/admin/upload', requireAdmin, rawImage, (req, res) => {
  const buf = req.body;
  const ext = Buffer.isBuffer(buf) ? sniffImage(buf) : null;
  if (!ext) return res.status(400).json({ error: 'Please choose a JPG, PNG, WebP or GIF picture.' });
  if (fs.readdirSync(UPLOAD_DIR).length >= 60) return res.status(400).json({ error: 'Too many uploaded pictures. Remove some first.' });
  const name = crypto.randomBytes(12).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOAD_DIR, name), buf, { mode: 0o644 });
  res.status(201).json({ src: '/uploads/' + name });
});
const dropIfUnused = (src) => {
  if (!LOCAL_SRC.test(src || '') || Object.values(db.images).some((i) => i.src === src)) return;
  fs.rm(path.join(UPLOAD_DIR, path.basename(src)), { force: true }, () => {});
};
app.put('/api/admin/images/:slot', requireAdmin, (req, res) => {
  const slot = req.params.slot;
  if (!SLOTS.includes(slot)) return res.status(404).json({ error: 'Unknown picture spot.' });
  const src = clean(req.body?.src, 600), alt = clean(req.body?.alt, 150);
  const okLocal = LOCAL_SRC.test(src) && fs.existsSync(path.join(UPLOAD_DIR, path.basename(src)));
  const okLink = !okLocal && /^https:\/\//i.test(src) && httpUrl(src);
  if (!okLocal && !okLink) return res.status(400).json({ error: 'Use an uploaded picture or a link starting with https://' });
  const old = db.images[slot]?.src;
  db.images[slot] = { src: okLocal ? src : httpUrl(src), alt };
  save(); dropIfUnused(old);
  res.json({ success: true });
});
app.delete('/api/admin/images/:slot', requireAdmin, (req, res) => {
  if (!SLOTS.includes(req.params.slot)) return res.status(404).json({ error: 'Unknown picture spot.' });
  const old = db.images[req.params.slot]?.src;
  delete db.images[req.params.slot]; save(); dropIfUnused(old);
  res.json({ success: true });
});

app.get('/api/admin/subscribers.csv', requireAdmin, (req, res) => {
  const rows = ['email,joined', ...db.subscribers.map((s) => `${csvSafe(s.email)},${csvSafe(s.createdAt)}`)];
  res.type('text/csv').attachment('subscribers.csv').send(rows.join('\n'));
});

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found.' }));

/* ---------- Pages ---------- */
app.use('/uploads', express.static(UPLOAD_DIR, { dotfiles: 'ignore', index: false, maxAge: PROD ? '7d' : 0 }));
// "/about" -> about.html, "/booking" -> booking.html, etc. Dotfiles are never served.
app.use(express.static(path.join(__dirname, 'public'), {
  extensions: ['html'], dotfiles: 'ignore', index: 'index.html',
  // Pages, scripts and styles are re-checked on every visit, so updates show up immediately (no stale admin).
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache')
}));
app.use((req, res) => res.status(404).sendFile(path.join(__dirname, 'public', '404.html')));

app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That file is too large.' });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Bad request.' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong.' });
});

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} (${PROD ? 'production' : 'development'})`));
