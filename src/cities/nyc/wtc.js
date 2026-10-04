// The World Trade Center: the Twin Towers (1970–2001), the morning of September 11, 2001 told in slowed,
// real clock time, Ground Zero, the Memorial, the Tribute in Light, and the rebuilt One World Trade Center.
// Shown as a documentary reconstruction: aircraft, fire, smoke and dust — no people are depicted.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { styleMaterial } from '../../materials.js';
import { box } from '../../geom.js';
import { yearOf, clamp, smoothstep, calendarOf, clockText } from '../../timeline.js';
import { GRID_ROT, GRID_N, GRID_E } from './geo.js';

const SEC = 1 / (365 * 86400);                         // one second in fractional years
export const DAY = yearOf(2001, 9, 11);                 // 00:00 on September 11, 2001
const at = (h, m, s = 0) => yearOf(2001, 9, 11, h, m, s);
export const T = {
  impact1: at(8, 46, 40),     // American Airlines Flight 11 → North Tower, floors 93–99
  impact2: at(9, 3, 2),       // United Airlines Flight 175 → South Tower, floors 77–85
  collapseS: at(9, 58, 59),   // South Tower collapses (56 min after impact)
  collapseN: at(10, 28, 22),  // North Tower collapses (102 min after impact)
  collapse7: at(17, 20, 33),  // 7 World Trade Center collapses
  dayEnd: yearOf(2001, 9, 12),
  cleanup: yearOf(2002, 5, 30),
};
const COLLAPSE_S = 11;        // seconds each tower took to come down (approximately)

// Seconds of event time per real second, so the key moments play out slowly
const PACE = [
  [0, 1800], [8 * 3600 + 30 * 60, 60], [8 * 3600 + 45 * 60 + 20, 8], [8 * 3600 + 47 * 60 + 40, 60],
  [9 * 3600 + 1 * 60 + 50, 8], [9 * 3600 + 4 * 60 + 10, 150], [9 * 3600 + 58 * 60 + 20, 6], [10 * 3600 + 0 * 60 + 30, 150],
  [10 * 3600 + 27 * 60 + 40, 6], [10 * 3600 + 29 * 60 + 50, 240], [11 * 3600 + 30 * 60, 1800], [17 * 3600 + 18 * 60, 20],
  [17 * 3600 + 23 * 60, 1800], [20 * 3600, 3600],
];
const secOfDay = (year) => (year - DAY) / SEC;
export function wtcSpeedCap(year) {
  if (year < DAY || year >= T.dayEnd) return Infinity;
  const s = secOfDay(year);
  let rate = PACE[0][1];
  for (const [t, r] of PACE) if (s >= t) rate = r;
  return rate * SEC;
}

const CAPTIONS = [
  [at(0, 0), 'Tuesday, September 11, 2001. A clear late-summer morning over Lower Manhattan.'],
  [T.impact1, '08:46 — American Airlines Flight 11 is flown into the North Tower, floors 93–99.'],
  [at(8, 50), 'The North Tower burns. Evacuation of the World Trade Center begins.'],
  [T.impact2, '09:03 — United Airlines Flight 175 is flown into the South Tower, floors 77–85.'],
  [at(9, 37, 46), '09:37 — In Washington, American Airlines Flight 77 strikes the Pentagon.'],
  [T.collapseS, '09:59 — The South Tower collapses, 56 minutes after it was struck.'],
  [at(10, 3, 11), '10:03 — United Airlines Flight 93 crashes near Shanksville, Pennsylvania.'],
  [T.collapseN, '10:28 — The North Tower collapses, 102 minutes after it was struck.'],
  [at(10, 50), 'Dust and smoke cover Lower Manhattan. Thousands walk north and across the bridges.'],
  [T.collapse7, '17:20 — 7 World Trade Center collapses after burning for seven hours.'],
  [at(18, 30), 'In memory of the 2,977 people killed on September 11, 2001 — 2,753 of them in New York.', true],
];
export function wtcClock(year) {
  if (year < DAY || year >= T.dayEnd) return null;
  const c = calendarOf(year);
  let cap = CAPTIONS[0];
  for (const k of CAPTIONS) if (year >= k[0]) cap = k;
  return { label: `Sep 11 · ${clockText(c.hours, true)}`, caption: cap[1], memorial: !!cap[2] };
}
export const wtcTod = (year) => (year >= DAY && year < T.dayEnd ? secOfDay(year) / 3600 : null);

