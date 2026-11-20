import { project, type Shape } from './geometry';
const CORE = 2800,
  GRAIN_END = CORE + 16000,
  BUCKETS = 96;
function channel(hex: string, index: number) {
  const value = hex.slice(1);
  return parseInt(
    value.length === 3 ? value[index] + value[index] : value.slice(index * 2, index * 2 + 2),
    16,
  );
}
function mixColour(ink: string, paper: string, mix: number) {
  return `rgb(${Math.round(channel(ink, 0) * (1 - mix) + channel(paper, 0) * mix)},${Math.round(channel(ink, 1) * (1 - mix) + channel(paper, 1) * mix)},${Math.round(channel(ink, 2) * (1 - mix) + channel(paper, 2) * mix)})`;
}
export function createRenderer(ctx: CanvasRenderingContext2D) {
  const x = new Float32Array(GRAIN_END),
    y = new Float32Array(GRAIN_END),
    z = new Float32Array(GRAIN_END),
    perspective = new Float32Array(GRAIN_END);
  const tx = new Float32Array(CORE),
    ty = new Float32Array(CORE),
    ox = new Float32Array(CORE),
    oy = new Float32Array(CORE);
  const previous = new Int32Array(CORE),
    links = new Int32Array(GRAIN_END),
    heads = new Int32Array(BUCKETS);
  const view = { x, y, z, perspective, tx, ty, ox, oy, previous };
  const colours = new Array<string>(BUCKETS),
    softColours = new Array<string>(BUCKETS);
  let gradient: CanvasGradient,
    highlight: CanvasGradient,
    lastWidth = -1,
    lastHeight = -1,
    lastInk = '',
    lastPaper = '',
    lastRaise = '';
  function ribbon(shape: Shape, i: number, lens: boolean, cx: number, cy: number) {
    const j = shape.next[i];
    if (j < 0) return;
    const dx = x[j] - x[i],
      dy = y[j] - y[i],
      distance = Math.hypot(dx, dy);
    if (distance < 0.001 || distance > Math.min(lastWidth, lastHeight) * 0.06) return;
    const steps = Math.max(1, Math.ceil(distance / 2)),
      factor = lens ? -0.24 : 1;
    let ax = x[i],
      ay = y[i],
      nx = ox[i],
      ny = oy[i];
    for (let step = 1; step <= steps; step++) {
      const t = step / steps,
        t2 = t * t,
        t3 = t2 * t;
      const h0 = 2 * t3 - 3 * t2 + 1,
        h1 = t3 - 2 * t2 + t,
        h2 = -2 * t3 + 3 * t2,
        h3 = t3 - t2;
      const bx = h0 * x[i] + h1 * distance * tx[i] + h2 * x[j] + h3 * distance * tx[j];
      const by = h0 * y[i] + h1 * distance * ty[i] + h2 * y[j] + h3 * distance * ty[j];
      const mx = ox[i] + (ox[j] - ox[i]) * t,
        my = oy[i] + (oy[j] - oy[i]) * t;
      ctx.moveTo(cx + (ax + nx - cx) * factor, cy + (ay + ny - cy) * factor);
      ctx.lineTo(cx + (bx + mx - cx) * factor, cy + (by + my - cy) * factor);
      ctx.lineTo(cx + (bx - mx - cx) * factor, cy + (by - my - cy) * factor);
      ctx.lineTo(cx + (ax - nx - cx) * factor, cy + (ay - ny - cy) * factor);
      ctx.closePath();
      ax = bx;
      ay = by;
      nx = mx;
      ny = my;
    }
  }
  function grain(shape: Shape, bucket: number, group: number, paper: string) {
    ctx.globalAlpha =
      group === 0
        ? 0.5 + (0.25 * bucket) / (BUCKETS - 1)
        : group === 1
          ? 0.16
          : group === 2
            ? 0.3
            : 0.42;
    ctx.fillStyle = group === 1 ? paper : colours[bucket];
    ctx.beginPath();
    for (let i = heads[bucket]; i !== -1; i = links[i])
      if (i >= CORE && i < GRAIN_END) {
        const g = i - CORE,
          mode = g % 12,
          kind = mode < 9 ? 0 : mode - 8;
        if (kind !== group) continue;
        const radius = Math.max(0.4, Math.min(1.1, shape.grainStyle[g * 4 + 2] * perspective[i]));
        ctx.moveTo(x[i] + radius, y[i]);
        ctx.arc(x[i], y[i], radius, 0, Math.PI * 2);
      }
    ctx.fill();
  }
  function bands(
    shape: Shape,
    first: number,
    end: number,
    cx: number,
    cy: number,
    paper: string,
    glass = false,
  ) {
    for (let bucket = first; bucket < end; bucket++) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = glass ? softColours[bucket] : colours[bucket];
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = heads[bucket]; i !== -1; i = links[i])
        if (i < CORE) ribbon(shape, i, false, cx, cy);
      // Opaque fill/stroke seals subpixel joins without accumulating dark alpha patches.
      ctx.fill();
      ctx.stroke();
      if (!glass) for (let group = 0; group < 4; group++) grain(shape, bucket, group, paper);
    }
  }
  return function draw(
    shape: Shape,
    width: number,
    height: number,
    yaw: number,
    pitch: number,
    ink: string,
    paper: string,
    raise: string,
    lineStrong: string,
  ) {
    if (width <= 0 || height <= 0) return;
    ctx.clearRect(0, 0, width, height);
    const cx = width / 2,
      cy = height / 2,
      radius = Math.min(width, height) * 0.425 * 0.3;
    if (
      width !== lastWidth ||
      height !== lastHeight ||
      ink !== lastInk ||
      paper !== lastPaper ||
      raise !== lastRaise
    ) {
      for (let bucket = 0; bucket < BUCKETS; bucket++) {
        const mix = 0.7 * (1 - bucket / (BUCKETS - 1));
        colours[bucket] = mixColour(ink, paper, mix);
        softColours[bucket] = mixColour(ink, paper, 1 - (1 - mix) * 0.4);
      }
      gradient = ctx.createRadialGradient(
        cx - radius * 0.3,
        cy - radius * 0.35,
        radius * 0.05,
        cx,
        cy,
        radius,
      );
      // Glossy glass: lit upper-left, shadowed body, faint bright rim.
      gradient.addColorStop(0, mixColour(ink, paper, 0.42));
      gradient.addColorStop(0.55, mixColour(ink, raise, 0.8));
      gradient.addColorStop(0.88, mixColour(ink, paper, 0.86));
      gradient.addColorStop(1, mixColour(ink, paper, 0.62));
      highlight = ctx.createRadialGradient(
        cx - radius * 0.33,
        cy - radius * 0.36,
        0,
        cx - radius * 0.33,
        cy - radius * 0.36,
        radius * 0.25,
      );
      highlight.addColorStop(0, 'rgba(255,255,255,.65)');
      highlight.addColorStop(1, 'rgba(255,255,255,0)');
      lastWidth = width;
      lastHeight = height;
      lastInk = ink;
      lastPaper = paper;
      lastRaise = raise;
    }
    project(shape, view, width, height, yaw, pitch);
    heads.fill(-1);
    for (let i = 0; i < GRAIN_END; i++) {
      const depth = i < CORE && shape.next[i] >= 0 ? (z[i] + z[shape.next[i]]) * 0.5 : z[i];
      const bucket = Math.max(0, Math.min(BUCKETS - 1, Math.floor(((depth + 1) / 2) * BUCKETS)));
      links[i] = heads[bucket];
      heads[bucket] = i;
    }
    bands(shape, 0, BUCKETS / 2, cx, cy, paper);
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.globalAlpha = 1;
    ctx.fillStyle = gradient;
    ctx.fill();
    bands(shape, 0, BUCKETS / 2, cx, cy, paper, true);
    ctx.fillStyle = highlight;
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(cx - radius * 0.33, cy - radius * 0.36, radius * 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = mixColour(ink, paper, 0.15);
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let i = 0; i < CORE; i++)
      if (shape.next[i] >= 0 && z[i] + z[shape.next[i]] < 0) ribbon(shape, i, true, cx, cy);
    ctx.fill();
    ctx.restore();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = lineStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.9)';
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.9, Math.PI * 1.06, Math.PI * 1.48);
    ctx.stroke();
    ctx.strokeStyle = lineStrong;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 0.65;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 0.88, Math.PI * 0.1, Math.PI * 0.65);
    ctx.stroke();
    bands(shape, BUCKETS / 2, BUCKETS, cx, cy, paper);
    ctx.globalAlpha = 1;
  };
}
