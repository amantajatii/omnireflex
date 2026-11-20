export type Point = [number, number, number];
export type Shape = {
  core: Point[];
  grains: Point[];
  widths: Float32Array;
  next: Int32Array;
  grainStyle: Float32Array;
};
const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: Point, n: number): Point => [a[0] * n, a[1] * n, a[2] * n];
export function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const length = (a: Point) => Math.hypot(...a);
const unit = (a: Point) => mul(a, 1 / (length(a) || 1));
const cross = (a: Point, b: Point): Point => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export function makeShape(seed: number): Shape {
  const r = random(seed),
    curves: { points: Point[]; widths: number[] }[] = [];
  const loops = 4 + Math.floor(r() * 3);
  for (let ring = 0; ring < loops; ring++) {
    const normal = unit([r() * 2 - 1, r() * 2 - 1, r() * 2 - 1]);
    const u = unit(cross(normal, Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])),
      v = cross(normal, u);
    const radius = 0.8 + r() * 0.24,
      phase = r() * Math.PI * 2,
      lobes = 2 + Math.floor(r() * 2),
      thickness = 0.014 + r() * 0.026,
      points: Point[] = [],
      widths: number[] = [];
    for (let j = 0; j <= 360; j++) {
      const t = (j / 360) * Math.PI * 2;
      const rad = radius + 0.12 * Math.sin(t * 3 + phase) + 0.06 * Math.cos(t * 5 - phase);
      points.push(
        add(
          add(mul(u, Math.cos(t) * rad), mul(v, Math.sin(t) * rad)),
          mul(normal, 0.18 * Math.sin(t * 2 + phase)),
        ),
      );
      // Brush-like taper: long hairline runs that swell into a few broad strokes.
      widths.push(0.0025 + thickness * (0.5 + 0.5 * Math.sin(t * lobes + phase)) ** 2.2);
    }
    curves.push({ points, widths });
  }
  for (let bridge = 0; bridge < 2 + (r() > 0.5 ? 1 : 0); bridge++) {
    const a = curves[bridge % loops].points[Math.floor(r() * 360)],
      b = curves[(bridge + 1) % loops].points[Math.floor(r() * 360)];
    const bow: Point = [r() - 0.5, r() - 0.5, r() - 0.5],
      points: Point[] = [],
      widths: number[] = [];
    for (let j = 0; j <= 120; j++) {
      const t = j / 120;
      points.push(add(add(mul(a, 1 - t), mul(b, t)), mul(bow, Math.sin(t * Math.PI))));
      widths.push(0.0025 + 0.02 * Math.sin(t * Math.PI) ** 2);
    }
    curves.push({ points, widths });
  }
  const segments: { a: Point; b: Point; width: number; end: number; curve: number }[] = [];
  let total = 0;
  for (let c = 0; c < curves.length; c++) {
    const curve = curves[c];
    for (let j = 1; j < curve.points.length; j++) {
      const a = curve.points[j - 1],
        b = curve.points[j];
      total += Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      segments.push({ a, b, width: curve.widths[j], end: total, curve: c });
    }
  }
  const curveIds = new Uint8Array(2800);
  const core: Point[] = [],
    widths: number[] = [],
    tangents: Point[] = [];
  let index = 0;
  for (let i = 0; i < 2800; i++) {
    const distance = (total * i) / 2800;
    while (segments[index].end < distance) index++;
    const segment = segments[index],
      previous = index ? segments[index - 1].end : 0,
      t = (distance - previous) / (segment.end - previous);
    curveIds[i] = segment.curve;
    core.push(add(mul(segment.a, 1 - t), mul(segment.b, t)));
    widths.push(segment.width);
    tangents.push(unit(add(segment.b, mul(segment.a, -1))));
  }
  const next = new Int32Array(core.length).fill(-1);
  let first = 0;
  for (let i = 0; i < core.length; i++) {
    if (i + 1 < core.length && curveIds[i] === curveIds[i + 1]) next[i] = i + 1;
    else {
      if (curveIds[i] < loops) next[i] = first;
      first = i + 1;
    }
  }
  let extent = 0;
  for (let i = 0; i < core.length; i++) extent = Math.max(extent, length(core[i]) + widths[i]);
  for (let i = 0; i < core.length; i++) {
    core[i] = mul(core[i], 1 / extent);
    widths[i] /= extent;
  }
  const grains: Point[] = [];
  const grainStyle = new Float32Array(16000 * 4);
  for (let i = 0; i < 16000; i++) {
    const k = (i >> 1) % core.length,
      tangent = tangents[k];
    const u = unit(cross(tangent, Math.abs(tangent[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])),
      v = cross(tangent, u);
    const mode = i % 12,
      side = i & 1 ? 1 : -1,
      at = i * 4;
    grainStyle[at] = mode < 9 ? side * (0.92 + r() ** 2.5 * 1.6) : mode === 11 ? side : r() * 1.6 - 0.8;
    grainStyle[at + 1] = (r() - 0.5) * 0.008;
    grainStyle[at + 2] = 0.45 + r() * 0.55;
    grainStyle[at + 3] = mode === 11 ? side * (1 + r() * 9) : 0;
    const angle = r() * Math.PI * 2,
      radius = widths[k] * (r() < 0.1 ? 1.4 + r() * 3 : 0.85 + r() * 0.4);
    grains.push(
      add(core[k], add(mul(u, Math.cos(angle) * radius), mul(v, Math.sin(angle) * radius))),
    );
  }
  return { core, grains, widths: Float32Array.from(widths), next, grainStyle };
}
export function cloneShape(shape: Shape): Shape {
  return {
    core: shape.core.map((p) => [...p]),
    grains: shape.grains.map((p) => [...p]),
    widths: shape.widths.slice(),
    next: shape.next.slice(),
    grainStyle: shape.grainStyle.slice(),
  };
}
export function blendInto(a: Shape, b: Shape, t: number, out: Shape) {
  for (let i = 0; i < a.core.length; i++) {
    for (let j = 0; j < 3; j++) out.core[i][j] = a.core[i][j] + (b.core[i][j] - a.core[i][j]) * t;
    out.next[i] = t < 0.5 ? a.next[i] : b.next[i];
    out.widths[i] = a.widths[i] + (b.widths[i] - a.widths[i]) * t;
  }
  for (let i = 0; i < a.grains.length; i++)
    for (let j = 0; j < 3; j++)
      out.grains[i][j] = a.grains[i][j] + (b.grains[i][j] - a.grains[i][j]) * t;
  for (let i = 0; i < a.grainStyle.length; i++)
    out.grainStyle[i] = a.grainStyle[i] + (b.grainStyle[i] - a.grainStyle[i]) * t;
}
export function blend(a: Shape, b: Shape, t: number): Shape {
  const out = cloneShape(a);
  blendInto(a, b, t, out);
  return out;
}

