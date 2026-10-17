(async function () {
  'use strict';
  var box = document.getElementById('portfolio');
  try {
    var list = await api('/api/portfolio');
    box.textContent = '';
    list.forEach(function (p) {
      var kids = [];
      if (p.category) kids.push(h('span', { class: 'tag', text: p.category }));
      kids.push(h('h3', { class: 'mt10', text: p.title }), h('p', { text: p.description || '' }));
      if (p.link) kids.push(h('p', { class: 'mt12' }, [h('a', { href: p.link, target: '_blank', rel: 'noopener noreferrer', text: 'View project \u2192' })]));
      box.appendChild(h('div', { class: 'card' }, kids));
    });
    if (!list.length) box.appendChild(h('p', { class: 'muted', text: 'Projects are being added. Check back soon!' }));
  } catch (e) { box.textContent = 'Could not load projects. Please refresh.'; }
})();
