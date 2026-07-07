// Deep-space backdrop: twinkling stars, nebulae, a spiral galaxy, planets,
// and the occasional shooting star. Static scenery is pre-rendered to an
// offscreen canvas; only star twinkle and shooting stars animate per frame.

interface Star {
  x: number;
  y: number;
  r: number;
  baseAlpha: number;
  phase: number;
  speed: number;
  hue: number;
}

interface ShootingStar {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export function startSpaceBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof requestAnimationFrame === "undefined") {
    return () => undefined;
  }

  let raf = 0;
  let destroyed = false;
  let stars: Star[] = [];
  const shooting: ShootingStar[] = [];
  let nextShootingIn = 2.5;
  let scenery: HTMLCanvasElement | null = null;
  let last = performance.now();

  function buildScene() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

    stars = [];
    const count = Math.min(420, Math.floor((w * h) / 3400));
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() < 0.88 ? 0.4 + Math.random() * 1.1 : 1.4 + Math.random() * 1.3,
        baseAlpha: 0.25 + Math.random() * 0.7,
        phase: Math.random() * Math.PI * 2,
        speed: 0.4 + Math.random() * 1.8,
        hue: Math.random() < 0.75 ? 210 : Math.random() < 0.5 ? 45 : 340
      });
    }

    scenery = document.createElement("canvas");
    scenery.width = Math.floor(w * dpr);
    scenery.height = Math.floor(h * dpr);
    const sc = scenery.getContext("2d");
    if (!sc) {
      scenery = null;
      return;
    }
    sc.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Base space gradient.
    const bg = sc.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "#04060f");
    bg.addColorStop(0.5, "#070b1e");
    bg.addColorStop(1, "#0a0716");
    sc.fillStyle = bg;
    sc.fillRect(0, 0, w, h);

    // Nebula washes.
    const nebulae: Array<[number, number, number, string]> = [
      [w * 0.78, h * 0.2, Math.max(w, h) * 0.4, "rgba(88, 28, 135, 0.16)"],
      [w * 0.15, h * 0.75, Math.max(w, h) * 0.45, "rgba(14, 116, 144, 0.12)"],
      [w * 0.5, h * 0.5, Math.max(w, h) * 0.6, "rgba(30, 27, 75, 0.25)"],
      [w * 0.32, h * 0.15, Math.max(w, h) * 0.3, "rgba(190, 24, 93, 0.08)"]
    ];
    for (const [nx, ny, nr, color] of nebulae) {
      const g = sc.createRadialGradient(nx, ny, 0, nx, ny, nr);
      g.addColorStop(0, color);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      sc.fillStyle = g;
      sc.fillRect(0, 0, w, h);
    }

    // Spiral galaxy, upper left.
    const gx = w * 0.18;
    const gy = h * 0.22;
    sc.save();
    sc.translate(gx, gy);
    sc.rotate(-0.5);
    const core = sc.createRadialGradient(0, 0, 0, 0, 0, 130);
    core.addColorStop(0, "rgba(255, 240, 220, 0.5)");
    core.addColorStop(0.2, "rgba(216, 180, 254, 0.22)");
    core.addColorStop(1, "rgba(139, 92, 246, 0)");
    sc.fillStyle = core;
    sc.save();
    sc.scale(1, 0.42);
    sc.beginPath();
    sc.arc(0, 0, 130, 0, Math.PI * 2);
    sc.fill();
    sc.restore();
    // Spiral arm star dust.
    for (let i = 0; i < 340; i++) {
      const t = Math.random() * 4.4;
      const arm = Math.random() < 0.5 ? 0 : Math.PI;
      const radius = 9 + t * 26 + Math.random() * 12;
      const angle = arm + t * 1.35 + (Math.random() - 0.5) * 0.35;
      const px = Math.cos(angle) * radius;
      const py = Math.sin(angle) * radius * 0.42;
      const a = Math.max(0.05, 0.55 - t * 0.11) * (0.4 + Math.random() * 0.6);
      sc.fillStyle = Math.random() < 0.8
        ? `rgba(226, 218, 255, ${a})`
        : `rgba(255, 200, 240, ${a})`;
      sc.beginPath();
      sc.arc(px, py, Math.random() * 1.1 + 0.3, 0, Math.PI * 2);
      sc.fill();
    }
    sc.restore();

    // Gas giant, bottom left, half off-screen.
    drawPlanet(sc, w * 0.06, h * 0.94, Math.min(w, h) * 0.2, {
      base: "#1d4ed8",
      mid: "#3b82f6",
      dark: "#0b1c4d",
      glow: "rgba(96, 165, 250, 0.25)",
      bands: true
    });

    // Ringed planet, upper right.
    const rpx = w * 0.88;
    const rpy = h * 0.16;
    const rpr = Math.min(w, h) * 0.055;
    sc.save();
    sc.translate(rpx, rpy);
    sc.rotate(-0.35);
    // Back half of the ring.
    sc.strokeStyle = "rgba(231, 201, 148, 0.5)";
    sc.lineWidth = rpr * 0.28;
    sc.beginPath();
    sc.ellipse(0, 0, rpr * 2.1, rpr * 0.62, 0, Math.PI, Math.PI * 2);
    sc.stroke();
    sc.restore();
    drawPlanet(sc, rpx, rpy, rpr, {
      base: "#b45309",
      mid: "#f59e0b",
      dark: "#451a03",
      glow: "rgba(251, 191, 36, 0.2)",
      bands: true
    });
    sc.save();
    sc.translate(rpx, rpy);
    sc.rotate(-0.35);
    // Front half of the ring, drawn over the planet.
    sc.strokeStyle = "rgba(231, 201, 148, 0.65)";
    sc.lineWidth = rpr * 0.28;
    sc.beginPath();
    sc.ellipse(0, 0, rpr * 2.1, rpr * 0.62, 0, 0, Math.PI);
    sc.stroke();
    sc.strokeStyle = "rgba(120, 90, 50, 0.5)";
    sc.lineWidth = rpr * 0.08;
    sc.beginPath();
    sc.ellipse(0, 0, rpr * 1.75, rpr * 0.5, 0, 0, Math.PI);
    sc.stroke();
    sc.restore();
  }

  function drawPlanet(
    sc: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    colors: { base: string; mid: string; dark: string; glow: string; bands: boolean }
  ) {
    // Atmosphere glow.
    const glow = sc.createRadialGradient(x, y, r * 0.8, x, y, r * 1.5);
    glow.addColorStop(0, colors.glow);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    sc.fillStyle = glow;
    sc.beginPath();
    sc.arc(x, y, r * 1.5, 0, Math.PI * 2);
    sc.fill();

    // Lit sphere: light source up-right.
    const body = sc.createRadialGradient(x + r * 0.45, y - r * 0.45, r * 0.1, x, y, r * 1.15);
    body.addColorStop(0, colors.mid);
    body.addColorStop(0.55, colors.base);
    body.addColorStop(1, colors.dark);
    sc.fillStyle = body;
    sc.beginPath();
    sc.arc(x, y, r, 0, Math.PI * 2);
    sc.fill();

    if (colors.bands) {
      sc.save();
      sc.beginPath();
      sc.arc(x, y, r, 0, Math.PI * 2);
      sc.clip();
      sc.globalAlpha = 0.16;
      sc.fillStyle = colors.dark;
      for (let i = -3; i <= 3; i++) {
        sc.beginPath();
        sc.ellipse(x, y + i * r * 0.26, r * 1.05, r * 0.07 + Math.abs(i) * 0.6, 0.08, 0, Math.PI * 2);
        sc.fill();
      }
      sc.restore();
    }

    // Terminator shadow.
    const shade = sc.createRadialGradient(x + r * 0.5, y - r * 0.5, r * 0.4, x + r * 0.5, y - r * 0.5, r * 1.9);
    shade.addColorStop(0, "rgba(0, 0, 0, 0)");
    shade.addColorStop(0.75, "rgba(0, 0, 0, 0)");
    shade.addColorStop(1, "rgba(0, 0, 5, 0.75)");
    sc.save();
    sc.beginPath();
    sc.arc(x, y, r, 0, Math.PI * 2);
    sc.clip();
    sc.fillStyle = shade;
    sc.fillRect(x - r, y - r, r * 2, r * 2);
    sc.restore();
  }

  function tick(now: number) {
    if (destroyed) {
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const t = now / 1000;

    if (scenery) {
      ctx!.drawImage(scenery, 0, 0, w, h);
    } else {
      ctx!.fillStyle = "#05060f";
      ctx!.fillRect(0, 0, w, h);
    }

    for (const star of stars) {
      const twinkle = 0.65 + 0.35 * Math.sin(t * star.speed + star.phase);
      const alpha = star.baseAlpha * twinkle;
      ctx!.fillStyle = `hsla(${star.hue}, 60%, 88%, ${alpha})`;
      ctx!.beginPath();
      ctx!.arc(star.x, star.y, star.r, 0, Math.PI * 2);
      ctx!.fill();
      if (star.r > 1.4) {
        // Cross flare on the brightest stars.
        ctx!.strokeStyle = `hsla(${star.hue}, 70%, 90%, ${alpha * 0.4})`;
        ctx!.lineWidth = 0.6;
        const f = star.r * 4 * twinkle;
        ctx!.beginPath();
        ctx!.moveTo(star.x - f, star.y);
        ctx!.lineTo(star.x + f, star.y);
        ctx!.moveTo(star.x, star.y - f);
        ctx!.lineTo(star.x, star.y + f);
        ctx!.stroke();
      }
    }

    nextShootingIn -= dt;
    if (nextShootingIn <= 0) {
      nextShootingIn = 4 + Math.random() * 7;
      const fromLeft = Math.random() < 0.5;
      shooting.push({
        x: fromLeft ? -40 : Math.random() * w,
        y: Math.random() * h * 0.4,
        vx: (fromLeft ? 1 : Math.random() < 0.5 ? 1 : -1) * (700 + Math.random() * 500),
        vy: 180 + Math.random() * 240,
        life: 1.1,
        maxLife: 1.1
      });
    }
    for (let i = shooting.length - 1; i >= 0; i--) {
      const s = shooting[i];
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0 || s.x < -100 || s.x > w + 100 || s.y > h + 100) {
        shooting.splice(i, 1);
        continue;
      }
      const alpha = s.life / s.maxLife;
      const tailX = s.x - s.vx * 0.12;
      const tailY = s.y - s.vy * 0.12;
      const grad = ctx!.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0, "rgba(180, 220, 255, 0)");
      grad.addColorStop(1, `rgba(235, 245, 255, ${0.9 * alpha})`);
      ctx!.strokeStyle = grad;
      ctx!.lineWidth = 2;
      ctx!.lineCap = "round";
      ctx!.beginPath();
      ctx!.moveTo(tailX, tailY);
      ctx!.lineTo(s.x, s.y);
      ctx!.stroke();
    }

    raf = requestAnimationFrame(tick);
  }

  buildScene();
  window.addEventListener("resize", buildScene);
  raf = requestAnimationFrame(tick);

  return () => {
    destroyed = true;
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", buildScene);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
}
