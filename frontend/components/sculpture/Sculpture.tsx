'use client';
import { useEffect, useRef, useState } from 'react';
import { makeShape, cloneShape, blendInto } from './geometry';
import { createRenderer } from './renderer';
import styles from './Sculpture.module.css';

type Controls = {
  reforge: (label?: string) => void;
  down: (x: number, y: number) => void;
  move: (x: number, y: number, rect: DOMRect) => void;
  up: (cancelled?: boolean) => void;
  rotate: (x: number, y: number) => void;
};
export default function Sculpture({
  onReady,
  onReforge,
}: {
  onReady?: (reforge: (label?: string) => void) => void;
  onReforge?: (seed: string) => void;
}) {
  const heading = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null),
    controls = useRef<Controls | null>(null);
  const callback = useRef(onReforge);
  const [seed, setSeed] = useState('0x7265666c'),
    [flash, setFlash] = useState(false);
  useEffect(() => {
    callback.current = onReforge;
  }, [onReforge]);
  useEffect(() => {
    const node = canvas.current,
      context = node?.getContext('2d');
    if (!node || !context) return;
    let width = 0,
      height = 0,
      visible = true,
      yaw = 0.3,
      pitch = -0.25,
      vx = 0,
      vy = 0,
      leanX = 0,
      leanY = 0;
    let dragging = false,
      moved = 0,
      px = 0,
      py = 0,
      lastMove = 0,
      previous = 0,
      frame = 0,
      morph = 0,
      morphing = false;
    let current = makeShape(0x7265666c),
      from = current,
      target = current,
      seedNumber = 0x7265666c;
    const motion = matchMedia('(prefers-reduced-motion:reduce)');
    const palette = () => getComputedStyle(document.documentElement);
    let ink = palette().getPropertyValue('--rx-ink').trim(),
      paper = palette().getPropertyValue('--rx-paper').trim(),
      raise = palette().getPropertyValue('--rx-raise').trim(),
      lineStrong = palette().getPropertyValue('--rx-line-strong').trim();
    const draw = createRenderer(context);
    let shownHeading = -1;
    const render = () => {
      draw(current, width, height, yaw + leanX, pitch + leanY, ink, paper, raise, lineStrong);
      const degrees = Math.round(((((yaw * 180) / Math.PI) % 360) + 360) % 360);
      if (heading.current && degrees !== shownHeading) {
        heading.current.textContent = `N ${String(degrees).padStart(2, '0')}°`;
        shownHeading = degrees;
      }
    };
    const cancel = () => {
      cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
    };
    const loop = (time: number) => {
      frame = 0;
      if (!visible || document.hidden) return;
      const dt = Math.min(previous ? time - previous : 16, 40);
      previous = time;
      if (morphing) {
        const t = Math.min((time - morph) / 1200, 1),
          eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
        blendInto(from, target, eased, current);
        if (t === 1) {
          morphing = false;
          current = target;
        }
      }
      if (!motion.matches) {
        if (!dragging) {
          yaw += dt * 0.000075 + (vx * dt) / 16;
          pitch += (vy * dt) / 16;
          vx *= 0.95;
          vy *= 0.95;
        }
        render();
        frame = requestAnimationFrame(loop);
      } else render();
    };
    const start = () => {
      if (!frame && visible && !document.hidden) frame = requestAnimationFrame(loop);
    };
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      width = rect.width;
      height = rect.height;
      const dpr = Math.min(devicePixelRatio, 2);
      node.width = width * dpr;
      node.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      render();
      start();
    });
    observer.observe(node);
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0].isIntersecting;
      if (visible) start();
      else cancel();
    });
    intersection.observe(node);
    const theme = new MutationObserver(() => {
      ink = palette().getPropertyValue('--rx-ink').trim();
      paper = palette().getPropertyValue('--rx-paper').trim();
      raise = palette().getPropertyValue('--rx-raise').trim();
      lineStrong = palette().getPropertyValue('--rx-line-strong').trim();
      render();
    });
    theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    const visibility = () => {
      if (document.hidden) cancel();
      else start();
    };
    const changeMotion = () => {
      if (motion.matches) {
        current = target;
        morphing = false;
      }
      cancel();
      render();
      start();
    };
    document.addEventListener('visibilitychange', visibility);
    motion.addEventListener('change', changeMotion);
    const reforge = (label?: string) => {
      seedNumber = (seedNumber + 0x9e3779b9) >>> 0;
      from = cloneShape(current);
      target = makeShape(seedNumber);
      current = cloneShape(current);
      morph = performance.now();
      morphing = !motion.matches;
      if (motion.matches) current = target;
      const next = label || `0x${seedNumber.toString(16).padStart(8, '0')}`;
      setSeed(next);
      setFlash(!!label);
      callback.current?.(next);
      render();
      start();
    };
    controls.current = {
      reforge,
      down: (x, y) => {
        dragging = true;
        moved = 0;
        px = x;
        py = y;
        vx = vy = 0;
      },
      move: (x, y, rect) => {
        if (dragging) {
          const dx = x - px,
            dy = y - py;
          moved += Math.abs(dx) + Math.abs(dy);
          vx = dx * 0.006;
          vy = dy * 0.006;
          yaw += vx;
          pitch += vy;
          px = x;
          py = y;
          lastMove = performance.now();
          render();
        } else if (!motion.matches) {
          leanX = ((x - rect.left - rect.width / 2) / rect.width) * 0.12;
          leanY = ((y - rect.top - rect.height / 2) / rect.height) * 0.12;
        }
      },
      up: (cancelled = false) => {
        if (!dragging) return;
        dragging = false;
        if (performance.now() - lastMove > 100) vx = vy = 0;
        if (cancelled) {
          vx = vy = 0;
        } else if (moved < 6) reforge();
      },
      rotate: (x, y) => {
        yaw += x;
        pitch += y;
        render();
      },
    };
    render();
    start();
    return () => {
      cancel();
      observer.disconnect();
      intersection.disconnect();
      theme.disconnect();
      motion.removeEventListener('change', changeMotion);
      document.removeEventListener('visibilitychange', visibility);
      controls.current = null;
    };
  }, []);
  useEffect(() => {
    if (controls.current) onReady?.(controls.current.reforge);
  }, [onReady]);
  return (
    <div className={styles.wrap}>
      <div className={`mono micro ${styles.ticks}`} aria-hidden="true">
        <span ref={heading}>N 00°</span>
        <span>REFLEX · 3D</span>
      </div>
      <canvas
        ref={canvas}
        className={styles.canvas}
        role="img"
        aria-label="Generative ink sculpture. Drag to spin, arrow keys to rotate, Enter to reforge."
        tabIndex={0}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          controls.current?.down(e.clientX, e.clientY);
        }}
        onPointerMove={(e) =>
          controls.current?.move(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
        }
        onPointerUp={() => controls.current?.up()}
        onPointerCancel={() => controls.current?.up(true)}
        onKeyDown={(e) => {
          const rotations: Record<string, [number, number]> = {
            ArrowLeft: [-0.12, 0],
            ArrowRight: [0.12, 0],
            ArrowUp: [0, -0.12],
            ArrowDown: [0, 0.12],
          };
          if (rotations[e.key]) {
            e.preventDefault();
            controls.current?.rotate(...rotations[e.key]);
          }
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            controls.current?.reforge();
          }
        }}
      />
      <div className={`mono ${styles.bottom}`}>
        <span>drag · click to reforge</span>
        <span
          className={flash ? styles.flash : ''}
          key={seed}
          onAnimationEnd={() => setFlash(false)}
        >
          seed {seed}
        </span>
      </div>
    </div>
  );
}
