'use strict';
const crypto = require('crypto');

/* ---------- Password hashing (scrypt, salted, constant-time compare) ---------- */
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}
function verifyPassword(password, stored) {
  try {
    const [alg, saltHex, hashHex] = String(stored).split('$');
    if (alg !== 'scrypt') return false;
    const expected = Buffer.from(hashHex, 'hex');
    const actual = crypto.scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length);
    return crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

/* ---------- Rate limiting (per IP, in memory) ---------- */
function rateLimit({ name, windowMs, max, message }) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();
  const middleware = (req, res, next) => {
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) entry = { count: 0, reset: now + windowMs };
    entry.count += 1;
    hits.set(key, entry);
    if (entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.reset - now) / 1000)));
      return res.status(429).json({ error: message || 'Too many requests. Please try again later.' });
    }
    next();
  };
  middleware.reset = (req) => hits.delete(`${name}:${req.ip}`);
  return middleware;
}

/* ---------- Sessions (server-side, signed cookie, CSRF token) ---------- */
function createSessions({ secret, secure, ttlMs = 4 * 60 * 60 * 1000 }) {
  const store = new Map();
  const sign = (v) => crypto.createHmac('sha256', secret).update(v).digest('base64url');
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store) if (v.expires <= now) store.delete(k);
  }, 10 * 60 * 1000).unref();

  const parseCookies = (header = '') =>
    Object.fromEntries(header.split(';').map((c) => c.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, v.join('=')]));

  function read(req) {
    const raw = parseCookies(req.headers.cookie).sid;
    if (!raw) return null;
    const [id, sig] = raw.split('.');
    if (!id || !sig) return null;
    const good = Buffer.from(sign(id)); const given = Buffer.from(sig);
    if (good.length !== given.length || !crypto.timingSafeEqual(good, given)) return null;
    const s = store.get(id);
    if (!s || s.expires <= Date.now()) { store.delete(id); return null; }
    s.expires = Date.now() + ttlMs;
    return { id, ...s };
  }
  const cookieAttrs = `Path=/; HttpOnly; SameSite=Strict${secure ? '; Secure' : ''}`;
  function create(res) {
    const id = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(24).toString('base64url');
    store.set(id, { csrf, expires: Date.now() + ttlMs });
    res.append('Set-Cookie', `sid=${id}.${sign(id)}; Max-Age=${Math.floor(ttlMs / 1000)}; ${cookieAttrs}`);
    return { id, csrf };
  }
  function destroy(req, res) {
    const s = read(req);
    if (s) store.delete(s.id);
    res.append('Set-Cookie', `sid=; Max-Age=0; ${cookieAttrs}`);
  }
  return { read, create, destroy };
}

/* ---------- Input helpers ---------- */
const EMAIL_RE = /^[^\s@<>()]{1,64}@[^\s@<>()]{1,255}\.[A-Za-z]{2,}$/;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
const csvSafe = (v) => {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
};

module.exports = { hashPassword, verifyPassword, rateLimit, createSessions, EMAIL_RE, clean, csvSafe };