export type Projection = Record<
  'x' | 'y' | 'z' | 'perspective' | 'tx' | 'ty' | 'ox' | 'oy',
  Float32Array
> & { previous: Int32Array };
export function project(
  shape: Shape,
  view: Projection,
  width: number,
  height: number,
  yaw: number,
  pitch: number,
) {
  const { x, y, z, perspective, tx, ty, ox, oy, previous } = view;
  const core = shape.core.length;
  const cosineYaw = Math.cos(yaw),
    sineYaw = Math.sin(yaw),
    cosinePitch = Math.cos(pitch),
    sinePitch = Math.sin(pitch);
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  previous.fill(-1);
  for (let i = 0; i < core; i++) {
    const point = shape.core[i];
    const px = point[0] * cosineYaw + point[2] * sineYaw,
      pz = point[2] * cosineYaw - point[0] * sineYaw;
    const py = point[1] * cosinePitch - pz * sinePitch,
      depth = pz * cosinePitch + point[1] * sinePitch,
      p = 5 / (5 - depth);
    x[i] = px * p;
    y[i] = py * p;
    z[i] = depth;
    perspective[i] = p;
    const half = shape.widths[i] * p;
    minX = Math.min(minX, x[i] - half);
    maxX = Math.max(maxX, x[i] + half);
    minY = Math.min(minY, y[i] - half);
    maxY = Math.max(maxY, y[i] + half);
    if (shape.next[i] >= 0) previous[shape.next[i]] = i;
  }
  // Fit the ink, excluding dust, without clipping unusually asymmetric seeds.
  const side = Math.min(width, height),
    extent = Math.max(maxX - minX, maxY - minY, 0.1);
  const scale = Math.min(
    (0.85 * side) / extent,
    (0.48 * side) / Math.max(Math.abs(minX), Math.abs(maxX), Math.abs(minY), Math.abs(maxY), 0.1),
  );
  for (let i = 0; i < core; i++) {
    x[i] = width / 2 + x[i] * scale;
    y[i] = height / 2 + y[i] * scale;
  }
  for (let i = 0; i < core; i++) {
    const before = previous[i],
      after = shape.next[i];
    let ax = before >= 0 ? x[i] - x[before] : 0,
      ay = before >= 0 ? y[i] - y[before] : 0;
    let bx = after >= 0 ? x[after] - x[i] : 0,
      by = after >= 0 ? y[after] - y[i] : 0;
    const al = Math.hypot(ax, ay),
      bl = Math.hypot(bx, by);
    if (al > 0.001) {
      ax /= al;
      ay /= al;
    } else {
      ax = bl > 0.001 ? bx / bl : 1;
      ay = bl > 0.001 ? by / bl : 0;
    }
    if (bl > 0.001) {
      bx /= bl;
      by /= bl;
    } else {
      bx = ax;
      by = ay;
    }
    const length = Math.hypot(ax + bx, ay + by);
    tx[i] = length > 0.001 ? (ax + bx) / length : bx;
    ty[i] = length > 0.001 ? (ay + by) / length : by;
    const miter = Math.min(1.6, 1 / Math.max(0.001, tx[i] * bx + ty[i] * by));
    const half = shape.widths[i] * scale * perspective[i] * miter;
    ox[i] = -ty[i] * half;
    oy[i] = tx[i] * half;
  }
  // Seeded offsets follow each projected vertex and its shared ribbon normal.
  for (let g = 0; g < shape.grains.length; g++) {
    const i = core + g,
      k = (g >> 1) % core,
      at = g * 4;
    const spread = shape.grainStyle[at],
      along = shape.grainStyle[at + 1] * scale * perspective[k],
      dust = shape.grainStyle[at + 3] * perspective[k];
    x[i] = x[k] + ox[k] * spread + tx[k] * along - ty[k] * dust;
    y[i] = y[k] + oy[k] * spread + ty[k] * along + tx[k] * dust;
    z[i] = z[k];
    perspective[i] = perspective[k];
  }
  return scale;
}
