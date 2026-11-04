'use strict';
// One interface for files: Supabase Storage when configured, otherwise plain folders on disk.
// kind is 'uploads' (public pictures) or 'private' (paid masterclass files).
const fs = require('fs');
const path = require('path');

function createStorage({ remote, baseDir }) {
  const dirOf = (kind) => path.join(baseDir, kind);
  if (!remote) for (const k of ['uploads', 'private']) fs.mkdirSync(dirOf(k), { recursive: true });
  return {
    mode: remote ? 'supabase' : 'local',
    async put(kind, name, buf, type) {
      if (remote) return remote.put(`${kind}/${name}`, buf, type);
      await fs.promises.writeFile(path.join(dirOf(kind), name), buf, { mode: 0o600 });
    },
    async read(kind, name) {
      if (remote) return remote.get(`${kind}/${name}`);
      try { return await fs.promises.readFile(path.join(dirOf(kind), name)); } catch { return null; }
    },
    async stat(kind, name) {
      if (remote) {
        const list = await remote.list(kind, name);
        const hit = (list || []).find((o) => String(o.name).split('/').pop() === name);
        return hit ? { size: Number(hit.metadata && hit.metadata.size) || 0 } : null;
      }
      try { return { size: (await fs.promises.stat(path.join(dirOf(kind), name))).size }; } catch { return null; }
    },
    async remove(kind, name) {
      if (remote) return remote.remove(`${kind}/${name}`);
      await fs.promises.rm(path.join(dirOf(kind), name), { force: true });
    },
    async count(kind) {
      if (remote) return ((await remote.list(kind, '')) || []).length;
      return (await fs.promises.readdir(dirOf(kind))).length;
    }
  };
}
module.exports = { createStorage };
