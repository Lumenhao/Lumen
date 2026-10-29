/* 落地页星野：缓慢漂移 + 指针视差 + 偶发流星，尊重 prefers-reduced-motion */

const canvas = document.querySelector(".stars");

if (canvas) {
  const ctx = canvas.getContext("2d");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  let w = 0;
  let h = 0;
  let stars = [];
  let meteors = [];
  let nextMeteor = 0;
  let raf = 0;
  let lastTs = 0;

  const rnd = (a, b) => a + Math.random() * (b - a);
  const rgba = (hex, a) =>
    `rgba(${parseInt(hex.slice(1, 3), 16)}, ${parseInt(hex.slice(3, 5), 16)}, ${parseInt(hex.slice(5, 7), 16)}, ${a})`;

  // 预渲染带光晕的星点，比每帧画 arc + shadowBlur 便宜得多
  function makeSprite(hex) {
    const size = 64;
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const g = c.getContext("2d");
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, hex);
    grad.addColorStop(0.14, rgba(hex, 0.95));
    grad.addColorStop(0.38, rgba(hex, 0.28));
    grad.addColorStop(1, rgba(hex, 0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    return c;
  }

  const SPRITE = { blue: makeSprite("#dfe6ff"), gold: makeSprite("#e9c894") };

  function seed() {
    const count = Math.min(Math.round((w * h) / 8000), 280);
    stars = Array.from({ length: count }, () => {
      const depth = Math.random(); // 0 远 → 1 近，用来做大小与视差
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.5 + depth * 1.3,
        a: rnd(0.2, 0.85),
        p: Math.random() * Math.PI * 2,
        speed: 0.04 + depth * 0.18,
        sway: rnd(-0.03, 0.03),
        depth,
        gold: Math.random() < 0.14,
      };
    });
    meteors = [];
  }

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth;
    h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
    draw(0, 0);
  }

  function spawnMeteor() {
    const fromLeft = Math.random() < 0.5;
    const speed = rnd(4, 7);
    const angle = rnd(0.32, 0.62);
    meteors.push({
      x: fromLeft ? rnd(-60, w * 0.45) : rnd(w * 0.55, w + 60),
      y: rnd(-40, h * 0.35),
      vx: (fromLeft ? 1 : -1) * Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      len: rnd(70, 140),
      life: 0,
      ttl: rnd(42, 70),
    });
  }

  function draw(t, dt) {
    ctx.clearRect(0, 0, w, h);
    const shiftX = reduce ? 0 : pointer.x * 30;
    const shiftY = reduce ? 0 : pointer.y * 20;

    ctx.globalCompositeOperation = "lighter";
    for (const s of stars) {
      if (!reduce) {
        s.y -= s.speed * dt;
        s.x += s.sway * dt;
        if (s.y < -6) {
          s.y = h + 6;
          s.x = Math.random() * w;
        }
        if (s.x < -6) s.x = w + 6;
        if (s.x > w + 6) s.x = -6;
      }
      const size = s.r * 7;
      ctx.globalAlpha = s.a * (reduce ? 1 : 0.68 + 0.32 * Math.sin(t * 0.9 + s.p));
      ctx.drawImage(
        s.gold ? SPRITE.gold : SPRITE.blue,
        s.x + shiftX * s.depth - size / 2,
        s.y + shiftY * s.depth - size / 2,
        size,
        size
      );
    }
    ctx.globalCompositeOperation = "source-over";

    if (!reduce) {
      if (t > nextMeteor) {
        spawnMeteor();
        nextMeteor = t + rnd(9, 22);
      }
      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        m.x += m.vx * dt;
        m.y += m.vy * dt;
        m.life += dt;
        const fade = Math.sin(Math.min(m.life / m.ttl, 1) * Math.PI);
        const norm = Math.hypot(m.vx, m.vy) || 1;
        const tx = m.x - (m.vx / norm) * m.len;
        const ty = m.y - (m.vy / norm) * m.len;
        const grad = ctx.createLinearGradient(m.x, m.y, tx, ty);
        grad.addColorStop(0, `rgba(255, 246, 228, ${0.8 * fade})`);
        grad.addColorStop(0.3, `rgba(233, 200, 148, ${0.32 * fade})`);
        grad.addColorStop(1, "rgba(233, 200, 148, 0)");
        ctx.globalAlpha = 1;
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.2;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(m.x, m.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        const head = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 5);
        head.addColorStop(0, `rgba(255, 250, 240, ${0.9 * fade})`);
        head.addColorStop(1, "rgba(255, 250, 240, 0)");
        ctx.fillStyle = head;
        ctx.beginPath();
        ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
        ctx.fill();
        if (m.life > m.ttl || m.y > h + 200 || m.x < -300 || m.x > w + 300) meteors.splice(i, 1);
      }
    }

    ctx.globalAlpha = 1;
  }

  function loop(ts) {
    if (document.hidden) {
      raf = 0;
      return;
    }
    if (ts - lastTs > 30) {
      const dt = Math.min((ts - lastTs) / 33.3, 2.5);
      pointer.x += (pointer.tx - pointer.x) * 0.06;
      pointer.y += (pointer.ty - pointer.y) * 0.06;
      draw(ts / 1000, dt);
      lastTs = ts;
    }
    raf = requestAnimationFrame(loop);
  }

  resize();
  addEventListener("resize", resize);

  if (!reduce) {
    nextMeteor = 3 + Math.random() * 5;
    addEventListener(
      "pointermove",
      (e) => {
        pointer.tx = e.clientX / innerWidth - 0.5;
        pointer.ty = e.clientY / innerHeight - 0.5;
      },
      { passive: true }
    );
    raf = requestAnimationFrame(loop);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden && !raf) {
        lastTs = 0;
        raf = requestAnimationFrame(loop);
      }
    });
  }
}

const nav = document.querySelector(".nav");
if (nav) {
  const sync = () => nav.classList.toggle("is-scrolled", scrollY > 8);
  sync();
  addEventListener("scroll", sync, { passive: true });
}
