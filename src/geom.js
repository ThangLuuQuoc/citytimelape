// Small geometry helpers shared by the waterfront, roads and life modules.
import * as THREE from 'three';

// Flat ribbon along a polyline of [x, z] points (roads, rivers, the L structure).
// uv.x runs across (0..1), uv.y along the ribbon in units of `width`.
export function ribbonGeometry(pts, width, y = 0, thickness = 0) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x, z] = pts[i];
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l; dz /= l;
    if (i > 0) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    const nx = -dz * width / 2, nz = dx * width / 2;
    pos.push(x - nx, y, z - nz, x + nx, y, z + nz);
    uv.push(0, acc / width, 1, acc / width);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (thickness > 0) {
    const bottom = g.clone().translate(0, -thickness, 0);
    return mergeTwo(g, bottom);
  }
  return g;
}

function mergeTwo(a, b) {
  const pa = a.attributes.position.array, pb = b.attributes.position.array;
  const pos = new Float32Array(pa.length + pb.length);
  pos.set(pa); pos.set(pb, pa.length);
  const ia = a.index.array, ib = b.index.array;
  const off = pa.length / 3;
  const idx = [...ia];
  for (let i = 0; i < ib.length; i += 3) idx.push(ib[i] + off, ib[i + 2] + off, ib[i + 1] + off);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Resample a polyline every `step` meters, then round the corners (Chaikin).
export function densify(pts, step, smooth = 2) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step));
    for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]);
  }
  let p = out;
  for (let it = 0; it < smooth; it++) {
    const q = [p[0]];
    for (let i = 0; i < p.length - 1; i++) {
      q.push([p[i][0] * 0.75 + p[i + 1][0] * 0.25, p[i][1] * 0.75 + p[i + 1][1] * 0.25]);
      q.push([p[i][0] * 0.25 + p[i + 1][0] * 0.75, p[i][1] * 0.25 + p[i + 1][1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

// Shift a polyline sideways by d (positive = the ribbon's "+" edge, i.e. normal (-dz, dx)).
export function offsetLine(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1];
    const l = Math.hypot(dx, dz) || 1;
    return [p[0] - dz / l * d, p[1] + dx / l * d];
  });
}

// Vertical strip standing on a polyline (dock walls, seawalls). Use a DoubleSide material.
export function wallGeometry(pts, y0, y1) {
  const pos = [], uv = [], idx = [];
  let acc = 0;
  pts.forEach(([x, z], i) => {
    if (i > 0) acc += Math.hypot(x - pts[i - 1][0], z - pts[i - 1][1]);
    pos.push(x, y0, z, x, y1, z);
    uv.push(acc / 4, 0, acc / 4, 1);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Box with its *bottom* at y, centred on x/z (for merging into bigger meshes).
export function box(w, h, d, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y + h / 2, z);
}
export function cyl(rBottom, rTop, h, x = 0, y = 0, z = 0, seg = 12) {
  return new THREE.CylinderGeometry(rTop, rBottom, h, seg).translate(x, y + h / 2, z);
}
export function pyramid(w, h, x = 0, y = 0, z = 0) {
  return new THREE.CylinderGeometry(0, w * Math.SQRT1_2, h, 4, 1).rotateY(Math.PI / 4).translate(x, y + h / 2, z);
}
// Thin bar between two points in the y–z plane at a fixed x (truss diagonals, railings)
export function strut(x, y0, z0, y1, z1, t = 0.35) {
  const dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dy, dz);
  return new THREE.BoxGeometry(t, len, t).rotateX(Math.atan2(dz, dy)).translate(x, (y0 + y1) / 2, (z0 + z1) / 2);
}
