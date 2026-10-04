// Procedural building lots. Every lot carries a timeline of "phases" (wood → brick → tower → …);
// every phase becomes a GPU instance that grows and shrinks with the uYear uniform.
import * as THREE from 'three';
import {
  BLOCK_X, BLOCK_Z, LOOP, mulberry32, settleYear, landYear, parkYear, railyardAt, inBurnZone, fireTime,
  distToRiver, distToBranches, s0, shoreX, inRect, fbm,
} from './geo.js';
import { styleMaterial, timedDepthMaterial } from './materials.js';
import { clamp } from './timeline.js';

export const CITY_STYLES = ['wood', 'brick', 'stone', 'deco', 'industrial', 'modern', 'mies', 'glass', 'white', 'future', 'ruin'];
const SI = Object.fromEntries(CITY_STYLES.map((s, i) => [s, i]));

const EXTENT = { x0: -9500, z0: -8500, z1: 8500 };

function zoneOf(x, z) {
  if (inRect(x, z, LOOP.x0, LOOP.x1, LOOP.z0, LOOP.z1)) return 'loop';
  if (inRect(x, z, 440, 1080, -640, -290)) return 'lse';                       // Lakeshore East
  if (inRect(x, z, -800, 240, -1700, -640)) return 'rivernorth';
  if (inRect(x, z, 240, 1400, -2050, -640)) return 'streeterville';
  if (inRect(x, z, -2200, -800, -1700, 1100)) return 'westloop';
  if (inRect(x, z, -800, 900, 1100, 2700)) return 'southloop';
  const sh = s0(z);
  if (z < -1700 && x > sh - 650) return 'lakefront';
  if (z > 2700 && x > sh - 500 && z < 8000) return 'lakefront';
  if (distToBranches(x, z, 460) < 450) return 'industrial';
  const d = Math.hypot(x - 150, z + 550);
  if (d < 3800) return 'inner';
  return 'outer';
}

export class City {
  constructor(scene, landmarkClears = []) {
    this.lots = [];
    this.clears = landmarkClears;
    this.generate();
    this.buildMeshes(scene);
    this.lastYear = -1;
    this.stackEmitters = [];   // [x, y, z] smokestack tops, refreshed by update()
    this.tallTops = [];        // aviation-light positions
    this.burning = [];         // lots currently on fire
  }

  generate() {
    const zLines = [];
    for (let z = EXTENT.z0; z <= EXTENT.z1; ) {
      zLines.push(z);
      z += (z >= LOOP.z0 - 1 && z < LOOP.z1) ? BLOCK_X : BLOCK_Z;
    }
    const xLines = [];
    for (let x = Math.floor(EXTENT.x0 / BLOCK_X) * BLOCK_X; x < 1500; x += BLOCK_X) xLines.push(x);

    let seed = 1;
    for (let j = 0; j < zLines.length - 1; j++) {
      const za = zLines[j], zb = zLines[j + 1];
      for (let i = 0; i < xLines.length - 1; i++) {
        const xa = xLines[i], xb = xLines[i + 1];
        const cx = (xa + xb) / 2, cz = (za + zb) / 2;
        if (cx > shoreX(cz, 2060) - 30) continue;
        const far = cx < -5200 || Math.abs(cz) > 5500;
        const road = 10;
        const bx0 = xa + road, bx1 = xb - road, bz0 = za + road, bz1 = zb - road;
        const zone = zoneOf(cx, cz);
        // level of detail: dense lots downtown, coarser lots in the distant neighborhoods
        const dist = Math.hypot(cx - 150, cz + 300);
        const nx = far ? 1 : 2;
        const nz = far ? 1 : zb - za > 150 ? (dist < 3500 ? 4 : 2) : 2;
        const lw = (bx1 - bx0) / nx, ld = (bz1 - bz0) / nz;
        for (let a = 0; a < nx; a++) for (let b = 0; b < nz; b++) {
          const x = bx0 + lw * (a + 0.5), z = bz0 + ld * (b + 0.5);
          seed++;
          if (x > shoreX(z, 2060) - 25) continue;
          // leave room for the quays and riverside streets along the downtown river
          const quay = (x > -900 && x < 1250 && z > -800 && z < -480) || (x > -1000 && x < -560 && z > -700 && z < 1600);
          if (distToRiver(x, z, 80) < (quay ? 74 : 52)) continue;
          const lot = this.makeLot(x, z, lw - 3, ld - 3, zone, far, seed);
          if (lot) this.lots.push(lot);
        }
      }
    }
  }

