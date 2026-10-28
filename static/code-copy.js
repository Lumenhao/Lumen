document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.markdown pre').forEach(pre => {
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = '复制';
    btn.addEventListener('click', async () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      await navigator.clipboard.writeText(text);
      btn.textContent = '已复制';
      setTimeout(() => btn.textContent = '复制', 1500);
    });
    pre.appendChild(btn);
  });
});
