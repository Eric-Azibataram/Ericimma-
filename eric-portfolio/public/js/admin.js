(function () {
  'use strict';
  var csrf = '', timer = null;
  var loginView = $('#loginView'), dashView = $('#dashView'), dashMsg = $('#dashMsg');
  function call(url, method, body) {
    return api(url, { method: method, body: body, headers: { 'X-CSRF-Token': csrf } }).catch(function (e) {
      if (e.status === 401) showLogin();
      throw e;
    });
  }
  function showLogin() { clearInterval(timer); dashView.classList.add('hidden'); loginView.classList.remove('hidden'); }
  function showDash() { loginView.classList.add('hidden'); dashView.classList.remove('hidden'); load(); clearInterval(timer); timer = setInterval(load, 20000); }
  function cell(text, cls) { return h('td', { class: cls || '', text: text }); }
  function btn(label, cls, fn) { var b = h('button', { class: 'btn sm ' + (cls || ''), type: 'button', text: label }); b.addEventListener('click', fn); return b; }
  function fail(e) { notice(dashMsg, 'err', e.message); }

  async function load() {
    try {
      var d = await call('/api/admin/data', 'GET');
      $('#sBook').textContent = d.bookings.length;
      $('#sNew').textContent = d.bookings.filter(function (b) { return b.status === 'new'; }).length;
      $('#sSub').textContent = d.subscribers.length; $('#sPost').textContent = d.posts.length;

      var bb = $('#bookBody'); bb.textContent = '';
      d.bookings.slice().reverse().forEach(function (b) {
        var sel = h('select', {}, ['new', 'confirmed', 'done'].map(function (s) { var o = h('option', { value: s, text: s }); if (s === b.status) o.selected = true; return o; }));
        sel.addEventListener('change', function () { call('/api/admin/bookings/' + b.id, 'PATCH', { status: sel.value }).then(load).catch(fail); });
        bb.appendChild(h('tr', {}, [
          cell(fmtDate(b.createdAt) + (b.preferredDate ? ' (wants ' + b.preferredDate + ')' : '')),
          h('td', {}, [h('strong', { text: b.name }), h('br'), (/^[\w.+\-]+@[\w.\-]+$/.test(b.email) ? h('a', { href: 'mailto:' + b.email, text: b.email }) : h('span', { text: b.email }))]),
          cell(b.service), cell(b.details, 'wrap'), h('td', {}, [sel]),
          h('td', {}, [btn('Delete', 'danger', function () { if (confirm('Delete this booking?')) call('/api/admin/bookings/' + b.id, 'DELETE').then(load).catch(fail); })])
        ]));
      });
      if (!d.bookings.length) bb.appendChild(h('tr', {}, [h('td', { colspan: 6, text: 'No bookings yet.' })]));

      var pb = $('#postBody'); pb.textContent = '';
      d.posts.forEach(function (p) {
        pb.appendChild(h('tr', {}, [cell(fmtDate(p.createdAt)), cell(p.title + (p.price > 0 ? '  (' + naira(p.price) + ')' : '')),
          h('td', {}, [btn('Delete', 'danger', function () { if (confirm('Delete this post?')) call('/api/admin/posts/' + p.id, 'DELETE').then(load).catch(fail); })])]));
      });
      var paidOrders = d.orders.filter(function (o) { return o.status === 'paid'; });
      $('#sRev').textContent = naira(paidOrders.reduce(function (t, o) { return t + o.amount; }, 0));
      var ob = $('#ordBody'); ob.textContent = '';
      d.orders.slice().reverse().forEach(function (o) {
        ob.appendChild(h('tr', {}, [cell(fmtDate(o.createdAt)), cell(o.title), cell(o.email), cell(naira(o.amount)), cell(o.status)]));
      });
      if (!d.orders.length) ob.appendChild(h('tr', {}, [h('td', { colspan: 5, text: 'No lesson sales yet.' })]));

      var sv = $('#svcBody'); sv.textContent = '';
      d.services.forEach(function (x) {
        var inp = h('input', { type: 'number', min: '0', value: String(x.price) });
        sv.appendChild(h('tr', {}, [cell(x.name), h('td', {}, [inp]),
          h('td', {}, [h('div', { class: 'row-actions' }, [
            btn('Save price', '', function () { call('/api/admin/services/' + x.id, 'PATCH', { price: inp.value }).then(function () { notice(dashMsg, 'ok', 'Price saved.'); load(); }).catch(fail); }),
            btn('Delete', 'danger', function () { if (confirm('Delete this service?')) call('/api/admin/services/' + x.id, 'DELETE').then(load).catch(fail); })])])]));
      });
      var po = $('#porBody'); po.textContent = '';
      d.portfolio.forEach(function (x) {
        po.appendChild(h('tr', {}, [cell(x.title), cell(x.category || ''),
          h('td', {}, [btn('Delete', 'danger', function () { if (confirm('Delete this project?')) call('/api/admin/portfolio/' + x.id, 'DELETE').then(load).catch(fail); })])]));
      });
      if (!d.portfolio.length) po.appendChild(h('tr', {}, [h('td', { colspan: 3, text: 'No projects yet. Add your best work above.' })]));

      var sb = $('#subBody'); sb.textContent = '';
      d.subscribers.forEach(function (s) {
        sb.appendChild(h('tr', {}, [cell(s.email), cell(fmtDate(s.createdAt)),
          h('td', {}, [btn('Remove', 'danger', function () { call('/api/admin/subscribers/' + s.id, 'DELETE').then(load).catch(fail); })])]));
      });
      if (!d.subscribers.length) sb.appendChild(h('tr', {}, [h('td', { colspan: 3, text: 'No subscribers yet.' })]));
    } catch (e) { /* handled in call() */ }
  }

  $('#loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    try {
      var d = await api('/api/admin/login', { method: 'POST', body: { password: $('#pw').value } });
      csrf = d.csrf; $('#pw').value = ''; showDash();
    } catch (err) { notice($('#loginMsg'), 'err', err.message); }
  });
  $('#logoutBtn').addEventListener('click', function () { call('/api/admin/logout', 'POST').finally(function () { csrf = ''; showLogin(); }); });
  $('#postForm').addEventListener('submit', function (e) {
    e.preventDefault();
    call('/api/admin/posts', 'POST', { title: $('#pTitle').value, content: $('#pContent').value, price: $('#pPrice').value, premium: $('#pPremium').value })
      .then(function () { $('#postForm').reset(); notice(dashMsg, 'ok', 'Published!'); load(); }).catch(fail);
  });
  $('#svcForm').addEventListener('submit', function (e) {
    e.preventDefault();
    call('/api/admin/services', 'POST', { name: $('#sName').value, description: $('#sDesc').value, price: $('#sPrice').value, unit: $('#sUnit').value })
      .then(function () { $('#svcForm').reset(); notice(dashMsg, 'ok', 'Service added.'); load(); }).catch(fail);
  });
  $('#porForm').addEventListener('submit', function (e) {
    e.preventDefault();
    call('/api/admin/portfolio', 'POST', { title: $('#oTitle').value, category: $('#oCat').value, description: $('#oDesc').value, link: $('#oLink').value })
      .then(function () { $('#porForm').reset(); notice(dashMsg, 'ok', 'Project added.'); load(); }).catch(fail);
  });
  api('/api/admin/session').then(function (s) { if (s.authenticated) { csrf = s.csrf; showDash(); } else showLogin(); }).catch(showLogin);
})();