  makeLot(x, z, w, d, zone, far, seed) {
    const r = mulberry32(seed * 2654435761);
    if (parkYear(x, z) < Infinity) return null;
    let settle = settleYear(x, z) + (r() - 0.5) * 6;
    if (!isFinite(settle)) return null;
    const ly = landYear(x, z);
    settle = Math.max(settle, ly + 4);
    const ph = [];
    const add = (t, style, h, o = {}) => {
      if (t > 2060) return;
      const prev = ph[ph.length - 1];
      const gap = prev && prev.st === SI.ruin ? 0.3 : 2;
      if (prev && t < prev.t + gap) t = prev.t + gap;
      if (t > 2060) return;
      ph.push({ t, st: style == null ? -1 : SI[style], h, fp: o.fp ?? (0.72 + r() * 0.25), crown: o.crown || 0,
        build: o.build ?? (h > 60 ? 2.5 : h > 20 ? 1.2 : 0.6), demo: o.demo ?? 0.8, stack: o.stack || 0 });
    };
    const H = (lo, hi, p = 2) => lo + (hi - lo) * Math.pow(r(), p);

    const rail = railyardAt(x, z);
    const burn = inBurnZone(x, z);
    const ft = burn ? fireTime(x, z) : 0;

    // ---------- first wooden city ----------
    if (!rail || settle < rail.from - 2) {
      const woodH = zone === 'loop' ? H(6, 13, 1) : H(4.5, 9, 1);
      add(settle, zone === 'industrial' && r() < 0.5 ? 'industrial' : 'wood', woodH, { stack: zone === 'industrial' && r() < 0.3 ? 1 : 0 });
    }
    if (rail) {
      add(Math.max(rail.from, settle), null, 0, { demo: 1 });
    }

    // the Great Fire: everything standing burns, then rebuilds in brick/stone
    const burned = burn && ft > (ph[0]?.t ?? 9999) && (!rail || ft < rail.from || ft > rail.to);
    if (burned) {
      add(ft, 'ruin', H(1.5, 3.5, 1), { demo: 0.012, build: 0.01, fp: 0.85 });
    }

    const rebuild = burned ? 1872.1 + r() * (zone === 'loop' ? 1.6 : 4) : 0;
    const railEnd = rail ? rail.to + r() * 18 : 0;

    switch (zone) {
      case 'loop': {
        add(burned ? rebuild : 1856 + r() * 12, r() < 0.5 ? 'stone' : 'brick', H(14, 30, 1), { build: 1 });
        if (r() < 0.62) add(1884 + r() * 44, 'stone', H(40, 92, 1.4), { crown: r() < 0.35 ? 1 : 0, build: 2 });
        if (r() < 0.20) add(1924 + r() * 7, 'deco', H(95, 190, 1.5), { crown: 1, build: 2.5, fp: 0.85 + r() * 0.12 });
        else if (r() < 0.14) add(1950 + r() * 18, null, 0); // surface parking era
        if (r() < 0.45) add(1957 + r() * 42, r() < 0.55 ? 'mies' : 'modern', H(70, 300, 2.2), { crown: r() < 0.15 ? 1 : 0, build: 3 });
        if (r() < 0.16) add(2000 + r() * 25, 'glass', H(120, 320, 1.8), { build: 3 });
        if (r() < 0.07) add(2031 + r() * 27, 'future', H(130, 400, 1.8), { build: 3.5, fp: 0.7 + r() * 0.2 });
        break;
      }
      case 'lse': {
        if (rail) add(railEnd, r() < 0.7 ? 'glass' : 'modern', H(80, 260, 1.3), { build: 3 });
        if (r() < 0.12) add(2034 + r() * 24, 'future', H(130, 340, 1.7), { build: 3 });
        break;
      }
      case 'rivernorth': {
        add(burned ? rebuild : 1860 + r() * 15, 'brick', H(10, 22, 1));
        if (r() < 0.45) add(1885 + r() * 35, r() < 0.5 ? 'industrial' : 'brick', H(20, 50, 1), { stack: r() < 0.15 ? 1 : 0 });
        if (r() < 0.15) add(1960 + r() * 35, 'modern', H(50, 180, 2));
        if (r() < 0.35) add(1995 + r() * 31, 'glass', H(60, 230, 1.8), { build: 2.5 });
        if (r() < 0.09) add(2032 + r() * 26, 'future', H(100, 320, 1.8));
        break;
      }
      case 'streeterville': {
        const s = Math.max(settle, landYear(x, z) + 6);
        if (ph.length === 0) add(s, 'brick', H(8, 18, 1));
        if (r() < 0.45) add(Math.max(s + 4, 1915 + r() * 25), r() < 0.5 ? 'stone' : 'deco', H(40, 120, 1.5), { crown: r() < 0.4 ? 1 : 0 });
        if (r() < 0.5) add(1960 + r() * 40, r() < 0.4 ? 'mies' : 'modern', H(80, 260, 1.8), { build: 3 });
        if (r() < 0.3) add(2001 + r() * 25, 'glass', H(100, 300, 1.6), { build: 3 });
        if (r() < 0.09) add(2033 + r() * 25, 'future', H(120, 360, 1.8));
        break;
      }
      case 'westloop': {
        add(burned ? rebuild : settle + 15 + r() * 15, r() < 0.55 ? 'industrial' : 'brick', H(10, 30, 1), { stack: r() < 0.22 ? 1 : 0 });
        if (r() < 0.25) add(1900 + r() * 25, 'industrial', H(25, 50, 1), { stack: r() < 0.3 ? 1 : 0 });
        if (r() < 0.25) add(1965 + r() * 20, null, 0);
        if (r() < 0.35) add(2005 + r() * 21, r() < 0.7 ? 'glass' : 'modern', H(30, 200, 2.2));
        if (r() < 0.14) add(2032 + r() * 26, 'future', H(50, 260, 2.2));
        break;
      }
      case 'southloop': {
        if (rail) {
          add(railEnd, r() < 0.5 ? 'brick' : 'modern', H(10, 80, 2.2));
          if (r() < 0.45) add(Math.max(railEnd + 5, 2000 + r() * 26), 'glass', H(60, 260, 1.7), { build: 3 });
        } else {
          add(burned ? rebuild : settle + 12 + r() * 10, 'brick', H(10, 28, 1));
          if (r() < 0.4) add(1890 + r() * 30, r() < 0.5 ? 'stone' : 'industrial', H(25, 60, 1));
          if (r() < 0.35) add(1998 + r() * 28, 'glass', H(50, 260, 1.8), { build: 3 });
        }
        if (r() < 0.11) add(2033 + r() * 25, 'future', H(80, 300, 1.8));
        break;
      }
      case 'industrial': {
        add(burned ? rebuild : settle + 8 + r() * 15, 'industrial', H(8, 22, 1), { stack: r() < 0.35 ? 1 : 0, fp: 0.85 + r() * 0.13 });
        if (r() < 0.3) add(1905 + r() * 30, 'industrial', H(15, 35, 1), { stack: r() < 0.45 ? 1 : 0, fp: 0.9 });
        if (r() < 0.35) add(1968 + r() * 25, r() < 0.5 ? null : 'modern', r() < 0.5 ? 0 : H(8, 18, 1));
        if (r() < 0.3) add(2004 + r() * 22, r() < 0.5 ? 'glass' : 'brick', H(12, 60, 2));
        if (r() < 0.2) add(2030 + r() * 28, 'future', H(20, 110, 2));
        break;
      }
      case 'lakefront': {
        add(burned ? rebuild : settle + 15 + r() * 15, r() < 0.5 ? 'brick' : 'stone', H(10, 22, 1));
        if (r() < 0.35) add(1912 + r() * 18, r() < 0.5 ? 'stone' : 'deco', H(40, 110, 1.6), { crown: r() < 0.3 ? 1 : 0 });
        if (r() < 0.5) add(1950 + r() * 35, r() < 0.65 ? 'modern' : 'white', H(60, 200, 1.6), { build: 2.5 });
        if (r() < 0.12) add(2002 + r() * 24, 'glass', H(80, 240, 1.8));
        if (r() < 0.08) add(2034 + r() * 24, 'future', H(80, 260, 1.8));
        break;
      }
      default: { // inner / outer neighborhoods: two-flats, three-flats, bungalows
        const inner = zone === 'inner';
        add(burned ? rebuild : settle + 18 + r() * 20, r() < 0.8 ? 'brick' : 'stone', far ? H(7, 11, 1) : H(7, inner ? 18 : 13, 1.3));
        if (inner && r() < 0.12) add(1925 + r() * 70, r() < 0.5 ? 'modern' : 'brick', H(20, 70, 2));
        if (!far && r() < 0.05) add(1960 + r() * 20, null, 0); // urban-renewal clearance
        if (r() < (inner ? 0.07 : 0.035)) add(2032 + r() * 26, 'future', H(15, inner ? 80 : 35, 2));
        break;
      }
    }

    // clear the footprint of hand-made landmarks
    for (const c of this.clears) {
      if (Math.abs(x - c.x) < c.rx + w / 2 && Math.abs(z - c.z) < c.rz + d / 2) {
        const t0 = c.from - 1.5;
        let i = ph.length;
        while (i > 0 && ph[i - 1].t >= t0) i--;
        const keep = ph.slice(0, i);
        ph.length = 0;
        ph.push(...keep);
        add(t0, null, 0, { demo: 1 });
        if (c.to < 2060) {
          // lot is redeveloped after the landmark is gone
          ph.push({ t: c.to + 1.5, st: SI.modern, h: H(60, 160), fp: 0.8, crown: 0, build: 2, demo: 0.8, stack: 0 });
        }
      }
    }

    if (!ph.length) return null;
    ph.sort((a, b) => a.t - b.t);
    return { x, z, w, d, ph, burn: burned ? ft : 0, ox: (r() - 0.5) * 2, oz: (r() - 0.5) * 2 };
  }

