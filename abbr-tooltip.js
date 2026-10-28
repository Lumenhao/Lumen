document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('abbr[title]').forEach(el => {
    el.dataset.title = el.title;
    el.removeAttribute('title');
  });
});
