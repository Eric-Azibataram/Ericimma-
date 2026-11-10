'use strict';
// Keeps the site's data (posts, bookings, orders...) in memory and saves every change.
// With Supabase configured it is saved to Supabase (survives restarts and redeploys);
// without it, it is saved to a local file (fine on your own computer, lost on free hosting).
const fs = require('fs');
const path = require('path');

const empty = () => ({
  posts: [{
    id: 'welcome', title: 'Welcome to the Learning Hub!',
    content: 'This is where I post lessons, study guides and updates. Subscribe at the bottom of any page so you never miss one.',
    createdAt: new Date().toISOString()
  }],
  bookings: [], subscribers: [], orders: [],
  services: [
    { id: 'svc-web', name: 'Web Design', description: 'A clean, fast, mobile-friendly website for your business, brand or project.', price: 0, unit: 'per project' },
    { id: 'svc-graphic', name: 'Graphic Design', description: 'Logos, flyers, social media graphics and brand materials.', price: 0, unit: 'per design' },
    { id: 'svc-video', name: 'Video Editing / Animation', description: 'Polished edits, motion graphics and animation for YouTube, ads and events.', price: 0, unit: 'per video' },
    { id: 'svc-mentor', name: 'Tech Lessons / Mentoring', description: 'One-on-one guidance to learn design, editing or web skills faster.', price: 0, unit: 'per session' }
  ],
  portfolio: [], images: {},
  settings: { stats: [], hours: '', phone: '', email: '' }, testimonials: []
});

function createStore(dir, remote) {
  const db = empty();
  const readLocal = () => { try { return JSON.parse(fs.readFileSync(path.join(dir, 'db.json'), 'utf8')); } catch { return null; } };

  if (!remote) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'db.json');
    const saved = readLocal(); if (saved) Object.assign(db, saved);
    let writing = false, queued = false;
    const save = () => {
      if (writing) { queued = true; return; }
      writing = true;
      const tmp = file + '.tmp';
      const done = () => { writing = false; if (queued) { queued = false; save(); } };
      fs.writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 }, (err) => { if (err) return done(); fs.rename(tmp, file, done); });
    };
    if (!saved) save();
    return { db, save, ready: Promise.resolve(), flush: async () => {} };
  }

  // Supabase mode: load first (the server waits for this), then save changes shortly after they happen.
  let timer = null, running = false, dirty = false;
  const schedule = (ms) => { if (!timer) timer = setTimeout(flush, ms); };
  async function flush() {
    timer = null;
    if (running) { dirty = true; return; }
    running = true;
    try { while (dirty) { dirty = false; await remote.saveDoc(db); } }
    catch (e) { console.error('Supabase save failed (will retry):', e.message); dirty = true; schedule(5000); }
    running = false;
  }
  const save = () => { dirty = true; schedule(300); };
  const ready = (async () => {
    const doc = await remote.loadDoc(); // if this fails the server refuses to start, so empty data can never overwrite yours
    if (doc) { Object.assign(db, doc); return; }
    const legacy = readLocal(); if (legacy) Object.assign(db, legacy); // first run: bring over an old local db.json if there is one
    await remote.saveDoc(db);
  })();
  return { db, save, ready, flush: async () => { if (timer) { clearTimeout(timer); timer = null; } dirty = true; await flush(); } };
}
module.exports = { createStore };