  // One InstancedBufferGeometry per facade style; every phase of every lot is an instance whose
  // growth/demolition is evaluated on the GPU from uYear (see TIMED in materials.js).
  buildMeshes(scene) {
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 14).translate(0, 0.5, 0);
    const per = CITY_STYLES.map(() => ({ box: [], time: [], shape: [] }));
    const stacks = { box: [], time: [], shape: [] };
    this.stackList = [];
    this.tallList = [];
    this.burnLots = [];

    for (const l of this.lots) {
      if (l.burn) this.burnLots.push(l);
      for (let i = 0; i < l.ph.length; i++) {
        const p = l.ph[i], next = l.ph[i + 1];
        if (p.st < 0) continue;
        const end = next ? next.t : 1e6;
        const demo = next ? next.demo : 1;
        const fw = l.w * p.fp, fd = l.d * p.fp;
        const x = l.x + l.ox * (l.w - fw) * 0.5, z = l.z + l.oz * (l.d - fd) * 0.5;
        const a = per[p.st];
        a.box.push(x, z, fw, fd); a.time.push(p.t, end, p.build, demo); a.shape.push(p.h, 0, 1, 0);
        const crown = p.crown || p.h > 140;
        if (crown) { a.box.push(x, z, fw, fd); a.time.push(p.t, end, p.build, demo); a.shape.push(p.h, p.crown ? 0.16 : 0.1, 0.62, 0); }
        const top = p.h * (crown ? (p.crown ? 1.16 : 1.1) : 1);
        if (p.h > 150) this.tallList.push({ x, z, y: top + 2, t0: p.t + p.build, t1: end - demo });
        if (p.stack) {
          const sh = 18 + p.h * 0.9, sx = l.x + l.w * 0.35, sz = l.z - l.d * 0.3;
          const t1 = Math.min(end, 1965 + ((l.x * 7.13 + l.z) % 1 + 1) % 1 * 15);
          if (t1 > p.t) {
            stacks.box.push(sx, sz, 3.2, 3.2); stacks.time.push(p.t, t1, p.build, 0.8); stacks.shape.push(sh, 0, 1, 0);
            this.stackList.push({ x: sx, z: sz, y: sh, t0: p.t + p.build, t1 });
          }
        }
      }
    }

