(async function () {
  'use strict';
  var box = document.getElementById('portfolio'), filters = document.getElementById('filters');
  var all = [], current = 'All';

  function openBox(p) {
    var ov = h('div', { class: 'lightbox', role: 'dialog', 'aria-label': 'Picture viewer' }, [
      h('img', { src: p.image, alt: p.title || p.category || 'Portfolio picture', referrerpolicy: 'no-referrer' }),
      h('button', { class: 'lb-close', type: 'button', text: 'Close' })
    ]);
    function close() { ov.remove(); document.removeEventListener('keydown', key); }
    function key(e) { if (e.key === 'Escape') close(); }
    ov.addEventListener('click', close); document.addEventListener('keydown', key);
    document.body.appendChild(ov);
  }
  function card(p) {
    var kids = [];
    if (p.image) {
      var pic = h('button', { class: 'pf-img', type: 'button', 'aria-label': 'View larger' }, [
        h('img', { src: p.image, alt: p.title || p.category || 'Portfolio picture', loading: 'lazy', referrerpolicy: 'no-referrer' })
      ]);
      pic.addEventListener('click', function () { openBox(p); });
      kids.push(pic);
    }
    var body = [];
    if (p.category) body.push(h('span', { class: 'tag', text: p.category }));
    if (p.title) body.push(h('h3', { class: 'mt10', text: p.title }));
    if (p.description) body.push(h('p', { text: p.description }));
    if (p.link) body.push(h('p', { class: 'mt12' }, [h('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', text: 'View project \u2192' })]));
    if (body.length) kids.push(h('div', { class: 'pf-body' }, body));
    return h('div', { class: 'card pf-card' }, kids);
  }
  function render() {
    box.textContent = '';
    var items = all.filter(function (p) { return current === 'All' || p.category === current; });
    items.forEach(function (p) { box.appendChild(card(p)); });
    if (!items.length) box.appendChild(h('p', { class: 'muted', text: 'Projects are being added. Check back soon!' }));
  }
  function buildFilters() {
    var cats = [];
    all.forEach(function (p) { if (p.category && cats.indexOf(p.category) < 0) cats.push(p.category); });
    filters.textContent = '';
    if (cats.length < 2) { filters.classList.add('hidden'); return; }
    filters.classList.remove('hidden');
    ['All'].concat(cats).forEach(function (c) {
      var b = h('button', { class: 'chip' + (c === current ? ' on' : ''), type: 'button', text: c });
      b.addEventListener('click', function () { current = c; buildFilters(); render(); });
      filters.appendChild(b);
    });
  }
  try { all = await api('/api/portfolio'); buildFilters(); render(); }
  catch (e) { box.textContent = 'Could not load projects. Please refresh.'; }
})();
