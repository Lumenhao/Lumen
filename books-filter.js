document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('.books-filter');
  if (!bar) return;

  const cards = Array.from(document.querySelectorAll('.book-grid .book-card'));

  bar.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-cat]');
    if (!btn) return;

    bar.querySelectorAll('button').forEach(b => b.classList.toggle('active', b === btn));
    const cat = btn.dataset.cat;
    cards.forEach(card => {
      const cats = (card.dataset.cats || '').split('|').filter(Boolean);
      card.hidden = cat !== '*' && !cats.includes(cat);
    });
  });
});
