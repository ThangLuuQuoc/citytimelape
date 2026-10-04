// Geography of Lower Manhattan and New York Harbor, in meters.
// Origin ≈ the Battery (40.7033 N, 74.0170 W). +x = east, +z = south (same convention as Chicago).
import { ramp, clamp } from '../../timeline.js';
import { fbm } from '../../geo.js';

export const ll = (lat, lon) => [(lon + 74.0170) * 84330, -(lat - 40.7033) * 111000];

// Manhattan's street grid runs ~29° east of true north
export const GRID_ROT = -0.506;
export const GRID_N = [0.485, -0.875];   // world direction of "uptown"
export const GRID_E = [0.875, 0.485];    // world direction of "crosstown east"
export const toWorld = (lx, lz) => [Math.cos(GRID_ROT) * lx + Math.sin(GRID_ROT) * lz, -Math.sin(GRID_ROT) * lx + Math.cos(GRID_ROT) * lz];
export const uptown = (x, z) => (x - 118) * GRID_N[0] + (z - 300) * GRID_N[1];

// ---------- Manhattan: modern shoreline + how far each point has moved since 1800 ----------
// [x, z, bpcX, bpcZ, earlyX, earlyZ, side]: offsets point back toward the 1800 shore.
// bpc = Battery Park City (1973–1985, built partly from the WTC excavation); early = 19th-century fills.
const MANHATTAN = [
  [118, 300, 0, 0, 40, -110, 'b'], [-152, -133, 0, 0, 130, 0, 'b'],
  [-169, -411, 230, 0, 100, 0, 'w'], [-126, -688, 220, 0, 110, 0, 'w'], [-42, -1077, 210, 0, 100, 0, 'w'],
  [84, -1632, 150, 0, 100, 0, 'w'], [253, -1965, 0, 0, 120, 0, 'w'], [422, -2353, 0, 0, 120, 0, 'w'],
  [506, -3297, 0, 0, 110, 0, 'w'], [548, -4351, 0, 0, 130, 0, 'w'], [675, -5072, 0, 0, 150, 0, 'w'],
  [1012, -6293, 0, 0, 120, 0, 'w'], [1349, -6738, 0, 0, 100, 0, 'w'], [1940, -7626, 0, 0, 0, 0, 'w'],
  [4975, -6183, 0, 0, 0, 0, 'e'], [4132, -5072, 0, 0, -100, 0, 'e'], [3837, -4573, 0, 0, -120, 0, 'e'],
  [3626, -3518, 0, 0, -150, 0, 'e'], [3795, -2853, 0, 0, -200, 0, 'e'], [3626, -1743, 0, 0, -150, 0, 'e'],
  [3204, -855, 0, 0, -120, 0, 'e'], [2108, -633, 0, 0, -60, -60, 'e'], [1560, -466, 0, 0, -80, -80, 'e'],
  [1265, -244, 0, 0, -90, -90, 'e'], [843, -22, 0, 0, -80, -90, 'e'], [379, 255, 0, 0, -50, -80, 'e'],
];
const EARLY = { w: [1810, 1870], e: [1800, 1830], b: [1850, 1872] };

export function manhattan(year) {
  return MANHATTAN.map(([x, z, bx, bz, ex, ez, side]) => {
    const b = 1 - ramp(year, 1973, 1985), e = 1 - ramp(year, ...EARLY[side]);
    return [x + bx * b + ex * e, z + bz * b + ez * e];
  });
}

const circle = (cx, cz, r, n = 14) => Array.from({ length: n }, (_, i) => [cx + Math.cos(i / n * Math.PI * 2) * r, cz + Math.sin(i / n * Math.PI * 2) * r]);

// Static land masses (year ranges where they exist)
export const LANDS = [
  { id: 'brooklyn', from: 0, pts: [[169, 3030], [1518, 1143], [1771, 255], [1982, -78], [2361, -78], [3120, 33], [4132, -855], [4469, -1188],
    [4807, -2964], [4638, -3963], [4891, -4962], [5200, -8000], [14000, -8000], [14000, 9000], [-1000, 9000], [-600, 5500]] },
  { id: 'nj', from: 0, pts: [[-675, -8000], [-675, -4629], [-1100, -2600], [-1349, -1443], [-1518, -744], [-2000, -200], [-2361, 366],
    [-2900, 2500], [-4500, 6000], [-4500, 9000], [-15000, 9000], [-15000, -8000]] },
  { id: 'governors-old', from: 0, pts: circle(130, 1250, 230) },
  { id: 'governors-fill', from: 1906, pts: [[-60, 1060], [380, 1120], [470, 1450], [230, 2080], [-260, 2050], [-380, 1550], [-250, 1180]] },
  { id: 'liberty', from: 0, pts: [[-2480, 1500], [-2250, 1380], [-2150, 1600], [-2380, 1730]] },
  { id: 'ellis-old', from: 0, pts: circle(-1914, 422, 45, 10) },
  { id: 'ellis-fill', from: 1897, pts: [[-2050, 330], [-1800, 300], [-1760, 520], [-2010, 560]] },
];

export function landPolys(year) {
  return [{ id: 'manhattan', pts: manhattan(year) }, ...LANDS.filter(l => year >= l.from)];
}

export function inPoly(pts, x, z) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

