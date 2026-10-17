(async function () {
  'use strict';
  var box = document.getElementById('services');
  if (!box) return;
  try {
    var list = await api('/api/services');
    if (box.dataset.home) list = list.slice(0, 4);
    box.textContent = '';
    list.forEach(function (s) {
      box.appendChild(h('div', { class: 'card' }, [
        h('h3', { text: s.name }),
        h('p', { class: 'price', text: s.price > 0 ? 'From ' + naira(s.price) + (s.unit ? ' ' + s.unit : '') : 'Get a quote' }),
        h('p', { text: s.description || '' }),
        h('p', { class: 'mt12' }, [h('a', { class: 'btn sm', href: '/booking?service=' + encodeURIComponent(s.name), text: 'Book this' })])
      ]));
    });
    if (!list.length) box.appendChild(h('p', { class: 'muted', text: 'Services coming soon.' }));
  } catch (e) { box.textContent = 'Could not load services. Please refresh.'; }
})();
