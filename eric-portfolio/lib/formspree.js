'use strict';
// Sends an alert to your own inbox through Formspree (https://formspree.io), using the form you already created.
// Free plan: 50 submissions a month, so only bookings and lesson sales are sent.
function createFormspree(env = process.env) {
  const url = (env.FORMSPREE_URL || '').trim();
  // Real addresses look like https://formspree.io/f/abcd1234. A local test address is allowed outside production only.
  const valid = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(url) || (env.NODE_ENV !== 'production' && /^http:\/\/localhost:\d+\/f\/[A-Za-z0-9]+$/.test(url));
  if (url && !valid) console.error('FORMSPREE_URL looks wrong. It should look like https://formspree.io/f/abcd1234');
  const oneLine = (s) => String(s || '').replace(/[\r\n]+/g, ' ').slice(0, 200);
  async function send(fields) {
    if (!valid) return { ok: false, error: 'Formspree is not set up yet.' };
    const body = {};
    for (const [k, v] of Object.entries(fields)) body[k] = k === '_subject' ? oneLine(v) : String(v == null ? '' : v).slice(0, 3000);
    try {
      const r = await fetch(url, {
        method: 'POST', signal: AbortSignal.timeout(10000),
        headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify(body)
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || d.error || (d.errors && d.errors.length)) {
        const msg = d.error || (d.errors && d.errors.map((e) => e.message || e.code).join(', ')) || ('HTTP ' + r.status);
        throw new Error(msg);
      }
      return { ok: true };
    } catch (e) { console.error('formspree failed:', e.message); return { ok: false, error: e.message }; }
  }
  return { enabled: valid, send };
}
module.exports = { createFormspree };
