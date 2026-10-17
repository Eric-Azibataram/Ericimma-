(async function () {
  'use strict';
  var box = document.getElementById('posts');
  if (!box) return;
  try {
    var posts = await api('/api/posts' + (box.dataset.limit ? '?limit=' + encodeURIComponent(box.dataset.limit) : ''));
    renderPosts(box, posts);
  } catch (e) { box.textContent = 'Could not load updates. Please refresh.'; }
})();
