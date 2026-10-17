(async function () {
  'use strict';
  var params = new URLSearchParams(location.search), id = params.get('id') || '';
  var key = 'lt_' + id, token = params.get('token') || '';
  try { if (token) localStorage.setItem(key, token); else token = localStorage.getItem(key) || ''; } catch (e) {}
  var title = $('#lTitle'), meta = $('#lMeta'), body = $('#lBody'), msg = $('#lMsg'), buy = $('#buyBox');
  function show(d) { title.textContent = d.title; meta.textContent = fmtDate(d.createdAt) + (d.price > 0 ? ' \u2022 Paid lesson' : ''); document.title = d.title + ' | Eric Azibataram'; }
  try {
    var d = await api('/api/lessons/' + encodeURIComponent(id) + (token ? '?token=' + encodeURIComponent(token) : ''));
    show(d); body.textContent = d.body;
  } catch (e) {
    if (e.status === 402) {
      var r = await fetch('/api/lessons/' + encodeURIComponent(id)); var d2 = await r.json();
      show(d2); body.textContent = d2.preview;
      $('#buyPrice').textContent = 'Price: ' + naira(d2.price) + '. One payment, and the lesson stays unlocked on this device.';
      buy.classList.remove('hidden');
      $('#buyForm').addEventListener('submit', async function (ev) {
        ev.preventDefault();
        var b = ev.target.querySelector('button'); b.disabled = true;
        try { var p = await api('/api/pay/init', { method: 'POST', body: { postId: id, email: $('#buyEmail').value } }); location.href = p.url; }
        catch (err) { notice(msg, 'err', err.message); b.disabled = false; }
      });
    } else { title.textContent = 'Lesson not found'; body.textContent = 'This lesson does not exist or was removed.'; }
  }
})();
