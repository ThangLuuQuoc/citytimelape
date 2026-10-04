// Geography of the Chicago lakefront in meters.
// Origin = State & Madison (the address-grid origin). +x = east (toward the lake), +z = south.
import * as THREE from 'three';
import { smoothstep, clamp } from './timeline.js';

export const MILE = 1609.34;
export const BLOCK_X = 100.6;   // 1/16 mile — north–south streets
export const BLOCK_Z = 201.2;   // 1/8 mile  — east–west streets
export const LOOP = { x0: -800, x1: 240, z0: -640, z1: 1100 };

// ---------- random helpers ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash2(x, z) {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
export function noise2(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, z) {
  return noise2(x, z) * 0.55 + noise2(x * 2.1 + 17, z * 2.1 - 9) * 0.3 + noise2(x * 4.3 - 5, z * 4.3 + 3) * 0.15;
}

// ---------- shoreline ----------
// Original (pre-landfill) shoreline: roughly along today's Michigan Avenue, with the
// sandbar bulge where the river used to bend south before reaching the lake.
export function s0(z) {
  let s = 255 + (noise2(z * 0.004, 3.3) - 0.5) * 30;
  s += 75 * smoothstep(-900, -700, z) * (1 - smoothstep(-20, 120, z));         // sandbar
  s += 0.06 * Math.max(0, z - 1500) + 0.14 * Math.max(0, z - 4500);              // shore trends SE
  s += 50 * smoothstep(-1500, -3500, z);                                          // north shore
  return s;
}

// Landfill campaigns: shoreline grows from s0 toward x between years y0..y1 over z0..z1.
const FILLS = [
  { z0: -560, z1: 1700, x: 430, y0: 1852, y1: 1878, f: 120 },            // IC trestle basin + fire debris
  { z0: -560, z1: 2350, x: 1060, y0: 1895, y1: 1922, f: 160 },           // Grant Park
  { z0: -2000, z1: -700, x: 1120, y0: 1886, y1: 1925, f: 150 },          // Streeterville
  { z0: -900, z1: -500, x: 1360, y0: 1918, y1: 1962, f: 80 },            // river-mouth piers / lock
  { z0: 2350, z1: 3400, x: 1550, y0: 1914, y1: 1931, f: 160 },           // Museum Campus
  { z0: 3400, z1: 12000, x: z => s0(z) + 720, y0: 1920, y1: 1942, f: 200 }, // Burnham Park
  { z0: -14000, z1: -2000, x: z => s0(z) + 560, y0: 1868, y1: 1945, f: 220 }, // Lincoln Park
];

export function shoreX(z, year) {
  const base = s0(z);
  let s = base;
  for (const f of FILLS) {
    const w = smoothstep(f.z0 - f.f, f.z0 + f.f, z) * (1 - smoothstep(f.z1 - f.f, f.z1 + f.f, z));
    if (w <= 0) continue;
    const p = smoothstep(f.y0, f.y1, year);
    if (p <= 0) continue;
    const tx = typeof f.x === 'function' ? f.x(z) : f.x;
    s = Math.max(s, base + (tx - base) * p * w);
  }
  return s;
}

// First year the point (x,z) is dry land.
export function landYear(x, z) {
  if (x < s0(z) - 2) return 1700;
  if (shoreX(z, 2060) <= x) return Infinity;
  let lo = 1700, hi = 2060;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    if (shoreX(z, mid) > x) hi = mid; else lo = mid;
  }
  return hi;
}

// Water surface sits below street level: the river runs between dock walls, the lake behind seawalls.
export const WATER_Y = -3.2;

// ---------- rivers ----------
const WOLF = [-700, -650];
export const NORTH_BRANCH = [WOLF, [-760, -1100], [-950, -1700], [-1250, -2400], [-1500, -3200],
  [-1700, -4200], [-2000, -5500], [-2600, -7000], [-3200, -9000], [-3600, -12000]];
export const SOUTH_BRANCH = [WOLF, [-760, 0], [-780, 600], [-785, 1400], [-830, 2000], [-1000, 2600],
  [-1500, 3100], [-2300, 3500], [-3200, 3700], [-4500, 4200], [-6500, 4700], [-9000, 5200], [-13000, 5600]];

