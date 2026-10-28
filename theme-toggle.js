// 白天/黑夜模式切换
(() => {
  const KEY = 'book-theme'
  const btn = document.getElementById('theme-toggle')
  if (!btn) return

  const icon = btn.querySelector('.theme-icon')

  function setTheme(t) {
    var d = document.documentElement;
    d.dataset.theme = t;
    d.style.colorScheme = t;
    if (t === 'dark') {
      d.style.setProperty('--body-background','#1a1a1a');
      d.style.setProperty('--body-font-color','#e0e0e0');
      d.style.setProperty('--color-link','#4db6ac');
      d.style.setProperty('--gray-100','#2d2d2d');
      d.style.setProperty('--gray-200','#3d3d3d');
      d.style.setProperty('--gray-500','#a0a0a0');
      d.style.setProperty('--text-primary','#f5f5f7');
      d.style.setProperty('--text-secondary','#a1a1a6');
      d.style.setProperty('--surface','rgba(255,255,255,0.06)');
      d.style.setProperty('--hairline','rgba(255,255,255,0.14)');
      d.style.setProperty('--hairline-strong','rgba(255,255,255,0.24)');
      d.style.backgroundColor = '#1a1a1a';
      d.style.color = '#e0e0e0';
    } else {
      d.style.setProperty('--body-background','#fff');
      d.style.setProperty('--body-font-color','#000');
      d.style.setProperty('--color-link','#00897b');
      d.style.setProperty('--gray-100','#f0f0f0');
      d.style.setProperty('--gray-200','#d0d0d0');
      d.style.setProperty('--gray-500','#707070');
      d.style.setProperty('--text-primary','#1d1d1f');
      d.style.setProperty('--text-secondary','#6e6e73');
      d.style.setProperty('--surface','#f5f5f7');
      d.style.setProperty('--hairline','rgba(0,0,0,0.1)');
      d.style.setProperty('--hairline-strong','rgba(0,0,0,0.18)');
      d.style.backgroundColor = '#ffffff';
      d.style.color = '#000000';
    }
    localStorage.setItem(KEY, t);
    if (icon) icon.textContent = t === 'dark' ? '☀️' : '🌙';
  }

  // 初始化：localStorage > 系统偏好
  const saved = localStorage.getItem(KEY)
  if (saved) {
    setTheme(saved)
  } else {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(prefersDark ? 'dark' : 'light')
  }

  btn.addEventListener('click', () => {
    const cur = document.documentElement.dataset.theme
    setTheme(cur === 'dark' ? 'light' : 'dark')
  })
})()
