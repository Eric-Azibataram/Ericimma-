'use strict';
// Security rules for what a page may load.
// Admin and API responses stay fully strict. Public content pages also allow Google's ad domains so AdSense can run.
const STRICT = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";

const GOOGLE_ADS = [
  'https://*.googlesyndication.com', 'https://*.google.com', 'https://*.googleadservices.com',
  'https://*.doubleclick.net', 'https://*.g.doubleclick.net', 'https://*.adtrafficquality.google',
  'https://*.gstatic.com', 'https://*.googletagservices.com'
].join(' ');
const ADS = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${GOOGLE_ADS}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  `connect-src 'self' ${GOOGLE_ADS}`,
  `frame-src ${GOOGLE_ADS}`,
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'"
].join('; ');

const isPrivateArea = (p) => /^\/(admin|api)(\/|\.|$)/.test(p);
const cspFor = (pathname) => (isPrivateArea(pathname) ? STRICT : ADS);
module.exports = { cspFor, STRICT, ADS };
