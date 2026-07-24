import { useEffect, useRef } from 'react';
import { useTheme } from './theme';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
};

const LINK_DISTANCE = 140;
const PARTICLE_DENSITY = 11000; // px² per particle
const MAX_PARTICLES = 90;
const MIN_PARTICLES = 28;

function particleCountForArea(width: number, height: number): number {
  const area = width * height;
  return Math.min(MAX_PARTICLES, Math.max(MIN_PARTICLES, Math.floor(area / PARTICLE_DENSITY)));
}

export default function ConnectedDots() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme } = useTheme();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let particles: Particle[] = [];
    let animationId = 0;
    let running = true;
    let width = 0;
    let height = 0;
    let dpr = 1;

    const isDark = theme === 'dark';
    const dotColor = isDark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(10, 10, 10, 0.35)';
    const lineRgb = isDark ? '255, 255, 255' : '10, 10, 10';
    const lineMaxAlpha = isDark ? 0.28 : 0.18;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const count = particleCountForArea(width, height);
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        r: Math.random() * 1.4 + 0.8,
      }));
    };

    const draw = () => {
      if (!running) return;
      ctx.clearRect(0, 0, width, height);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!reducedMotion) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.x < 0 || p.x > width) p.vx *= -1;
          if (p.y < 0 || p.y > height) p.vy *= -1;
          p.x = Math.max(0, Math.min(width, p.x));
          p.y = Math.max(0, Math.min(height, p.y));
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = dotColor;
        ctx.fill();

        for (let j = i + 1; j < particles.length; j++) {
          const q = particles[j];
          const dx = p.x - q.x;
          const dy = p.y - q.y;
          const dist = Math.hypot(dx, dy);
          if (dist >= LINK_DISTANCE) continue;

          const alpha = (1 - dist / LINK_DISTANCE) * lineMaxAlpha;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.strokeStyle = `rgba(${lineRgb}, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      if (!reducedMotion) {
        animationId = requestAnimationFrame(draw);
      }
    };

    resize();
    draw();

    const onResize = () => {
      resize();
      if (reducedMotion) draw();
    };

    window.addEventListener('resize', onResize);

    return () => {
      running = false;
      cancelAnimationFrame(animationId);
      window.removeEventListener('resize', onResize);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      className="connected-dots"
      aria-hidden="true"
    />
  );
}
