// Foreground effects layer: lasers, explosions, and mouse trails drawn on a
// full-viewport canvas with additive blending.

export interface FxEngine {
  laser(x1: number, y1: number, x2: number, y2: number, hue: number, onImpact?: () => void): void;
  explosion(x: number, y: number, scale?: number): void;
  trail(x: number, y: number): void;
  destroy(): void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
  sat: number;
  light: number;
  gravity: number;
  drag: number;
  shrink: boolean;
}

interface Beam {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  t: number;
  fade: number;
  hue: number;
  impactFired: boolean;
  onImpact?: () => void;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  maxR: number;
  life: number;
  maxLife: number;
  hue: number;
}

interface Flash {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  maxR: number;
}

const noopEngine: FxEngine = {
  laser: () => undefined,
  explosion: () => undefined,
  trail: () => undefined,
  destroy: () => undefined
};

export function startFx(canvas: HTMLCanvasElement): FxEngine {
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof requestAnimationFrame === "undefined") {
    return noopEngine;
  }

  const particles: Particle[] = [];
  const beams: Beam[] = [];
  const rings: Ring[] = [];
  const flashes: Flash[] = [];
  let raf = 0;
  let last = performance.now();
  let destroyed = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", resize);

  function spawn(partial: Partial<Particle> & { x: number; y: number }): void {
    particles.push({
      vx: 0,
      vy: 0,
      life: 1,
      maxLife: 1,
      size: 2,
      hue: 30,
      sat: 100,
      light: 60,
      gravity: 0,
      drag: 1,
      shrink: true,
      ...partial
    });
  }

  function tick(now: number) {
    if (destroyed) {
      return;
    }
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    ctx!.clearRect(0, 0, window.innerWidth, window.innerHeight);
    ctx!.globalCompositeOperation = "lighter";

    // Beams travel to the target, then linger and fade.
    for (let i = beams.length - 1; i >= 0; i--) {
      const b = beams[i];
      if (b.t < 1) {
        b.t = Math.min(1, b.t + dt * 5.5);
        if (b.t >= 1 && !b.impactFired) {
          b.impactFired = true;
          b.onImpact?.();
        }
      } else {
        b.fade -= dt * 4;
        if (b.fade <= 0) {
          beams.splice(i, 1);
          continue;
        }
      }
      const head = b.t;
      const tail = Math.max(0, b.t - 0.45);
      const hx = b.x1 + (b.x2 - b.x1) * head;
      const hy = b.y1 + (b.y2 - b.y1) * head;
      const tx = b.x1 + (b.x2 - b.x1) * tail;
      const ty = b.y1 + (b.y2 - b.y1) * tail;
      const alpha = Math.max(0, Math.min(1, b.fade));

      ctx!.save();
      ctx!.lineCap = "round";
      ctx!.shadowColor = `hsla(${b.hue}, 100%, 60%, ${alpha})`;
      ctx!.shadowBlur = 18;
      ctx!.strokeStyle = `hsla(${b.hue}, 100%, 60%, ${0.85 * alpha})`;
      ctx!.lineWidth = 6;
      ctx!.beginPath();
      ctx!.moveTo(tx, ty);
      ctx!.lineTo(hx, hy);
      ctx!.stroke();
      ctx!.strokeStyle = `hsla(${b.hue}, 40%, 95%, ${alpha})`;
      ctx!.lineWidth = 2;
      ctx!.beginPath();
      ctx!.moveTo(tx, ty);
      ctx!.lineTo(hx, hy);
      ctx!.stroke();
      ctx!.restore();

      // Sparks streaming off the beam head while in flight.
      if (b.t < 1) {
        spawn({
          x: hx,
          y: hy,
          vx: (Math.random() - 0.5) * 60,
          vy: (Math.random() - 0.5) * 60,
          life: 0.3,
          maxLife: 0.3,
          size: 1.5 + Math.random() * 1.5,
          hue: b.hue,
          light: 70
        });
      }
    }

    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      f.life -= dt;
      if (f.life <= 0) {
        flashes.splice(i, 1);
        continue;
      }
      const p = f.life / f.maxLife;
      const r = f.maxR * (1.2 - p * 0.6);
      const g = ctx!.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
      g.addColorStop(0, `rgba(255, 250, 230, ${0.9 * p})`);
      g.addColorStop(0.35, `rgba(255, 180, 70, ${0.55 * p})`);
      g.addColorStop(1, "rgba(255, 100, 20, 0)");
      ctx!.fillStyle = g;
      ctx!.beginPath();
      ctx!.arc(f.x, f.y, r, 0, Math.PI * 2);
      ctx!.fill();
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.life -= dt;
      if (r.life <= 0) {
        rings.splice(i, 1);
        continue;
      }
      const p = r.life / r.maxLife;
      const radius = r.maxR * (1 - p);
      ctx!.strokeStyle = `hsla(${r.hue}, 100%, 65%, ${0.7 * p})`;
      ctx!.lineWidth = 3 * p + 0.5;
      ctx!.beginPath();
      ctx!.arc(r.x, r.y, radius, 0, Math.PI * 2);
      ctx!.stroke();
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.vx *= Math.pow(p.drag, dt * 60);
      p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const frac = p.life / p.maxLife;
      const size = p.shrink ? p.size * frac : p.size;
      ctx!.fillStyle = `hsla(${p.hue}, ${p.sat}%, ${p.light}%, ${frac})`;
      ctx!.beginPath();
      ctx!.arc(p.x, p.y, Math.max(size, 0.3), 0, Math.PI * 2);
      ctx!.fill();
    }

    raf = requestAnimationFrame(tick);
  }
  raf = requestAnimationFrame(tick);

  return {
    laser(x1, y1, x2, y2, hue, onImpact) {
      beams.push({ x1, y1, x2, y2, t: 0, fade: 1, hue, impactFired: false, onImpact });
    },
    explosion(x, y, scale = 1) {
      flashes.push({ x, y, life: 0.22, maxLife: 0.22, maxR: 70 * scale });
      rings.push({ x, y, r: 0, maxR: 90 * scale, life: 0.5, maxLife: 0.5, hue: 30 });
      const fireCount = Math.round(46 * scale);
      for (let i = 0; i < fireCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = (40 + Math.random() * 240) * scale;
        spawn({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 30 * scale,
          life: 0.45 + Math.random() * 0.75,
          maxLife: 1.2,
          size: (2 + Math.random() * 4.5) * scale,
          hue: 8 + Math.random() * 42,
          light: 50 + Math.random() * 25,
          gravity: 140,
          drag: 0.96
        });
      }
      // Slow, lingering embers.
      for (let i = 0; i < 10 * scale; i++) {
        const angle = Math.random() * Math.PI * 2;
        spawn({
          x,
          y,
          vx: Math.cos(angle) * 30,
          vy: -20 - Math.random() * 50,
          life: 1 + Math.random(),
          maxLife: 2,
          size: 1.5 + Math.random() * 2,
          hue: 15 + Math.random() * 25,
          light: 60,
          gravity: -10,
          drag: 0.98
        });
      }
    },
    trail(x, y) {
      for (let i = 0; i < 2; i++) {
        spawn({
          x: x + (Math.random() - 0.5) * 6,
          y: y + (Math.random() - 0.5) * 6,
          vx: (Math.random() - 0.5) * 25,
          vy: (Math.random() - 0.5) * 25 + 12,
          life: 0.4 + Math.random() * 0.5,
          maxLife: 0.9,
          size: 0.8 + Math.random() * 1.8,
          hue: 180 + Math.random() * 120,
          sat: 90,
          light: 75
        });
      }
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    }
  };
}