// ---------- positions (meters; tower faces follow the street grid) ----------
const NORTH = { x: 304, z: -1043, h: 417, impactY: [352, 377], label: '1 World Trade Center (North Tower)' };
const SOUTH = { x: 287, z: -866, h: 415, impactY: [292, 323], label: '2 World Trade Center (South Tower)' };
const W = 63.4;
const local = (o, e, n, y = 0) => new THREE.Vector3(o.x + GRID_E[0] * e + GRID_N[0] * n, y, o.z + GRID_E[1] * e + GRID_N[1] * n);

// Other buildings of the complex, in the regular landmark format (they vanish at their destruction time)
export const WTC_LANDMARKS = [
  { id: 'wtc3', x: 222, z: -800, rot: GRID_ROT, from: 1979, to: T.collapseS, demo: 20 * SEC, build: 2, label: () => 'Marriott World Trade Center (3 WTC)',
    make: k => { k.box(50, 75, 30, 'wtc'); } },
  { id: 'wtc4', x: 370, z: -800, rot: GRID_ROT, from: 1975, to: T.collapseS, demo: 20 * SEC, build: 1.5,
    make: k => { k.box(105, 36, 50, 'granite'); } },
  { id: 'wtc5', x: 385, z: -1050, rot: GRID_ROT, from: 1972, to: T.collapseN, demo: 20 * SEC, build: 1.5,
    make: k => { k.box(105, 36, 60, 'granite'); } },
  { id: 'wtc6', x: 225, z: -1110, rot: GRID_ROT, from: 1974, to: T.collapseN, demo: 20 * SEC, build: 1.5,
    make: k => { k.box(60, 30, 60, 'granite'); } },
  { id: 'wtc7old', x: 413, z: -1121, rot: GRID_ROT, from: 1985, to: T.collapse7, demo: 7 * SEC, build: 2.2, major: true, label: () => '7 World Trade Center',
    make: k => { k.taper(100, 45, 100, 45, 186, 'granite'); } },
  { id: 'wtc7new', x: 413, z: -1121, rot: GRID_ROT, from: 2003.5, to: 9999, build: 2.9, label: () => '7 World Trade Center (rebuilt)',
    make: k => { k.box(95, 226, 40, 'glass'); } },
  { id: 'onewtc', x: 321, z: -1077, rot: GRID_ROT, from: 2006.3, to: 9999, build: 7.2, major: true, label: () => 'One World Trade Center',
    make: k => {
      k.box(62, 56, 62, 'glass');                                                    // podium
      // two tapering square shafts, one turned 45°: the chamfered, octagonal silhouette (roof 417 m)
      k.taper(62, 62, 44, 44, 361, 'glass', 0, 56, 0);
      k.taper(44, 44, 44, 44, 361, 'glass', 0, 56, 0, Math.PI / 4);
      k.box(30, 8, 30, 'steel', 0, 417, 0);
      k.cyl(1.4, 116, 'steel', 0, 425, 0, 8, 0.6);                                 // spire to 541 m (1,776 ft)
      k.glow(new THREE.SphereGeometry(2.2, 8, 6).translate(0, 541, 0), 0xffffff, 4);
    } },
  { id: 'wtc4new', x: 455, z: -760, rot: GRID_ROT, from: 2010.2, to: 9999, build: 3.6, label: () => '4 World Trade Center',
    make: k => { k.box(60, 298, 40, 'glass'); } },
  { id: 'wtc3new', x: 430, z: -860, rot: GRID_ROT, from: 2014.5, to: 9999, build: 3.9, label: () => '3 World Trade Center',
    make: k => { k.box(55, 329, 45, 'glass'); for (const s of [-1, 1]) k.box(2, 300, 2, 'steel', s * 27, 0, 22); } },
  { id: 'oculus', x: 470, z: -945, rot: GRID_ROT, from: 2013.5, to: 9999, build: 2.7, label: () => 'Oculus',
    make: k => {
      k.mesh(new THREE.SphereGeometry(1, 24, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(55, 16, 28), 'white');
      for (let i = -8; i <= 8; i++) for (const s of [-1, 1]) {
        const rib = new THREE.BoxGeometry(1.4, 38, 2.4).translate(0, 19, 0).rotateZ(s * 0.62).translate(i * 6, 8, s * 6);
        k.mesh(rib, 'white');
      }
    } },
  { id: 'museum', x: 335, z: -950, rot: GRID_ROT, from: 2011.5, to: 9999, build: 2.9, label: () => '9/11 Memorial & Museum',
    make: k => { k.taper(40, 24, 34, 20, 22, 'glass', 0, 0, 0, 0.2); } },
];

// ---------- aircraft ----------
function makePlane() {
  const fus = new THREE.CylinderGeometry(2.6, 2.6, 48, 12).rotateX(Math.PI / 2);
  const nose = new THREE.SphereGeometry(2.6, 12, 8).scale(1, 1, 1.6).translate(0, 0, -24);
  const wing = box(47.6, 0.6, 8, 0, -1, 2).translate(0, 0, 0);
  const tail = box(1, 9, 6, 0, 1.5, 20);
  const stab = box(18, 0.5, 4, 0, 2, 22);
  const eng = [-8, 8].map(x => new THREE.CylinderGeometry(1.4, 1.4, 5, 10).rotateX(Math.PI / 2).translate(x, -2.2, -2));
  const g = mergeGeometries([fus, nose, wing, tail, stab, ...eng].map(x => x.index ? x.toNonIndexed() : x));
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xd9dde2, metalness: 0.5, roughness: 0.35 }));
  m.castShadow = true;
  m.visible = false;
  return m;
}

