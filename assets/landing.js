/* 落地页星野：轻量 canvas，尊重 prefers-reduced-motion */

const canvas = document.querySelector(".stars");

if (canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let w = 0;
  let h = 0;
  let stars = [];

  const rnd = (a, b) => a + Math.random() * (b - a);

  function seed() {
    const count = Math.min(Math.round((w * h) / 9000), 240);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: rnd(0.4, 1.5),
      a: rnd(0.2, 0.8),
      p: Math.random() * Math.PI * 2,
      gold: Math.random() < 0.14,
    }));
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      ctx.globalAlpha = s.a * (reduce ? 1 : 0.7 + 0.3 * Math.sin(t * 0.9 + s.p));
      ctx.fillStyle = s.gold ? "#e9c894" : "#dfe6ff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(0);
  }

  let last = 0;
  function loop(ts) {
    if (ts - last > 33) {
      draw(ts / 1000);
      last = ts;
    }
    requestAnimationFrame(loop);
  }

  resize();
  addEventListener("resize", resize);
  if (!reduce) requestAnimationFrame(loop);
}

const nav = document.querySelector(".nav");
if (nav) {
  const sync = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  sync();
  addEventListener("scroll", sync, { passive: true });
}
