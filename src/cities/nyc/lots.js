// Building lots for Lower Manhattan, Brooklyn and Jersey City, on Manhattan's tilted grid.
// Same lot format as src/city.js; each lot carries a timeline of phases evaluated on the GPU.
import { mulberry32 } from '../../geo.js';
import { CITY_STYLES } from '../../city.js';
import { GRID_ROT, toWorld, landId, landYear, parkYear, railAt, settleYear, zoneOf } from './geo.js';

const SI = Object.fromEntries(CITY_STYLES.map((s, i) => [s, i]));
const STEP_X = 110, STEP_Z = 80, ROAD = 10;

export function generateNycLots(city) {
  const lots = [];
  let seed = 11;
  for (let i = -70; i <= 70; i++) {
    for (let j = -110; j <= 90; j++) {
      const lx0 = i * STEP_X, lz0 = j * STEP_Z;
      const [cx, cz] = toWorld(lx0 + STEP_X / 2, lz0 + STEP_Z / 2);
      if (cx < -4800 || cx > 7000 || cz < -8200 || cz > 4600) continue;
      const zone = zoneOf(cx, cz);
      if (!zone) continue;
      // level of detail: fine lots downtown, coarse ones in the distant boroughs
      const dist = Math.hypot(cx - 600, cz + 900);
      const far = cx < -2700 || cx > 4200 || cz > 2600 || cz < -6600 || dist > 4200;
      const rows = zone === 'village' || zone === 'bkres' || zone === 'njres';
      const nx = far ? 1 : rows ? (dist < 2400 ? 4 : 2) : 2;
      const nz = far ? 1 : 2;
      const bw = STEP_X - ROAD * 2, bd = STEP_Z - ROAD * 2;
      for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
        seed++;
        const lx = lx0 + ROAD + bw / nx * (a + 0.5), lz = lz0 + ROAD + bd / nz * (b + 0.5);
        const [x, z] = toWorld(lx, lz);
        if (landId(x, z) !== landId(cx, cz)) continue;
        const lot = makeLot(x, z, bw / nx - 3, bd / nz - 3, zone, seed, city.clears);
        if (lot) lots.push(lot);
      }
    }
  }
  return lots;
}