export function mainBranch(year) {
  const pts = [WOLF, [-400, -642], [-100, -640], [150, -640]];
  if (year < 1833) {
    // River turns south behind the sandbar and enters the lake near Madison St.
    pts.push([215, -610], [245, -500], [255, -300], [262, -110], [300, -30], [420, 0]);
  } else {
    const end = shoreX(-640, year) + 30;
    pts.push([end, -640]);
  }
  return pts;
}

// x of the South Branch at a given z (the branch runs roughly north–south past the Loop)
export function southBranchX(z) {
  const p = SOUTH_BRANCH;
  for (let i = 0; i < p.length - 1; i++) {
    const [ax, az] = p[i], [bx, bz] = p[i + 1];
    if (z >= Math.min(az, bz) && z <= Math.max(az, bz)) return ax + (bx - ax) * (z - az) / ((bz - az) || 1);
  }
  return p[p.length - 1][0];
}

export function riverPaths(year) {
  return [
    { pts: mainBranch(year), w: year < 1833 ? 48 : 64 },
    { pts: NORTH_BRANCH, w: 52 },
    { pts: SOUTH_BRANCH, w: 58 },
  ];
}

// cap: callers only care about distances below it, so far segments are rejected by bounding box
export function distToPolyline(x, z, pts, cap = Infinity) {
  let best = cap;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    if (x < Math.min(ax, bx) - best || x > Math.max(ax, bx) + best || z < Math.min(az, bz) - best || z > Math.max(az, bz) + best) continue;
    const dx = bx - ax, dz = bz - az;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz), 0, 1);
    const ex = ax + dx * t - x, ez = az + dz * t - z;
    best = Math.min(best, Math.hypot(ex, ez));
  }
  return best;
}
const MAIN_FINAL = mainBranch(2060);
export function distToRiver(x, z, cap = 2000) {
  return Math.min(distToPolyline(x, z, MAIN_FINAL, cap), distToPolyline(x, z, NORTH_BRANCH, cap), distToPolyline(x, z, SOUTH_BRANCH, cap));
}
export function distToBranches(x, z, cap = 2000) {
  return Math.min(distToPolyline(x, z, NORTH_BRANCH, cap), distToPolyline(x, z, SOUTH_BRANCH, cap));
}

// ---------- land use ----------
export function inRect(x, z, x0, x1, z0, z1) { return x >= x0 && x <= x1 && z >= z0 && z <= z1; }

// Year the point becomes parkland (Infinity = never)
export function parkYear(x, z) {
  if (inRect(x, z, 235, 640, -290, 180)) return 2004;                     // Millennium Park
  if (x > 235 && z > -290 && z < 2420) return Math.max(1847, landYear(x, z) + 3); // Grant Park
  if (z < -3220 && x > s0(z) - 480) return Math.max(1864, landYear(x, z) + 4);    // Lincoln Park
  const ly = landYear(x, z);
  if (ly > 1880 && ly < Infinity) {
    const streeterville = z > -2050 && z < -640;
    const lakeshoreEast = z >= -640 && z < -290 && x < 1080;
    if (!streeterville && !lakeshoreEast) return ly + 4;
  }
  return Infinity;
}

// Rail yards: no buildings during [from, to)
export const RAILYARDS = [
  { x0: -720, x1: 160, z0: 1120, z1: 2380, from: 1852, to: 1978 },   // south-Loop terminals
  { x0: 440, x1: 1060, z0: -640, z1: -300, from: 1880, to: 1996 },   // IC yards → Lakeshore East
];
export function railyardAt(x, z) {
  for (const r of RAILYARDS) if (inRect(x, z, r.x0, r.x1, r.z0, r.z1)) return r;
  return null;
}

