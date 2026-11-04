'use strict';
// Talks to Supabase over plain HTTPS (no extra packages): one table for the site's data, one private bucket for files.
function createRemote(env = process.env) {
  const url = (env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const key = (env.SUPABASE_SERVICE_KEY || '').trim();
  const bucket = (env.SUPABASE_BUCKET || 'site-files').trim();
  if (!url || !key) return null;
  // New-style keys (sb_secret_...) go in "apikey" only; old-style JWT keys also go in Authorization.
  const auth = () => ({ apikey: key, ...(key.startsWith('eyJ') ? { Authorization: 'Bearer ' + key } : {}) });
  const enc = (p) => String(p).split('/').map(encodeURIComponent).join('/');
  const call = (method, p, { json, body, type, headers } = {}) => fetch(url + p, {
    method, signal: AbortSignal.timeout(30000), body: json !== undefined ? JSON.stringify(json) : body,
    headers: { ...auth(), ...(json !== undefined ? { 'content-type': 'application/json' } : type ? { 'content-type': type } : {}), ...headers }
  });
  const fail = async (r, what) => {
    const d = await r.json().catch(() => ({}));
    const msg = d.message || d.error || d.hint || ('HTTP ' + r.status);
    throw new Error(`${what}: ${msg}`);
  };

  return {
    bucket,
    async loadDoc() {
      const r = await call('GET', '/rest/v1/site_data?id=eq.main&select=data');
      if (!r.ok) await fail(r, 'Could not read your saved data (did you run supabase-setup.sql?)');
      const rows = await r.json();
      return rows.length ? rows[0].data : null;
    },
    async saveDoc(data) {
      const r = await call('POST', '/rest/v1/site_data?on_conflict=id', {
        json: [{ id: 'main', data, updated_at: new Date().toISOString() }],
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }
      });
      if (!r.ok) await fail(r, 'Could not save your data');
    },
    async ensureBucket() {
      try { await call('POST', '/storage/v1/bucket', { json: { id: bucket, name: bucket, public: false } }); } catch (e) { console.error('bucket check:', e.message); }
    },
    async put(p, buf, type) {
      const r = await call('POST', `/storage/v1/object/${bucket}/${enc(p)}`, { body: buf, type: type || 'application/octet-stream', headers: { 'x-upsert': 'true' } });
      if (!r.ok) await fail(r, 'Could not store the file');
    },
    async get(p) {
      const r = await call('GET', `/storage/v1/object/authenticated/${bucket}/${enc(p)}`);
      if (r.status === 404 || r.status === 400) return null;
      if (!r.ok) await fail(r, 'Could not read the file');
      return Buffer.from(await r.arrayBuffer());
    },
    async remove(p) {
      try { await call('DELETE', `/storage/v1/object/${bucket}/${enc(p)}`); } catch (e) { console.error('delete file:', e.message); }
    },
    async list(prefix, search) {
      const r = await call('POST', `/storage/v1/object/list/${bucket}`, { json: { prefix, search: search || '', limit: 1000 } });
      if (!r.ok) await fail(r, 'Could not list files');
      return r.json();
    }
  };
}
module.exports = { createRemote };