function makeLot(x, z, w, d, zone, seed, clears) {
  if (isFinite(parkYear(x, z))) return null;
  const r = mulberry32(seed * 2654435761);
  let settle = settleYear(x, z);
  if (!isFinite(settle)) return null;
  settle += (r() - 0.5) * 6;
  const ph = [];
  const add = (t, style, h, o = {}) => {
    const prev = ph[ph.length - 1];
    if (prev && t < prev.t + 2) t = prev.t + 2;
    if (t > 2050) return;
    ph.push({ t, st: style == null ? -1 : SI[style], h, fp: o.fp ?? (0.78 + r() * 0.2), crown: o.crown || 0,
      build: o.build ?? (h > 60 ? 2.5 : h > 20 ? 1.2 : 0.6), demo: o.demo ?? 0.8, stack: o.stack || 0 });
  };
  const H = (lo, hi, p = 2) => lo + (hi - lo) * Math.pow(r(), p);
  const rail = railAt(x, z);

  switch (zone) {
    case 'fidi':
      add(Math.min(settle, 1790 + r() * 8), 'brick', H(9, 14, 1));                                  // Federal-era houses & counting rooms
      add(1828 + r() * 40, 'stone', H(15, 26, 1));                                                   // granite & brownstone
      if (r() < 0.55) add(1890 + r() * 40, r() < 0.7 ? 'stone' : 'deco', H(45, 170, 1.8), { crown: r() < 0.45 ? 1 : 0, build: 2 });
      if (r() < 0.14) add(1925 + r() * 8, 'deco', H(140, 270, 1.4), { crown: 1, build: 2.5, fp: 0.9 });
      if (r() < 0.36) add(1957 + r() * 33, r() < 0.5 ? 'mies' : 'modern', H(100, 240, 1.8), { build: 3 });
      if (r() < 0.16) add(2000 + r() * 25, 'glass', H(130, 300, 1.8), { build: 3 });
      if (r() < 0.04) add(2032 + r() * 18, 'future', H(160, 360, 1.6));
      break;
    case 'downtown':                                                                                  // Civic Center, Tribeca, SoHo
      add(settle + 4, 'brick', H(9, 14, 1));
      if (r() < 0.75) add(1848 + r() * 40, r() < 0.5 ? 'industrial' : 'stone', H(20, 36, 1));        // cast-iron lofts & warehouses
      if (r() < 0.15) add(1960 + r() * 40, 'modern', H(60, 180, 1.8));
      if (r() < 0.18) add(2002 + r() * 24, 'glass', H(50, 220, 2));
      if (r() < 0.05) add(2032 + r() * 18, 'future', H(60, 240, 2));
      break;
    case 'village':                                                                                   // Village & Lower East Side
      add(settle + 4, 'brick', H(9, 13, 1));
      if (r() < 0.6) add(1860 + r() * 45, 'brick', H(17, 25, 1));                                    // tenements
      if (r() < 0.07) add(1947 + r() * 28, 'modern', H(40, 70, 1));                                  // housing projects
      if (r() < 0.08) add(2004 + r() * 22, 'glass', H(40, 130, 2));
      if (r() < 0.04) add(2032 + r() * 18, 'future', H(30, 120, 2));
      break;
    case 'midtown':
      add(settle + 4, 'brick', H(9, 14, 1));
      if (r() < 0.6) add(1900 + r() * 35, r() < 0.6 ? 'stone' : 'deco', H(40, 150, 1.6), { crown: r() < 0.4 ? 1 : 0 });
      if (r() < 0.45) add(1955 + r() * 35, r() < 0.5 ? 'mies' : 'modern', H(110, 260, 1.6), { build: 3 });
      if (r() < 0.2) add(2000 + r() * 25, 'glass', H(150, 380, 1.6), { build: 3 });
      if (r() < 0.05) add(2032 + r() * 18, 'future', H(160, 420, 1.6));
      break;
    case 'bpc': {                                                                                     // Battery Park City on new landfill
      const t = Math.max(1982, landYear(x, z) + 4) + r() * 22;
      add(t, t < 1996 ? 'modern' : 'glass', H(55, 150, 1.4), { build: 2.5 });
      break;
    }
    case 'dumbo':
      add(settle + 4, 'brick', H(9, 13, 1));
      if (r() < 0.8) add(1885 + r() * 30, 'industrial', H(28, 55, 1), { stack: r() < 0.2 ? 1 : 0 });
      if (r() < 0.12) add(2008 + r() * 18, 'glass', H(50, 140, 2));
      break;
    case 'downtownbk':
      add(settle + 4, 'brick', H(9, 14, 1));
      if (r() < 0.5) add(1890 + r() * 40, 'stone', H(25, 60, 1));
      if (r() < 0.25) add(2006 + r() * 20, 'glass', H(100, 230, 1.8), { build: 3 });
      if (r() < 0.04) add(2032 + r() * 18, 'future', H(80, 260, 2));
      break;
    case 'njwater':
      if (rail) {
        // the old rail yards become Exchange Place and Newport: a few towers among low blocks
        const t = Math.max(rail.to + 8, 1986) + r() * 30;
        if (r() < 0.16) add(t, 'glass', H(90, 260, 1.4), { build: 3 });
        else if (r() < 0.6) add(t, r() < 0.5 ? 'modern' : 'brick', H(12, 40, 1.5));
      } else {
        add(settle + 4, r() < 0.5 ? 'industrial' : 'brick', H(10, 24, 1), { stack: r() < 0.15 ? 1 : 0 });
        if (r() < 0.08) add(1988 + r() * 36, 'glass', H(50, 200, 2));
      }
      break;
    default:                                                                                          // Brooklyn & Jersey City rowhouses
      add(settle + 8 + r() * 15, r() < 0.8 ? 'brick' : 'stone', H(9, 15, 1.3));
      if (r() < 0.04) add(1950 + r() * 30, 'modern', H(30, 70, 2));
      if (r() < 0.03) add(2032 + r() * 18, 'future', H(15, 60, 2));
  }

  // clear the footprints of hand-made landmarks
  for (const c of clears) {
    if (Math.abs(x - c.x) < c.rx + w / 2 && Math.abs(z - c.z) < c.rz + d / 2) {
      const t0 = c.from - 1.5;
      let i = ph.length;
      while (i > 0 && ph[i - 1].t >= t0) i--;
      ph.length = i;
      ph.push({ t: Math.max(t0, (ph[i - 1]?.t ?? t0) + 0.5), st: -1, h: 0, fp: 1, crown: 0, build: 1, demo: 1, stack: 0 });
    }
  }
  if (!ph.length) return null;
  ph.sort((a, b) => a.t - b.t);
  return { x, z, w, d, ph, burn: 0, ox: 0, oz: 0, rot: GRID_ROT };
}