    const depth = timedDepthMaterial();
    const make = (src, data, mat, name) => {
      const n = data.box.length / 4;
      const geo = new THREE.InstancedBufferGeometry().copy(src);
      geo.userData = {};   // copy() shares userData by reference
      // full phase list lives on the CPU; the GPU buffers only hold the phases alive in the current window
      geo.userData.all = { box: new Float32Array(data.box), time: new Float32Array(data.time), shape: new Float32Array(data.shape), n };
      for (const k of ['iBox', 'iTime', 'iShape']) {
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(4, n * 4)), 4);
        attr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute(k, attr);
      }
      geo.instanceCount = 0;
      const m = new THREE.Mesh(geo, mat);
      m.customDepthMaterial = depth;
      m.frustumCulled = false;
      m.castShadow = true;
      m.receiveShadow = true;
      m.name = name;
      scene.add(m);
      return m;
    };
    this.meshes = CITY_STYLES.map((name, i) => make(name === 'future' ? cyl : box, per[i], styleMaterial(name, true), 'city-' + name));
    this.meshes.forEach((m, i) => { m.userData.style = CITY_STYLES[i]; });
    this.stacks = make(new THREE.CylinderGeometry(0.35, 0.5, 1, 8).translate(0, 0.5, 0), stacks, styleMaterial('brick', true), 'stacks');
    this.instanceCount = this.meshes.reduce((s, m) => s + m.geometry.userData.all.n, 0);
    this.window = [1, 0];
  }

  setLite(lite) {
    for (const m of this.meshes) m.material = styleMaterial(m.userData.style, true, lite);
  }

  // Copy the phases overlapping [y0, y1] into the GPU buffers.
  compact(y0, y1) {
    this.window = [y0, y1];
    for (const m of [...this.meshes, this.stacks]) {
      const g = m.geometry, all = g.userData.all;
      const B = g.attributes.iBox.array, Ti = g.attributes.iTime.array, S = g.attributes.iShape.array;
      let c = 0;
      for (let i = 0; i < all.n; i++) {
        const o = i * 4;
        if (all.time[o] > y1 || all.time[o + 1] < y0) continue;
        const d = c * 4;
        B[d] = all.box[o]; B[d + 1] = all.box[o + 1]; B[d + 2] = all.box[o + 2]; B[d + 3] = all.box[o + 3];
        Ti[d] = all.time[o]; Ti[d + 1] = all.time[o + 1]; Ti[d + 2] = all.time[o + 2]; Ti[d + 3] = all.time[o + 3];
        S[d] = all.shape[o]; S[d + 1] = all.shape[o + 1]; S[d + 2] = all.shape[o + 2]; S[d + 3] = all.shape[o + 3];
        c++;
      }
      g.instanceCount = c;
      for (const k of ['iBox', 'iTime', 'iShape']) {
        const attr = g.attributes[k];
        if (attr.clearUpdateRanges) { attr.clearUpdateRanges(); attr.addUpdateRange(0, Math.max(4, c * 4)); }
        attr.needsUpdate = true;
      }
    }
  }

  // CPU side only keeps the small lists the particle systems need.
  update(year) {
    const [w0, w1] = this.window;
    if (year < w0 || year > w1) {
      // window reaches further ahead in the direction we're probably moving
      const fwd = year >= this.lastYear;
      this.compact(year - (fwd ? 1 : 6), year + (fwd ? 6 : 1));
    }
    this.stackEmitters.length = 0;
    this.tallTops.length = 0;
    this.burning.length = 0;
    if (year > 1850 && year < 1980) {
      for (const s of this.stackList) if (year > s.t0 && year < s.t1) this.stackEmitters.push(s.x, s.y, s.z);
    }
    if (year > 1920) {
      for (const t of this.tallList) if (year > t.t0 && year < t.t1) this.tallTops.push(t.x, t.y, t.z);
    }
    if (year > 1871.6 && year < 1872) {
      for (const l of this.burnLots) if (year > l.burn - 0.002 && year < l.burn + 0.035) this.burning.push(l);
    }
    this.lastYear = year;
  }
}