// Smooth urbanization year (the ground turns from prairie to city)
export function settleYear(x, z) {
  const ly = landYear(x, z);
  if (ly === Infinity) return Infinity;
  const dx = x - 150, dz = (z + 550) * 0.9;
  const d = Math.hypot(dx, dz);
  let s = 1830 + 22 * Math.pow(d / 1500, 0.65) + (fbm(x * 0.0009, z * 0.0009) - 0.5) * 12;
  return Math.max(s, ly + 3);
}

// ---------- 1871 Great Fire ----------
const FIRE_ORIGIN = [-1150, 2210];   // O'Leary barn, DeKoven St
export const FIRE_START = 1871.70;
export const FIRE_SPAN = 0.24;
export function inBurnZone(x, z) {
  if (inRect(x, z, -1210, -790, -100, 2215)) return true;                         // West Side strip
  if (x > -790 && z > -640 && z < 2200 - (x + 790) * 0.9) return true;            // South Side / Loop
  if (z <= -640 && z > -4830 && x > -900 - (-z - 640) * 0.15) return true;        // North Side
  return false;
}
export function fireTime(x, z) {
  const d = Math.hypot(x - FIRE_ORIGIN[0], z - FIRE_ORIGIN[1]);
  return FIRE_START + FIRE_SPAN * clamp(d / 7600, 0, 1) + hash2(x * 0.01, z * 0.01) * 0.01;
}

// ---------- vegetation of 1700: 0 = wetland, .5 = prairie, 1 = forest ----------
export function vegetation(x, z) {
  const dr = distToRiver(x, z, 650);
  let v = 0.5 + (fbm(x * 0.0011 + 40, z * 0.0011) - 0.5) * 0.9;
  v += 0.55 * (1 - smoothstep(80, 420, dr));                     // gallery forest along rivers
  v -= 0.5 * smoothstep(-1200, -2600, x) * smoothstep(400, 1800, z); // Mud Lake / portage marsh
  v -= 0.25 * smoothstep(60, 260, dr) * (1 - smoothstep(260, 600, dr)) * (z > 0 ? 1 : 0.2);
  return clamp(v, 0, 1);
}

// ---------- GPU data textures ----------
export const REGION = { minX: -12000, maxX: 4000, minZ: -10000, maxZ: 10000 };

// src lets another city supply its own land use (defaults to Chicago)
export const CHICAGO_LAND = {
  region: REGION, settle: settleYear, park: parkYear, rail: railyardAt, veg: vegetation,
  burn: (x, z) => (inBurnZone(x, z) ? fireTime(x, z) : 0),
};
export function buildLandTexture(size = 512, src = CHICAGO_LAND) {
  const { minX, maxX, minZ, maxZ } = src.region;
  const data = new Uint16Array(size * size * 4);
  const h = THREE.DataUtils.toHalfFloat;
  for (let j = 0; j < size; j++) {
    const z = minZ + (j + 0.5) / size * (maxZ - minZ);
    for (let i = 0; i < size; i++) {
      const x = minX + (i + 0.5) / size * (maxX - minX);
      const k = (j * size + i) * 4;
      const sy = src.settle(x, z);
      const py = src.park(x, z);
      const ry = src.rail(x, z);
      data[k] = h(Math.min(sy, 3000));
      data[k + 1] = h(py === Infinity ? 0 : py);
      data[k + 2] = h(src.burn(x, z));
      // vegetation in [0,1]; railyard flag encoded as +2 during its years (decoded in shader)
      data[k + 3] = h(src.veg(x, z) + (ry ? 2 + (ry.to - 1800) / 1000 : 0));
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

export const SHORE_TEX = { minZ: -20000, maxZ: 20000, size: 1024 };
export function createShoreTexture() {
  const data = new Uint16Array(SHORE_TEX.size * 4);
  const tex = new THREE.DataTexture(data, SHORE_TEX.size, 1, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
export function updateShoreTexture(tex, year) {
  const { minZ, maxZ, size } = SHORE_TEX;
  const d = tex.image.data;
  const h = THREE.DataUtils.toHalfFloat;
  for (let i = 0; i < size; i++) {
    const z = minZ + (i + 0.5) / size * (maxZ - minZ);
    d[i * 4] = h(shoreX(z, year));
  }
  tex.needsUpdate = true;
}
