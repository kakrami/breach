const rad = (d) => (d * Math.PI) / 180;
export function rayBox(origin, dir, p, max = 60) {
  const a = rad(p.rot || 0),
    c = Math.cos(a),
    s = Math.sin(a),
    dx = origin.x - p.x,
    dz = origin.z - p.z;
  const o = [dx * c + dz * s, origin.y, -dx * s + dz * c],
    d = [dir.x * c + dir.z * s, dir.y, -dir.x * s + dir.z * c];
  const lo = [-p.w / 2, p.minY ?? p.bottomY, -p.d / 2],
    hi = [p.w / 2, p.maxY ?? p.topY, p.d / 2];
  let near = 0,
    far = max,
    axis = -1,
    sign = 0;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo[i] || o[i] > hi[i]) return null;
      continue;
    }
    let t0 = (lo[i] - o[i]) / d[i],
      t1 = (hi[i] - o[i]) / d[i],
      n = -1;
    if (t0 > t1) {
      [t0, t1] = [t1, t0];
      n = 1;
    }
    if (t0 > near) {
      near = t0;
      axis = i;
      sign = n;
    }
    far = Math.min(far, t1);
    if (near > far) return null;
  }
  if (axis < 0 || near < 0.02 || near > max) return null;
  const n = [0, 0, 0];
  n[axis] = sign;
  return {
    t: near,
    x: origin.x + dir.x * near,
    y: origin.y + dir.y * near,
    z: origin.z + dir.z * near,
    nx: n[0] * c - n[2] * s,
    ny: n[1],
    nz: n[0] * s + n[2] * c,
  };
}
function boxFor(p) {
  if (p.type === "round") return { ...p, w: p.r * 2, d: p.r * 2 };
  return p;
}
export function boxesOverlap(a, b, skin = 0.045) {
  if (
    (a.maxY ?? a.topY) <= (b.minY ?? b.bottomY) + skin ||
    (b.maxY ?? b.topY) <= (a.minY ?? a.bottomY) + skin
  )
    return false;
  const aa = rad(a.rot || 0),
    ba = rad(b.rot || 0),
    axes = [
      [Math.cos(aa), Math.sin(aa)],
      [-Math.sin(aa), Math.cos(aa)],
      [Math.cos(ba), Math.sin(ba)],
      [-Math.sin(ba), Math.cos(ba)],
    ];
  for (const [x, z] of axes) {
    const ar =
        (Math.abs(x * Math.cos(aa) + z * Math.sin(aa)) * a.w) / 2 +
        (Math.abs(-x * Math.sin(aa) + z * Math.cos(aa)) * a.d) / 2,
      br =
        (Math.abs(x * Math.cos(ba) + z * Math.sin(ba)) * b.w) / 2 +
        (Math.abs(-x * Math.sin(ba) + z * Math.cos(ba)) * b.d) / 2;
    if (Math.abs((a.x - b.x) * x + (a.z - b.z) * z) >= ar + br - skin)
      return false;
  }
  return true;
}

// Conservative broad-phase bounds only; final picking/validation still tests compiled parts.
export function partsBounds(parts) {
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity,
    maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;
  for (const p of parts) {
    const a = rad(p.rot || 0),
      c = Math.abs(Math.cos(a)),
      s = Math.abs(Math.sin(a)),
      w = p.w || p.r * 2,
      d = p.d || p.r * 2,
      lo = p.minY ?? p.bottomY,
      hi = p.maxY ?? p.topY;
    if (!Number.isFinite(w + d + lo + hi)) continue;
    const hx = (w * c + d * s) / 2,
      hz = (w * s + d * c) / 2;
    minX = Math.min(minX, p.x - hx);
    maxX = Math.max(maxX, p.x + hx);
    minZ = Math.min(minZ, p.z - hz);
    maxZ = Math.max(maxZ, p.z + hz);
    minY = Math.min(minY, lo);
    maxY = Math.max(maxY, hi);
  }
  return Number.isFinite(minX)
    ? {
        x: (minX + maxX) / 2,
        z: (minZ + maxZ) / 2,
        w: maxX - minX,
        d: maxZ - minZ,
        minY,
        maxY,
        rot: 0,
      }
    : null;
}
