'use strict';
// Tiny JSON-file database with atomic writes. Swap for Supabase/Postgres later if traffic grows.
const fs = require('fs');
const path = require('path');

function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'db.json');
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
    portfolio: []
  });
  let db;
  let writing = false, queued = false;
  function save() {
    if (writing) { queued = true; return; }
    writing = true;
    const tmp = file + '.tmp';
    const done = () => { writing = false; if (queued) { queued = false; save(); } };
    fs.writeFile(tmp, JSON.stringify(db, null, 2), { mode: 0o600 }, (err) => {
      if (err) return done();
      fs.rename(tmp, file, done);
    });
  }
  try { db = { ...empty(), ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { db = empty(); save(); }
  return { db, save };
}
module.exports = { createStore };