// Flight paths: straight run down the Hudson corridor (AA11), banking turn in from the harbor (UA175).
const IMPACT1 = local(NORTH, 0, W / 2, 365);
const IMPACT2 = local(SOUTH, 14, -W / 2, 308);
const PATH1 = (() => {
  const d = new THREE.Vector3(-GRID_N[0], 0, -GRID_N[1]).normalize();          // flying "downtown", head-on into the north face
  return (s) => ({ p: IMPACT1.clone().addScaledVector(d, -s).add(new THREE.Vector3(0, s * 0.035, 0)), d, roll: 0 });
})();
const CURVE2 = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-7200, 1400, 9200), new THREE.Vector3(-3600, 1000, 5600), new THREE.Vector3(-1400, 680, 2600),
  local(SOUTH, 14, -W / 2 - 700, 360), IMPACT2,
]);
const LEN2 = CURVE2.getLength();
const PATH2 = (s) => {
  const u = clamp(1 - s / LEN2, 0, 1);
  const p = CURVE2.getPointAt(u), d = CURVE2.getTangentAt(Math.min(0.999, u));
  return { p, d, roll: -0.65 * smoothstep(0.55, 0.95, u) };
};

export class WTC {
  constructor(scene, life) {
    this.life = life;
    this.towers = [NORTH, SOUTH].map((t, i) => {
      const g = new THREE.Group();
      g.position.set(t.x, 0, t.z);
      g.rotation.y = GRID_ROT;
      const lowerH = t.impactY[0];
      const lower = new THREE.Mesh(box(W, 1, W), styleMaterial('wtc'));
      lower.scale.y = lowerH;
      const upper = new THREE.Group();
      const upperMesh = new THREE.Mesh(box(W, t.h - lowerH, W), styleMaterial('wtc'));
      upper.add(upperMesh);
      upper.position.y = lowerH;
      if (i === 0) {
        const mast = new THREE.Mesh(mergeGeometries([new THREE.CylinderGeometry(1.2, 2.4, 109, 8).translate(0, t.h - lowerH + 54.5, 0),
          box(10, 8, 10, 0, t.h - lowerH, 0)].map(x => x.toNonIndexed())), styleMaterial('steel'));
        mast.userData.mast = true;
        upper.add(mast);
        this.mast = mast;
      }
      // the gash left by each impact, glowing from the fires inside
      const gash = new THREE.Mesh(new THREE.BoxGeometry(42, 16, 1.2), new THREE.MeshStandardMaterial({ color: 0x0b0806, emissive: 0xff5a14, emissiveIntensity: 0 }));
      gash.position.set(i === 0 ? 0 : 14, t.impactY[0] + 10 - lowerH, i === 0 ? -W / 2 - 0.3 : W / 2 + 0.3);
      upper.add(gash);
      for (const m of [lower, upperMesh]) { m.castShadow = true; m.receiveShadow = true; }
      g.add(lower, upper);
      scene.add(g);
      const el = document.createElement('div');
      el.className = 'lm-label';
      el.innerHTML = `<span>${t.label}</span>`;
      const label = new CSS2DObject(el);
      label.center.set(0.5, 1);
      label.position.set(0, t.h + (i === 0 ? 130 : 20), 0);
      g.add(label);
      return { ...t, g, lower, upper, gash, label, lowerH, from: i === 0 ? 1968.6 : 1969.6, build: 3.2,
        impact: i === 0 ? T.impact1 : T.impact2, collapse: i === 0 ? T.collapseN : T.collapseS, tilt: i === 0 ? 0.04 : 0.32 };
    });

    this.planes = [makePlane(), makePlane()];
    scene.add(...this.planes);

    // rubble at Ground Zero (until the recovery ends), then the excavated site
    const pile = [];
    const r = (a, b) => a + (b - a) * Math.abs(Math.sin(a * 91.7 + b * 13.1));
    for (const t of [NORTH, SOUTH]) for (let i = 0; i < 18; i++) {
      const p = local(t, (r(i, 1) - 0.5) * 110, (r(i, 2) - 0.5) * 110);
      pile.push(new THREE.ConeGeometry(14 + r(i, 3) * 22, 12 + r(i, 4) * 28, 6).translate(p.x, 6 + r(i, 4) * 12, p.z).toNonIndexed());
    }
    this.pile = new THREE.Mesh(mergeGeometries(pile), new THREE.MeshLambertMaterial({ color: 0x55504a }));
    this.pile.visible = false;
    this.pile.castShadow = true;
    scene.add(this.pile);
    const pit = local({ x: 296, z: -955 }, 0, 0, 0.15);
    this.pit = new THREE.Mesh(new THREE.BoxGeometry(250, 0.3, 330).rotateY(GRID_ROT).translate(pit.x, 0.15, pit.z), new THREE.MeshLambertMaterial({ color: 0x4d443a }));
    this.pit.visible = false;
    scene.add(this.pit);

    // the Memorial: two pools in the footprints, waterfalls on all four sides, a void at the centre
    const pools = new THREE.Group();
    for (const t of [NORTH, SOUTH]) {
      const p = new THREE.Group();
      p.position.set(t.x, 0, t.z);
      p.rotation.y = GRID_ROT;
      p.add(new THREE.Mesh(box(W + 4, 1.1, W + 4), new THREE.MeshLambertMaterial({ color: 0x2b2b2d })));             // bronze parapet
      p.add(new THREE.Mesh(box(W - 2, 0.2, W - 2, 0, 1.0, 0), new THREE.MeshStandardMaterial({ color: 0x1d3542, roughness: 0.08, metalness: 0.2 })));
      p.add(new THREE.Mesh(box(W - 6, 0.25, W - 6, 0, 1.05, 0), new THREE.MeshStandardMaterial({ color: 0xe8eef2, emissive: 0x9fb8c8, emissiveIntensity: 0.15 })));   // falling water
      p.add(new THREE.Mesh(box(W * 0.3, 0.3, W * 0.3, 0, 1.15, 0), new THREE.MeshBasicMaterial({ color: 0x050607 })));       // the central void
      pools.add(p);
    }
    this.pools = pools;
    pools.visible = false;
    scene.add(pools);

    // Tribute in Light: two beams rising from beside the site on the anniversary nights
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, side: THREE.DoubleSide,
      uniforms: { uA: { value: 0 } },
      vertexShader: 'varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float uA; varying float vY; void main(){ float a = uA * pow(1.0 - clamp(vY / 6000.0, 0.0, 1.0), 1.6); gl_FragColor = vec4(vec3(0.62, 0.74, 1.0) * a, 1.0); }',
    });
    this.beamMat = beamMat;
    this.beams = new THREE.Group();
    for (const t of [NORTH, SOUTH]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(55, 12, 6000, 20, 1, true).translate(0, 3000, 0), beamMat);
      const p = local(t, 0, 0);
      b.position.set(p.x - 120, 0, p.z + 760);
      this.beams.add(b);
    }
    this.beams.visible = false;
    this.beams.renderOrder = 20;
    scene.add(this.beams);

    this.fire = 0;
    this.dust = 0;
    this.emitClock = 0;
  }

  clears() { return [{ x: 300, z: -955, rx: 150, rz: 190, from: 1966.5, to: 9999 }]; }

  // per-frame
  update(year, dt, night, labelsOn) {
    const life = this.life, glow = life.glow, smoke = life.smoke;
    const s = (year - DAY) / SEC;                                   // seconds since midnight, Sept 11 2001
    this.fire = 0;
    this.dust = 0;
    this.firePos = null;

    // ----- towers -----
    for (const t of this.towers) {
      const built = clamp((year - t.from) / t.build, 0, 1);
      const sinceCollapse = (year - t.collapse) / SEC;
      const down = sinceCollapse > COLLAPSE_S + 1;
      t.g.visible = built > 0.002 && !down;
      t.label.visible = labelsOn && t.g.visible && built > 0.6 && !(year > t.impact && year < t.collapse + 600 * SEC);
      if (!t.g.visible) continue;
      // construction: grows floor by floor
      const H = t.h * smoothstep(0, 1, built);
      t.lower.scale.y = Math.max(0.01, Math.min(H, t.lowerH));
      t.upper.visible = H > t.lowerH;
      t.upper.scale.y = clamp((H - t.lowerH) / (t.h - t.lowerH), 0.001, 1);
      t.upper.position.y = t.lower.scale.y;
      t.upper.rotation.set(0, 0, 0);
      if (this.mast) this.mast.visible = year > 1978.5;
      // collapse: the top tips, then everything comes down in ~11 seconds
      if (sinceCollapse > 0) {
        const k = clamp(sinceCollapse / COLLAPSE_S, 0, 1);
        const fall = Math.pow(k, 1.35);
        t.lower.scale.y = Math.max(0.01, t.lowerH * (1 - fall));
        t.upper.position.y = t.lower.scale.y;
        t.upper.scale.y = Math.max(0.01, 1 - Math.min(1, k * 1.6));
        t.upper.rotation.z = -t.tilt * smoothstep(0, 0.25, k);
        // the dust cloud boils out from the falling front and races through the streets
        if (sinceCollapse < COLLAPSE_S + 0.5) {
          const front = t.lower.scale.y + 20;
          for (let i = 0; i < 40; i++) {
            const a = Math.random() * Math.PI * 2, v = 10 + Math.random() * 30;
            smoke.emit(t.x + Math.cos(a) * 30, front * Math.random(), t.z + Math.sin(a) * 30, Math.cos(a) * v, 4 + Math.random() * 10, Math.sin(a) * v, 26 + Math.random() * 14, 40, 340, 0.68, 0.9);
          }
        }
      }
      // fire & smoke after the impact
      const sinceImpact = (year - t.impact) / SEC;
      if (sinceImpact > 0 && sinceCollapse < 0) {
        const burn = smoothstep(0, 40, sinceImpact);
        t.gash.material.emissiveIntensity = 2.5 * burn * (0.7 + 0.3 * Math.sin(performance.now() * 0.02 + t.x));
        this.fire = Math.max(this.fire, 0.18);
        const top = t.lower.scale.y;
        const c = local(t, 0, 0);
        this.firePos = [c.x, top + 20, c.z];
        // flames on the impact floors (all four faces once the fire spreads)
        const spread = smoothstep(0, 300, sinceImpact);
        for (let i = 0; i < 26; i++) {
          const side = Math.floor(Math.random() * (spread > 0.5 ? 4 : 2));
          const along = (Math.random() - 0.5) * W * (0.4 + 0.6 * spread);
          const nrm = [[0, -1], [0, 1], [1, 0], [-1, 0]][side];
          const p = local(t, nrm[0] * (W / 2 + 1) + (nrm[1] !== 0 ? along : 0), (t === this.towers[0] ? 1 : -1) * nrm[1] * (W / 2 + 1) + (nrm[0] !== 0 ? along : 0),
            t.impactY[0] + Math.random() * (t.impactY[1] - t.impactY[0]));
          glow.push(p.x, p.y, p.z, 1, 0.42 + Math.random() * 0.25, 0.08, 10 + Math.random() * 16, 1.4);
        }
        // the impact fireball
        if (sinceImpact < 14) {
          const k = sinceImpact / 14;
          const ip = t === this.towers[0] ? IMPACT1 : IMPACT2;
          for (let i = 0; i < 70; i++) {
            const r = (12 + 70 * Math.sqrt(k)) * Math.cbrt(Math.random());
            const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
            glow.push(ip.x + Math.cos(a) * Math.cos(b) * r, ip.y + Math.sin(b) * r * 0.6, ip.z + Math.sin(a) * Math.cos(b) * r,
              1, 0.55 + 0.3 * Math.random(), 0.15, 22 + Math.random() * 30, 2.4 * (1 - k));
          }
        }
        // a heavy plume of black smoke drifting southeast over Brooklyn
        t.emit = (t.emit || 0) + dt;
        while (t.emit > 0.014) {
          t.emit -= 0.014;
          const p = local(t, (Math.random() - 0.5) * W, (Math.random() - 0.5) * W, t.impactY[0] + Math.random() * (t.impactY[1] - t.impactY[0] + 20));
          // the plume streams southeast on the north-westerly wind, toward Brooklyn
          const w = 14 + Math.random() * 10;
          smoke.emit(p.x, p.y, p.z, 0.55 * w + (Math.random() - 0.5) * 4, 2 + Math.random() * 5, 0.8 * w + (Math.random() - 0.5) * 4, 30 + Math.random() * 12, 18, 210 + Math.random() * 80, 0.15, 0.8);
        }
      } else {
        t.gash.material.emissiveIntensity = 0;
      }
      t.gash.visible = sinceImpact > 0;
    }

    // ----- aircraft (only in the final seconds before each impact) -----
    const flights = [[this.planes[0], T.impact1, 210, PATH1], [this.planes[1], T.impact2, 262, PATH2]];
    for (const [plane, impact, speed, path] of flights) {
      const before = (impact - year) / SEC;
      plane.visible = before > 0 && before < 75;
      if (!plane.visible) continue;
      const { p, d, roll } = path(before * speed);
      plane.position.copy(p);
      plane.lookAt(p.clone().sub(d));          // the model's nose points along -z
      plane.rotateZ(roll);
      if (night > 0.2) glow.push(p.x, p.y, p.z, 1, 0.2, 0.2, 6, 1);
    }

    // ----- after the collapses: dust, smoke from the pile, Ground Zero -----
    for (const c of [T.collapseS, T.collapseN]) {
      const since = (year - c) / SEC;
      if (since > 0) this.dust = Math.max(this.dust, 0.9 * Math.exp(-since / 2400) * smoothstep(0, 20, since));
    }
    const afterFall = year > T.collapseS && year < T.cleanup;
    this.pile.visible = afterFall && year > T.collapseN - 60 * SEC;
    if (year > T.collapseS && year < yearOf(2001, 12, 20)) {
      // the fires under the pile burned for 99 days
      this.pileClock = (this.pileClock || 0) + dt;
      const rate = year < T.dayEnd ? 0.02 : 0.08;
      while (this.pileClock > rate) {
        this.pileClock -= rate;
        const p = local({ x: 296, z: -955 }, (Math.random() - 0.5) * 220, (Math.random() - 0.5) * 300, 15);
        smoke.emit(p.x, p.y, p.z, 6 + Math.random() * 6, 3 + Math.random() * 3, 8 + Math.random() * 6, 30, 30, 240, year < T.dayEnd ? 0.3 : 0.55, year < T.dayEnd ? 0.7 : 0.35);
      }
    }
    this.pit.visible = year >= T.cleanup && year < 2011.69;
    this.pools.visible = year >= 2011.69;

    // ----- Tribute in Light -----
    const frac = year - Math.floor(year);
    const d0 = DAY - 2001, hr = 1 / (365 * 24);
    const anniversary = year > 2002.5 && frac > d0 + 18 * hr && frac < d0 + 30.5 * hr;   // dusk on Sept 11 until dawn
    const firstTribute = year > yearOf(2002, 3, 11) && year < yearOf(2002, 4, 14);
    const on = night > 0.25 && (anniversary || firstTribute);
    this.beams.visible = on;
    this.beamMat.uniforms.uA.value = on ? 0.32 * night : 0;
  }
}
