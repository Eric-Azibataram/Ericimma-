(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // --- Scroll reveal (with a safety net so nothing stays hidden) ---
  var io = 'IntersectionObserver' in window ? new IntersectionObserver(function (entries) {
    entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: 0.15 }) : null;
  function watchReveal() {
    document.querySelectorAll('.reveal:not(.in)').forEach(function (el, i) {
      el.style.transitionDelay = ((i % 4) * 90) + 'ms';
      if (io) io.observe(el); else el.classList.add('in');
    });
  }
  watchReveal();
  setTimeout(function () { document.querySelectorAll('.reveal').forEach(function (el) { el.classList.add('in'); }); }, 4000);

  // --- Cards that start in the middle and spread outward, one after another ---
  function prepSpread(box) {
    var br = box.getBoundingClientRect(), cx = br.left + br.width / 2, cy = br.top + br.height / 2;
    box.querySelectorAll('.sp').forEach(function (sp, i) {
      var r = sp.getBoundingClientRect();
      sp.style.setProperty('--tx', Math.round(cx - (r.left + r.width / 2)) + 'px');
      sp.style.setProperty('--ty', Math.round(cy - (r.top + r.height / 2)) + 'px');
      sp.style.setProperty('--i', i);
      var card = sp.firstElementChild; if (card) card.style.setProperty('--i', i);
    });
  }
  document.querySelectorAll('.spread').forEach(function (box) {
    prepSpread(box);
    if (reduce || !io) { box.classList.add('go'); return; }
    var so = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { box.classList.add('go'); so.disconnect(); }
    }, { threshold: 0.25 });
    so.observe(box);
    setTimeout(function () { box.classList.add('go'); }, 6000);
  });
  window.addEventListener('resize', function () { document.querySelectorAll('.spread:not(.go)').forEach(prepSpread); });

  // Clicking "Who I help" replays the spread so the cards burst out again
  var who = document.querySelector('a[href="#who"]');
  if (who) who.addEventListener('click', function (e) {
    e.preventDefault();
    var box = document.getElementById('audience'), target = document.getElementById('who');
    box.classList.remove('go'); prepSpread(box);
    target.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    setTimeout(function () { box.classList.add('go'); }, reduce ? 0 : 450);
  });

  // --- Counters ---
  function countUp(el) {
    var raw = el.getAttribute('data-count'), m = /^([\d,]*\.?\d+)(.*)$/.exec(raw);
    if (!m) { el.textContent = raw; return; }
    var target = parseFloat(m[1].replace(/,/g, '')), suffix = m[2], hasComma = m[1].indexOf(',') >= 0, dec = (m[1].split('.')[1] || '').length;
    function fmt(n) { var t = dec ? n.toFixed(dec) : String(Math.round(n)); return (hasComma ? Number(t).toLocaleString('en-US') : t) + suffix; }
    if (reduce) { el.textContent = fmt(target); return; }
    var t0 = null, dur = 1600;
    (function step(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min(1, (ts - t0) / dur), eased = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(target * eased);
      if (p < 1) requestAnimationFrame(step);
    })(performance.now());
  }

  document.addEventListener('site-loaded', function (ev) {
    var site = ev.detail;
    // stats
    if (site.stats && site.stats.length) {
      var box = document.getElementById('stats'); box.textContent = '';
      site.stats.forEach(function (s, i) {
        var num = h('b', { 'data-count': s.value, text: '0' });
        var card = h('div', { class: 'stat-card float reveal', 'data-i': i }, [num, h('span', { text: s.label })]);
        card.style.setProperty('--i', i); box.appendChild(card);
      });
      document.getElementById('statsBlock').classList.remove('hidden');
      var so = io ? new IntersectionObserver(function (es) { if (es[0].isIntersecting) { box.querySelectorAll('[data-count]').forEach(countUp); so.disconnect(); } }, { threshold: 0.3 }) : null;
      if (so) so.observe(box); else box.querySelectorAll('[data-count]').forEach(countUp);
      watchReveal();
    }
    // testimonials
    if (site.testimonials && site.testimonials.length) {
      var tb = document.getElementById('testimonials'); tb.textContent = '';
      site.testimonials.forEach(function (t, i) {
        var who = h('div', { class: 'who', text: t.name }, t.role ? [h('small', { text: t.role })] : []);
        var c = h('div', { class: 'card quote float reveal' }, [h('p', { class: 'q', text: '\u201C' + t.quote + '\u201D' }), who]);
        c.style.setProperty('--i', i); tb.appendChild(c);
      });
      document.getElementById('testiBlock').classList.remove('hidden'); watchReveal();
    }
  });
  if (window.__site) document.dispatchEvent(new CustomEvent('site-loaded', { detail: window.__site }));

  // --- Recommended reads: latest lessons, free or paid ---
  var res = document.getElementById('resources');
  if (res) api('/api/posts?limit=3').then(function (posts) {
    res.textContent = '';
    if (!posts.length) { res.appendChild(h('p', { class: 'muted', text: 'Lessons are coming soon. Subscribe below to be the first to know.' })); return; }
    posts.forEach(function (p, i) {
      var paid = p.price > 0, excerpt = p.content.length > 130 ? p.content.slice(0, 130) + '...' : p.content;
      var card = h('div', { class: 'card res-card float reveal' }, [
        h('span', { class: 'badge2' + (paid ? ' paid' : ''), text: paid ? naira(p.price) : 'Free' }),
        h('h3', { text: p.title }), h('p', { text: excerpt }),
        h('a', { href: '/lesson?id=' + encodeURIComponent(p.id), text: paid ? 'See what is inside \u2192' : 'Read now \u2192' })
      ]);
      card.style.setProperty('--i', i); res.appendChild(card);
    });
    watchReveal();
  }).catch(function () { res.textContent = 'Could not load lessons. Please refresh.'; });
})();
