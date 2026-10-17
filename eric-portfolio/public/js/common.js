(function () {
  'use strict';
  // Mobile menu
  var btn = document.getElementById('menuBtn'), links = document.getElementById('navLinks');
  if (btn && links) {
    btn.addEventListener('click', function (e) { e.stopPropagation(); links.classList.toggle('open'); btn.setAttribute('aria-expanded', links.classList.contains('open')); });
    document.addEventListener('click', function () { links.classList.remove('open'); });
  }

  // Small helpers shared by every page (all output goes through textContent => no XSS)
  window.$ = function (sel, root) { return (root || document).querySelector(sel); };
  window.h = function (tag, props, children) {
    var el = document.createElement(tag);
    Object.keys(props || {}).forEach(function (k) {
      if (k === 'text') el.textContent = props[k]; else if (k === 'class') el.className = props[k]; else el.setAttribute(k, props[k]);
    });
    (children || []).forEach(function (c) { el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return el;
  };
  window.api = async function (url, opts) {
    opts = opts || {};
    var headers = Object.assign({}, opts.headers);
    if (opts.body) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(opts.body); }
    var res = await fetch(url, Object.assign({ credentials: 'same-origin' }, opts, { headers: headers }));
    var data = {}; try { data = await res.json(); } catch (e) {}
    if (!res.ok) { var err = new Error(data.error || 'Something went wrong.'); err.status = res.status; throw err; }
    return data;
  };
  window.notice = function (box, kind, msg) {
    box.className = 'notice ' + kind; box.textContent = msg; box.classList.remove('hidden');
  };
  window.fmtDate = function (iso) {
    try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; }
  };
  window.naira = function (n) { return '\u20A6' + Number(n).toLocaleString('en-NG'); };
  window.renderPosts = function (container, posts) {
    container.textContent = '';
    if (!posts.length) { container.appendChild(h('p', { class: 'muted', text: 'Nothing posted yet. Check back soon!' })); return; }
    posts.forEach(function (p) {
      var paid = p.price > 0;
      var kids = [h('h3', { text: p.title }), h('time', { text: fmtDate(p.createdAt) + (paid ? '  \u2022  Paid lesson' : '') }),
        h('p', { text: p.content.length > 280 ? p.content.slice(0, 280) + '...' : p.content }),
        h('a', { class: 'btn sm mt12', href: '/lesson?id=' + encodeURIComponent(p.id), text: paid ? 'Unlock for ' + naira(p.price) : 'Read lesson' })];
      container.appendChild(h('article', { class: 'post' }, kids));
    });
  };

  // Floating WhatsApp button (shown only if WHATSAPP_NUMBER is configured on the server)
  if (location.pathname.indexOf('/admin') !== 0) {
    api('/api/config').then(function (c) {
      if (c.whatsapp) document.body.appendChild(h('a', { class: 'wa', href: 'https://wa.me/' + c.whatsapp, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Chat on WhatsApp', text: 'Chat on WhatsApp' }));
    }).catch(function () {});
  }

  // Footer subscribe form (present on every public page)
  var sub = document.getElementById('subscribeForm');
  if (sub) sub.addEventListener('submit', async function (e) {
    e.preventDefault();
    var box = document.getElementById('subMsg'), b = sub.querySelector('button');
    b.disabled = true;
    try {
      var d = await api('/api/subscribe', { method: 'POST', body: { email: sub.email.value, website: sub.website.value } });
      sub.reset(); notice(box, 'ok', d.message || 'Subscribed!');
    } catch (err) { notice(box, 'err', err.message); }
    b.disabled = false;
  });
})();
