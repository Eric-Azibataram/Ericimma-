'use strict';
// Turns a picture link into one a web page can show.
// Google Drive "share" links are web pages, not pictures, so they are converted to a direct picture link.
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com', 'drive.usercontent.google.com']);

function normalizeImageLink(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch { return { error: 'That picture link is not valid.' }; }
  if (u.protocol !== 'https:') return { error: 'The picture link must start with https://' };
  const host = u.hostname.replace(/^www\./, '');
  if (!DRIVE_HOSTS.has(host)) return { url: u.href };
  if (/\/folders\//.test(u.pathname)) return { error: 'That is a Google Drive folder link. Open ONE picture, tap Share, choose "Anyone with the link", and paste that picture\'s link. One link per picture.' };
  const m = u.pathname.match(/\/d\/([\w-]{10,})/);
  const id = m ? m[1] : (/^[\w-]{10,}$/.test(u.searchParams.get('id') || '') ? u.searchParams.get('id') : '');
  if (!id) return { error: 'I could not find a picture in that Google Drive link. Copy the link from the picture\'s Share button.' };
  return { url: `https://drive.google.com/thumbnail?id=${id}&sz=w1600`, drive: true };
}
module.exports = { normalizeImageLink };