const MODERN = landPolys(2050);
export function landId(x, z, polys = MODERN) {
  for (const p of polys) if (inPoly(p.pts, x, z)) return p.id;
  return null;
}
// first year (1800…2050) the point is dry land
export function landYear(x, z) {
  const id = landId(x, z);
  if (!id) return Infinity;
  if (id !== 'manhattan') return LANDS.find(l => l.id === id).from || 1700;
  if (inPoly(manhattan(1800), x, z)) return 1700;
  let lo = 1800, hi = 2050;
  for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (inPoly(manhattan(m), x, z)) hi = m; else lo = m; }
  return hi;
}

// ---------- land use ----------
const rect = (cx, cz, w, d) => ({ cx, cz, w, d });   // rectangles aligned with the street grid
const inGridRect = (r, x, z) => {
  const dx = x - r.cx, dz = z - r.cz;
  return Math.abs(dx * GRID_E[0] + dz * GRID_E[1]) < r.w / 2 && Math.abs(dx * GRID_N[0] + dz * GRID_N[1]) < r.d / 2;
};
const PARKS = [
  { r: rect(835, -1032, 150, 260), from: 1700 },        // City Hall Park
  { r: rect(1661, -3041, 280, 200), from: 1827 },       // Washington Square
  { r: rect(2184, -3607, 150, 210), from: 1839 },       // Union Square
  { r: rect(2488, -4296, 180, 300), from: 1847 },       // Madison Square
  { r: rect(2994, -2564, 200, 210), from: 1834 },       // Tompkins Square
  { r: rect(300, -955, 250, 320), from: 2011.7 },       // 9/11 Memorial plaza
];
export function parkYear(x, z) {
  const id = landId(x, z);
  if (!id) return Infinity;
  for (const p of PARKS) if (inGridRect(p.r, x, z)) return p.from;
  if (id === 'manhattan') {
    const u = uptown(x, z);
    if (u < 300 && x < 420) return Math.max(1800, landYear(x, z) + 2);                        // the Battery
    const ly = landYear(x, z);
    if (ly > 1974 && (x < 40 || u > 2300)) return 1990;                                         // BPC esplanade / Rockefeller Park
    if (u > 1700 && !inPoly(INSET45, x, z) && x < 2000) return 1998;      // Hudson River Park
    if (u > 2000 && u < 4600 && x > 2600 && !inPoly(INSET70, x, z)) return 1939;   // East River Park
  }
  if (id === 'brooklyn' && z > -120 && z < 1150 && x < 2100 && distToPoly(LANDS[0].pts, x, z) < 140) return 2010;   // Brooklyn Bridge Park
  if (id === 'nj' && x < -2000 && z > -300 && z < 2600 && distToPoly(LANDS[1].pts, x, z) < 900) return 1976;      // Liberty State Park
  if (id && id.startsWith('governors')) return 2014;
  if (id === 'liberty' || id.startsWith('ellis')) return 1700;
  return Infinity;
}
function shrink(pts, d) {
  // crude inset: pull every vertex toward the centroid by d meters
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, z]) => { const l = Math.hypot(x - cx, z - cz) || 1; return [x - (x - cx) / l * d, z - (z - cz) / l * d]; });
}
const INSET45 = shrink(manhattan(2050), 45), INSET70 = shrink(manhattan(2050), 70);

export function distToPoly(pts, x, z) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, az] = pts[j], [bx, bz] = pts[i];
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1), 0, 1);
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

export const RAILYARDS = [
  { x0: -2400, x1: -1300, z0: -1400, z1: -150, from: 1850, to: 1978 },   // Pennsylvania & Erie terminals, Jersey City
  { x0: -3000, x1: -2050, z0: -150, z1: 1600, from: 1864, to: 1967 },   // Central Railroad of NJ, Communipaw
];
export function railAt(x, z) {
  for (const r of RAILYARDS) if (x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1 && landId(x, z) === 'nj') return r;
  return null;
}

export function settleYear(x, z) {
  const id = landId(x, z);
  const n = (fbm(x * 0.001 + 7, z * 0.001) - 0.5) * 10;
  let s = Infinity;
  if (id === 'manhattan') {
    const u = uptown(x, z);
    s = u < 1300 ? 1750 : 1797 + (u - 1300) * 0.0105 + n;
  } else if (id === 'brooklyn') s = 1812 + Math.hypot(x - 1800, z + 100) * 0.011 + n;
  else if (id === 'nj') s = 1828 + Math.hypot(x + 1518, z + 744) * 0.012 + n;
  if (!isFinite(s)) return Infinity;
  return Math.max(s, landYear(x, z) + 3);
}

export function zoneOf(x, z) {
  const id = landId(x, z);
  if (!id) return null;
  if (id === 'manhattan') {
    if (landYear(x, z) > 1974) return 'bpc';
    const u = uptown(x, z);
    return u < 1500 ? 'fidi' : u < 2700 ? 'downtown' : u < 5600 ? 'village' : 'midtown';
  }
  if (id === 'brooklyn') {
    if (Math.hypot(x - 2150, z + 150) < 600) return 'dumbo';
    if (Math.hypot(x - 2800, z - 1300) < 900) return 'downtownbk';
    return 'bkres';
  }
  if (id === 'nj') return x > -2500 && z > -3400 && z < 0 ? 'njwater' : 'njres';
  return null;
}

export const REGION = { minX: -6000, maxX: 9000, minZ: -9000, maxZ: 7000 };
export const NYC_LAND = {
  region: REGION, settle: settleYear, park: parkYear, rail: railAt,
  veg: (x, z) => clamp(0.55 + (fbm(x * 0.0012 + 3, z * 0.0012) - 0.5) * 0.8, 0, 1),
  burn: () => 0,
};
