(async function () {
  'use strict';
  var ref = new URLSearchParams(location.search).get('reference') || '', box = $('#pMsg');
  if (!ref) { notice(box, 'err', 'No payment reference found.'); return; }
  try {
    var d = await api('/api/pay/verify?reference=' + encodeURIComponent(ref));
    try { localStorage.setItem('lt_' + d.postId, d.token); } catch (e) {}
    notice(box, 'ok', 'Payment confirmed. Thank you! Opening your lesson...');
    var link = '/lesson?id=' + encodeURIComponent(d.postId) + '&token=' + encodeURIComponent(d.token);
    box.appendChild(document.createElement('br'));
    box.appendChild(h('a', { href: link, text: 'Open lesson (bookmark this link to access it on any device)' }));
    setTimeout(function () { location.href = link; }, 2500);
  } catch (e) { notice(box, 'err', e.message); }
})();
