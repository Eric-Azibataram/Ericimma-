'use strict';
// Rules for downloadable masterclass files (PDF, Word, PowerPoint, Excel, ZIP).
const ALLOWED_FILES = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip'
};
const FILE_ID = /^[a-f0-9]{24}\.(pdf|doc|docx|pptx|xlsx|zip)$/;
const extOf = (name) => { const m = /\.([A-Za-z0-9]{2,5})$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; };
// Check the first bytes so a renamed .exe or a text file cannot pass as a PDF.
function sniffFile(buf, ext) {
  if (!Buffer.isBuffer(buf) || buf.length < 8 || !ALLOWED_FILES[ext]) return false;
  if (ext === 'pdf') return buf.subarray(0, 5).toString('latin1') === '%PDF-';
  if (ext === 'doc') return buf.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  return buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04; // docx/pptx/xlsx/zip are ZIP containers
}
function safeFileName(name, ext) {
  const base = String(name || '').replace(/\.[^.]*$/, '').replace(/[^\w\- ()]+/g, '').trim().slice(0, 80) || 'masterclass';
  return base + '.' + ext;
}
module.exports = { ALLOWED_FILES, FILE_ID, extOf, sniffFile, safeFileName };
