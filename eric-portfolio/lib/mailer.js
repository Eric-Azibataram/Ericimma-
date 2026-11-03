'use strict';
// Sends email through Brevo's HTTP API (free plan, no extra packages needed).
// If BREVO_API_KEY / MAIL_FROM are not set, email is simply switched off and the site keeps working.
function createMailer(env = process.env) {
  const key = env.BREVO_API_KEY || '';
  const from = env.MAIL_FROM || '';
  const fromName = env.MAIL_FROM_NAME || 'Eric Azibataram';
  const api = (env.BREVO_API || 'https://api.brevo.com').replace(/\/$/, '');
  const owner = env.NOTIFY_EMAIL || from;
  const enabled = !!(key && from);
  const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  let sentToday = 0, day = new Date().toDateString();

  async function send({ to, subject, text, replyTo }) {
    if (!enabled) return { ok: false, error: 'Email is not set up yet.' };
    if (!to) return { ok: false, error: 'No recipient.' };
    const today = new Date().toDateString();
    if (today !== day) { day = today; sentToday = 0; }
    if (sentToday >= 250) return { ok: false, error: 'Daily email limit reached.' }; // protects your free quota
    sentToday += 1;
    try {
      const r = await fetch(api + '/v3/smtp/email', {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'api-key': key, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          sender: { name: fromName, email: from },
          to: [{ email: to }],
          subject: oneLine(subject),
          textContent: String(text || ''),
          ...(replyTo ? { replyTo: { email: replyTo } } : {})
        })
      });
      if (!r.ok) { const d = await r.json().catch(() => ({})); throw new Error(d.message || 'HTTP ' + r.status); }
      return { ok: true };
    } catch (e) {
      console.error('mail failed:', e.message);
      return { ok: false, error: e.message };
    }
  }
  return { enabled, owner, send };
}
module.exports = { createMailer };
