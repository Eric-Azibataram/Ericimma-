(function () {
  'use strict';
  var form = document.getElementById('bookingForm');
  if (!form) return;
  var box = document.getElementById('bookMsg');
  var d = new Date(); d.setDate(d.getDate() + 1);
  form.preferredDate.min = d.toISOString().slice(0, 10);
  var params = new URLSearchParams(location.search);
  api('/api/services').then(function (list) {
    form.service.textContent = '';
    list.map(function (x) { return x.name; }).concat(['Something else']).forEach(function (n) { form.service.appendChild(h('option', { value: n, text: n })); });
    if (params.get('service')) form.service.value = params.get('service');
  }).catch(function () { if (params.get('service')) form.service.value = params.get('service'); });
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    var btn = form.querySelector('button[type=submit]'); btn.disabled = true; box.classList.add('hidden');
    try {
      var data = await api('/api/book', { method: 'POST', body: {
        name: form.name.value, email: form.email.value, service: form.service.value,
        preferredDate: form.preferredDate.value, details: form.details.value, website: form.website.value } });
      form.reset(); notice(box, 'ok', data.message || 'Booking received!');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (err) { notice(box, 'err', err.message); }
    btn.disabled = false;
  });
})();
