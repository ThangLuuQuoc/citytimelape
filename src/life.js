// Everything that moves: traffic, elevated trains, ships, air taxis, wind turbines,
// plus the particle layers for smoke, fire and night lights.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mulberry32, settleYear, shoreX, mainBranch, NORTH_BRANCH, SOUTH_BRANCH, s0, WATER_Y, distToRiver } from './geo.js';
import { ribbonGeometry, box } from './geom.js';
import { styleMaterial } from './materials.js';
import { clamp, smoothstep, ramp } from './timeline.js';

// ---------------- polyline helper ----------------
export class Path {
  constructor(pts, y = 0) {
    this.pts = pts.map(p => new THREE.Vector3(p[0], p.length > 2 ? p[2] : y, p[1]));
    this.cum = [0];
    for (let i = 1; i < this.pts.length; i++) this.cum.push(this.cum[i - 1] + this.pts[i].distanceTo(this.pts[i - 1]));
    this.len = this.cum[this.cum.length - 1];
  }
  at(u, out) {
    u = ((u % this.len) + this.len) % this.len;
    let i = 1;
    while (i < this.cum.length - 1 && this.cum[i] < u) i++;
    const a = this.pts[i - 1], b = this.pts[i];
    const t = (u - this.cum[i - 1]) / (this.cum[i] - this.cum[i - 1] || 1);
    out.x = a.x + (b.x - a.x) * t; out.y = a.y + (b.y - a.y) * t; out.z = a.z + (b.z - a.z) * t;
    out.dx = b.x - a.x; out.dz = b.z - a.z;
    const l = Math.hypot(out.dx, out.dz) || 1;
    out.dx /= l; out.dz /= l;
    return out;
  }
}

// write a yaw-rotated, scaled box into an instance array (box is unit, centered)
function putYaw(a, i, x, y, z, dx, dz, sx, sy, sz) {
  const o = i * 16;
  a[o] = dx * sx; a[o + 1] = 0; a[o + 2] = dz * sx; a[o + 3] = 0;
  a[o + 4] = 0; a[o + 5] = sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = -dz * sz; a[o + 9] = 0; a[o + 10] = dx * sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}

// ---------------- point sprites (smoke + additive lights) ----------------
function spriteTexture(soft) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  if (soft) { grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.5, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
  else { grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.18, 'rgba(255,255,255,0.9)'); grad.addColorStop(0.45, 'rgba(255,255,255,0.18)'); grad.addColorStop(1, 'rgba(255,255,255,0)'); }
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Sprites {
  constructor(capacity, additive) {
    this.cap = capacity;
    this.additive = additive;
    const geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.uniforms = {
      uTex: { value: spriteTexture(!additive) },
      uScale: { value: 800 },
      uMinPx: { value: additive ? 1.6 : 0 },
      uFogColor: { value: new THREE.Color() },
      uFogDensity: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: /* glsl */`
        attribute float size; attribute float alpha; attribute vec3 color;
        uniform float uScale, uMinPx;
        varying vec3 vC; varying float vA; varying float vD;
        void main(){
          vC = color; vA = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vD = -mv.z;
          float px = size * uScale / max(1.0, -mv.z);
          vA *= clamp(px / max(uMinPx, 0.001), 0.0, 1.0) * step(0.001, uMinPx) + (1.0 - step(0.001, uMinPx));
          gl_PointSize = clamp(max(px, uMinPx), 0.0, 300.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */`
        uniform sampler2D uTex; uniform vec3 uFogColor; uniform float uFogDensity;
        varying vec3 vC; varying float vA; varying float vD;
        void main(){
          float t = texture2D(uTex, gl_PointCoord).a;
          float fog = 1.0 - exp(-uFogDensity * uFogDensity * vD * vD);
          ${additive
            ? 'gl_FragColor = vec4(vC * vA * t * (1.0 - fog), 1.0);'
            : 'gl_FragColor = vec4(mix(vC, uFogColor, fog), vA * t);'}
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 5;
    this.n = 0;
  }
  begin() { this.n = 0; }
  push(x, y, z, r, g, b, size, alpha) {
    if (this.n >= this.cap) return;
    const i = this.n++, k = i * 3;
    this.pos[k] = x; this.pos[k + 1] = y; this.pos[k + 2] = z;
    this.col[k] = r; this.col[k + 1] = g; this.col[k + 2] = b;
    this.size[i] = size; this.alpha[i] = alpha;
  }
  end() {
    const g = this.points.geometry;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'color', 'size', 'alpha']) g.attributes[k].needsUpdate = true;
  }
}

// Simulated particles (smoke) with age and drift
class Smoke {
  constructor(capacity) {
    this.cap = capacity;
    this.p = new Float32Array(capacity * 12); // x y z vx vy vz age life s0 s1 shade alpha
    this.next = 0;
    this.sprites = new Sprites(capacity, false);
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, shade, alpha) {
    const o = this.next * 12;
    this.next = (this.next + 1) % this.cap;
    this.p.set([x, y, z, vx, vy, vz, 0, life, s0, s1, shade, alpha], o);
  }
  update(dt, wind, tint) {
    const p = this.p, sp = this.sprites;
    sp.begin();
    for (let i = 0; i < this.cap; i++) {
      const o = i * 12;
      if (p[o + 7] <= 0) continue;
      p[o + 6] += dt;
      const t = p[o + 6] / p[o + 7];
      if (t >= 1) { p[o + 7] = 0; continue; }
      p[o] += (p[o + 3] + wind.x * t) * dt; p[o + 1] += p[o + 4] * dt * (1 - t * 0.6); p[o + 2] += (p[o + 5] + wind.z * t) * dt;
      const a = p[o + 11] * smoothstep(0, 0.12, t) * (1 - t);
      const s = p[o + 10];
      sp.push(p[o], p[o + 1], p[o + 2], s * tint.r, s * tint.g, s * tint.b, p[o + 8] + (p[o + 9] - p[o + 8]) * t, a);
    }
    sp.end();
  }
}

// ---------------- vehicles ----------------
const CAR_COLORS = [0x1c1c1c, 0x8a1c1c, 0x2c3e66, 0xd8d8d8, 0x6b6b6b, 0x1f4d2f, 0xbfa36a, 0x4a4a52, 0xe0e0e0, 0x8c8c94];

export class Life {
  constructor(scene, waterfront) {
    this.scene = scene;
    this.wf = waterfront;
    this.riverShips = [];
    this.rand = mulberry32(99);
    this.glow = new Sprites(14000, true);
    this.smoke = new Smoke(5000);
    scene.add(this.glow.points, this.smoke.sprites.points);
    this.tmp = {};
    this.buildRoads(scene);
    this.buildVehicles(scene);
    this.buildTrains(scene);
    this.buildShips(scene);
    this.buildSky(scene);
    this.buildTurbines(scene);
  }

  // ---------- roads, expressways, Lake Shore Drive ----------
  buildRoads(scene) {
    const lanes = [];
    const street = (pts, year, o = {}) => lanes.push({ path: new Path(pts, 0.45), year, kind: 'street', art: 1, core: !!o.core, to: o.to ?? 9999 });
    const hwy = (pts, year) => lanes.push({ path: new Path(pts, 0.9), year, kind: 'hwy', to: 9999 });
    for (let k = -11; k <= 0; k++) street([[k * 804.67, -8000], [k * 804.67, 8000]], 1835);
    for (let k = -10; k <= 10; k++) street([[-9500, k * 804.67], [Math.min(s0(k * 804.67) - 40, 200), k * 804.67]], 1835);
    // downtown streets that cross the river on the movable bridges
    for (const x of [-603, -402, -281, -201, -72, 0, 100.6]) street([[x, -1700], [x, 2400]], 1836, { core: true });
    street([[201.2, -3300], [201.2, 2400]], 1836, { core: true });            // Michigan Ave (Pine St)
    street([[150, -1500], [150, -480]], 1856, { core: true, to: 1920 });      // Rush St
    street([[402, -1000], [402, 2400]], 1982, { core: true });                // Columbus Dr
    for (const z of [-402, -301, -201, 0, 201, 402, 603, 804, 1005, 1207]) street([[-1600, z], [201, z]], 1836, { core: true });
    // riverside streets
    for (const r of this.wf.roads) street(r.pts, r.from, { core: true });
    // Lake Shore Drive follows the filled-in lakefront
    const lsd = [];
    for (let z = -8000; z <= 8000; z += 200) {
      let x = shoreX(z, 1945) - 110;
      if (z > -900 && z < -400) x = shoreX(-640, 1945) - 230;
      lsd.push([x, z]);
    }
    hwy(lsd, 1937);
    const kennedy = [[-820, -150], [-1100, -1000], [-1500, -2200], [-2500, -4300], [-4200, -8000]];
    const ryan = [[-1250, 1005], [-1250, 4000], [-1300, 8000]];
    const ike = [[-800, 1005], [-9500, 1005]];
    const steven = [[-1250, 3300], [-3000, 3900], [-6000, 4700], [-9500, 5400]];
    hwy(ike, 1955); hwy(kennedy, 1960); hwy(ryan, 1962); hwy(steven, 1964);
    this.lanes = lanes;
    const bridges = this.wf.bridges;
    const q = {};
    for (const l of lanes) {
      // settlement sampled every 60 m so vehicles only drive through built-up areas
      l.settle = [];
      for (let u = 0; u <= l.path.len; u += 60) { l.path.at(u, q); l.settle.push(settleYear(q.x, q.z)); }
      // every 6 m: -1 land, -2 open water, >=0 index of the bridge carrying the street
      const n = Math.ceil(l.path.len / 6) + 1;
      l.cross = new Int16Array(n).fill(-1);
      for (let i = 0; i < n; i++) {
        l.path.at(Math.min(i * 6, l.path.len - 0.01), q);
        if (distToRiver(q.x, q.z, 40) < 34) {
          const bi = bridges.findIndex(b => b.contains(q.x, q.z));
          l.cross[i] = bi >= 0 ? bi : -2;
        }
      }
    }

    // ribbons for the big roads
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x3a3b3d, roughness: 0.9 });
    this.highways = [];
    const ribbon = (pts, w, year) => {
      const m = new THREE.Mesh(ribbonGeometry(pts, w, 0.5), roadMat);
      m.receiveShadow = true;
      m.userData.year = year;
      scene.add(m);
      this.highways.push(m);
    };
    ribbon(lsd, 34, 1937); ribbon(ike, 46, 1955); ribbon(kennedy, 46, 1960); ribbon(ryan, 52, 1962); ribbon(steven, 40, 1964);
  }

  buildVehicles(scene) {
    const r = this.rand;
    const hwys = this.lanes.filter(l => l.kind === 'hwy');
    const core = this.lanes.filter(l => l.core);
    const streets = this.lanes.filter(l => l.kind === 'street' && !l.core);
    this.vehicles = [];
    for (let i = 0; i < 2800; i++) {
      const pool = i < 1000 ? hwys : i < 2150 ? core : streets;
      const lane = pool[Math.floor(r() * pool.length)];
      const onHwy = lane.kind === 'hwy';
      const dir = r() < 0.5 ? 1 : -1;
      this.vehicles.push({ lane, u: r() * lane.path.len, dir, k: r(), k2: r(), color: new THREE.Color(CAR_COLORS[Math.floor(r() * CAR_COLORS.length)]),
        off: (onHwy ? 4 + Math.floor(r() * 3) * 3.4 : 3.2) * dir, speed: onHwy ? 22 + r() * 10 : 9 + r() * 6 });
    }
    // simple but readable shapes: car (body + cabin), horse & wagon, streetcar/bus
    const shapes = {
      car: mergeGeometries([box(1, 0.55, 1), box(0.5, 0.45, 0.86, -0.07, 0.55, 0)]),
      cart: mergeGeometries([box(0.58, 0.5, 1, -0.2, 0.35, 0), box(0.06, 0.35, 0.9, -0.2, 0, 0), box(0.3, 0.75, 0.32, 0.36, 0, 0)]),
      long: mergeGeometries([box(1, 0.86, 1, 0, 0.06, 0), box(0.94, 0.08, 0.7, 0, 0.92, 0)]),
    };
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, envMapIntensity: 0.4 });
    this.vMeshes = {};
    for (const [k, g] of Object.entries(shapes)) {
      const m = new THREE.InstancedMesh(g, mat, this.vehicles.length);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color());
      m.frustumCulled = false;
      m.castShadow = k === 'long';
      scene.add(m);
      this.vMeshes[k] = m;
    }
  }

  // ---------- the "L" and, later, a lakefront maglev ----------
  buildTrains(scene) {
    const lines = [
      { pts: [[-402, -402], [100, -402], [100, 804], [-402, 804], [-402, -402]], year: 1897, loop: true, n: 7 },
      { pts: [[100, 804], [100, 1150], [50, 1400], [50, 8000]], year: 1892, n: 4 },
      { pts: [[-402, -402], [-9000, -402]], year: 1893, n: 4 },
      { pts: [[-402, 804], [-9000, 804]], year: 1895, n: 3 },
      { pts: [[-402, -402], [-402, -1300], [-300, -2000], [-600, -4000], [-900, -8000]], year: 1900, n: 4 },
    ];
    const structMat = styleMaterial('steel');
    this.trainLines = lines.map(l => {
      const path = new Path(l.pts, 9);
      const g = new THREE.Group();
      const deck = new THREE.Mesh(ribbonGeometry(l.pts, 9, 0, 1.2), structMat);
      deck.position.y = 8;
      deck.castShadow = true;
      g.add(deck);
      const cols = [];
      for (let u = 0; u < path.len; u += 28) { const p = path.at(u, {}); cols.push(p.x, p.z); }
      const cm = new THREE.InstancedMesh(new THREE.BoxGeometry(0.8, 8, 0.8).translate(0, 4, 0), structMat, cols.length / 2);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < cols.length / 2; i++) cm.setMatrixAt(i, m4.makeTranslation(cols[i * 2], 0, cols[i * 2 + 1]));
      g.add(cm);
      g.visible = false;
      scene.add(g);
      const trains = [];
      for (let i = 0; i < l.n; i++) trains.push({ u: (i / l.n) * path.len, dir: l.loop ? 1 : (i % 2 ? 1 : -1), speed: 14 });
      return { ...l, path, group: g, trains };
    });
    const maglevPts = [[1600, -1110], [1150, -900], [1000, -500], [990, 300], [1000, 1500], [1150, 2400], [1050, 3300], [1250, 5000], [1450, 8000]];
    const maglevW = [[-800, 1005], [-9500, 1005]];
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0xe8f4f4, emissive: 0x66ffee, emissiveIntensity: 0, transparent: true, opacity: 0.55, roughness: 0.2 });
    this.maglev = [maglevPts, maglevW].map(pts => {
      const path = new Path(pts, 32);
      const curve = new THREE.CatmullRomCurve3(path.pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 200, 3.2, 8), tubeMat);
      tube.visible = false;
      scene.add(tube);
      const pillars = [];
      for (let u = 0; u < path.len; u += 90) { const p = path.at(u, {}); pillars.push(p.x, p.z); }
      const pm = new THREE.InstancedMesh(new THREE.CylinderGeometry(1.4, 2, 30, 8).translate(0, 15, 0), styleMaterial('white'), pillars.length / 2);
      const m4 = new THREE.Matrix4();
      for (let i = 0; i < pillars.length / 2; i++) pm.setMatrixAt(i, m4.makeTranslation(pillars[i * 2], 0, pillars[i * 2 + 1]));
      pm.visible = false;
      scene.add(pm);
      return { path: new Path(curve.getPoints(400).map(v => [v.x, v.z, v.y])), tube, pm, pods: Array.from({ length: 10 }, (_, i) => ({ u: i / 10, dir: i % 2 ? 1 : -1 })) };
    });
    this.tubeMat = tubeMat;
    const tm = new THREE.MeshStandardMaterial({ color: 0x2c4a30, roughness: 0.6, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0 });
    this.trainMat = tm;
    this.tMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), tm, 200);
    this.tMesh.frustumCulled = false;
    this.tMesh.castShadow = true;
    scene.add(this.tMesh);
  }

  // ---------- boats ----------
  buildShips(scene) {
    const r = this.rand;
    this.ships = [];
    for (let i = 0; i < 80; i++) {
      const river = i < 22;
      this.ships.push({ river, k: r(), k2: r(), k3: r(), u: r(), speed: river ? 1.5 + r() * 1.5 : 4 + r() * 6,
        z: -3500 + r() * 7000, x: 1700 + r() * 4500, ang: r() * Math.PI * 2, dir: r() < 0.5 ? 1 : -1 });
    }
    this.moored = [];
    for (let i = 0; i < 260; i++) this.moored.push({ x: 1110 + (i % 13) * 26 + r() * 4, z: -180 + Math.floor(i / 13) * 48 + r() * 6, k: r() });
    const hull = new THREE.MeshStandardMaterial({ roughness: 0.85, envMapIntensity: 0.25 });
    const hullGeo = mergeGeometries([box(1, 1, 1), box(0.28, 0.9, 0.62, -0.18, 1, 0), box(0.16, 0.5, 0.5, 0.36, 0.55, 0)]);
    this.hMesh = new THREE.InstancedMesh(hullGeo, hull, this.ships.length + this.moored.length + this.wf.moorings.length);
    this.hMesh.setColorAt(0, new THREE.Color());
    this.hMesh.frustumCulled = false;
    this.hMesh.castShadow = true;
    this.sMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.5, 1, 3).translate(0, 0.5, 0), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.8, side: THREE.DoubleSide }), (this.ships.length + this.moored.length + this.wf.moorings.length) * 2);
    this.sMesh.frustumCulled = false;
    scene.add(this.hMesh, this.sMesh);
    this.riverPaths = { main: null, north: new Path(NORTH_BRANCH.slice(0, 6), 1.2), south: new Path(SOUTH_BRANCH.slice(0, 7), 1.2) };
  }

  // ---------- air taxis / drones ----------
  buildSky(scene) {
    const r = this.rand;
    this.flyers = Array.from({ length: 160 }, () => ({
      cx: -1500 + r() * 3000, cz: -2500 + r() * 5000, rx: 300 + r() * 1500, rz: 300 + r() * 1500,
      y: 140 + r() * 320, w: (0.02 + r() * 0.04) * (r() < 0.5 ? 1 : -1), ph: r() * 6.28, k: r(),
    }));
    this.fMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), styleMaterial('white'), this.flyers.length);
    this.fMesh.frustumCulled = false;
    scene.add(this.fMesh);
  }

  // ---------- offshore wind ----------
  buildTurbines(scene) {
    const r = this.rand;
    this.turbines = [];
    for (let i = 0; i < 44; i++) {
      const north = i % 2 === 0;
      this.turbines.push({ x: 2600 + r() * 4200, z: north ? -4300 - r() * 4500 : 4600 + r() * 4500, from: 2035 + r() * 14, ph: r() * 6.28, sp: 0.6 + r() * 0.3 });
    }
    const white = styleMaterial('white');
    this.towerMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(2, 3.5, 1, 10).translate(0, 0.5, 0), white, this.turbines.length);
    this.bladeMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), white, this.turbines.length * 3);
    this.towerMesh.frustumCulled = this.bladeMesh.frustumCulled = false;
    scene.add(this.towerMesh, this.bladeMesh);
  }

  // ---------------- per-frame ----------------
  update(t, dt, year, env) {
    const { night, trafficOn, city, nature, landmarks } = env;
    const glow = this.glow;
    glow.begin();
    const p = this.tmp;

    // highways appear
    for (const h of this.highways) h.visible = year >= h.userData.year;

    // ----- road vehicles -----
    const VM = this.vMeshes, cnt = { car: 0, cart: 0, long: 0 };
    const bridges = this.wf.bridges;
    const horseShare = 1 - ramp(year, 1900, 1928);
    const podShare = ramp(year, 2028, 2048);
    const streetDensity = trafficOn ? 0.18 + 0.32 * ramp(year, 1840, 1890) + 0.5 * ramp(year, 1915, 1965) - 0.15 * ramp(year, 2035, 2050) : 0;
    const carLight = 0.4 + 0.6 * ramp(year, 1905, 1930);
    for (const v of this.vehicles) {
      const lane = v.lane;
      if (year < lane.year || year >= lane.to) continue;
      const dens = lane.kind === 'hwy' ? (trafficOn ? ramp(year, lane.year, lane.year + 8) * 0.95 : 0) : streetDensity * (lane.core ? 1.15 : 1);
      if (v.k > dens) continue;
      const horse = v.k2 < horseShare;
      const pod = !horse && v.k2 > 1 - podShare;
      const sp = horse ? 3.5 : v.speed * (pod ? 1.1 : 1);
      v.u += sp * dt * v.dir * (lane.core ? 2.2 : 6);
      const len = lane.path.len, uu = ((v.u % len) + len) % len;
      lane.path.at(uu, p);
      const si = Math.min(lane.settle.length - 1, Math.floor(uu / 60));
      if (lane.kind === 'street' && year < lane.settle[si] + 6) continue;
      // no driving on water: only across a bridge that exists and is down
      const ci = lane.cross[Math.min(lane.cross.length - 1, Math.round(uu / 6))];
      if (ci === -2 || (ci >= 0 && !bridges[ci].passable(year))) continue;
      const nx = -p.dz * v.off, nz = p.dx * v.off;
      const dx = p.dx * v.dir, dz = p.dz * v.dir;
      const x = p.x + nx, z = p.z + nz;
      const streetcar = !horse && !pod && lane.kind === 'street' && lane.core && v.k2 < 0.1 + horseShare && year > 1890 && year < 1958;
      const bus = !horse && !pod && !streetcar && year > 1925 && v.k2 > 0.92 - podShare;
      let L = 4.6, W = 1.9, H = 1.5, col = v.color, shape = 'car';
      if (horse) { L = 5.5; W = 2; H = 2.3; shape = 'cart'; col = TMP_C.setRGB(0.3 + v.k * 0.1, 0.22, 0.14); }
      else if (streetcar) { L = 14; W = 2.7; H = 3.3; shape = 'long'; col = year < 1920 ? TMP_C.setRGB(0.55, 0.14, 0.08) : TMP_C.setRGB(0.75, 0.55, 0.12); }
      else if (bus) { L = 12; W = 2.6; H = 3.1; shape = 'long'; col = TMP_C.setRGB(0.85, 0.85, 0.82); }
      else if (pod) { L = 3.8; W = 1.9; H = 1.7; col = TMP_C.setRGB(0.9, 0.93, 0.95); }
      else if (year < 1935) { H = 1.8; col = TMP_C.setRGB(0.08, 0.08, 0.09); }   // the black Model-T era
      const m = VM[shape], i = cnt[shape]++;
      putYaw(m.instanceMatrix.array, i, x, p.y, z, dx, dz, L, H, W);
      m.instanceColor.array[i * 3] = col.r; m.instanceColor.array[i * 3 + 1] = col.g; m.instanceColor.array[i * 3 + 2] = col.b;
      if (night > 0.05) {
        const a = night * (horse ? 0.25 : carLight);
        if (pod) {
          glow.push(x, p.y + 1, z, 0.4, 1.0, 1.0, 7, a * 1.2);
        } else {
          glow.push(x + dx * L * 0.5, p.y + 1, z + dz * L * 0.5, 1.0, 0.88, 0.62, 7, a * 1.3);
          glow.push(x - dx * L * 0.5, p.y + 1, z - dz * L * 0.5, 1.0, 0.08, 0.04, 5, a * 1.1);
        }
      }
    }
    for (const [k, m] of Object.entries(VM)) {
      m.count = cnt[k];
      m.instanceMatrix.needsUpdate = true;
      m.instanceColor.needsUpdate = true;
    }

    // ----- street lamps along the river, on the bridges, and the harbor light -----
    if (night > 0.05 && year > 1855) {
      const lc = year < 1910 ? [1, 0.72, 0.38] : year < 1958 ? [1, 0.85, 0.6] : year < 2016 ? [1, 0.6, 0.25] : [0.95, 0.96, 1];
      const la = this.wf.lamps;
      for (let i = 0; i < la.length; i += 3) glow.push(la[i], la[i + 1], la[i + 2], lc[0], lc[1], lc[2], 4.5, night * 0.9);
      const bl = this.wf.bridgeLamps(year, this._bl || (this._bl = []));
      for (let i = 0; i < bl.length; i += 3) glow.push(bl[i], bl[i + 1], bl[i + 2], lc[0], lc[1], lc[2], 4.5, night);
      bl.length = 0;
    }
    const bc = this.wf.beacon;
    if (bc && night > 0.05) glow.push(bc.x, bc.y, bc.z, 1, 0.92, 0.6, 26, night * (0.4 + 0.6 * Math.max(0, Math.sin(t * 2.2))));

    // ----- elevated trains -----
    const ta = this.tMesh.instanceMatrix.array;
    let nt = 0;
    const trainCol = year < 1960 ? [0.17, 0.29, 0.19] : year < 2030 ? [0.62, 0.64, 0.66] : [0.9, 0.93, 0.95];
    this.trainMat.color.setRGB(...trainCol);
    this.trainMat.emissiveIntensity = night * 0.6;
    for (const l of this.trainLines) {
      const on = year >= l.year;
      l.group.visible = on;
      if (!on) continue;
      const grow = ramp(year, l.year, l.year + 0.5);
      for (const tr of l.trains) {
        tr.u += tr.speed * dt * tr.dir * 4;
        for (let c = 0; c < 4; c++) {
          l.path.at(tr.u - c * 15 * tr.dir, p);
          if (nt >= 200) break;
          putYaw(ta, nt++, p.x, 8, p.z, p.dx, p.dz, 14 * grow, 3.4, 2.8);
          if (night > 0.1 && c === 0) glow.push(p.x + p.dx * 7 * tr.dir, 11, p.z + p.dz * 7 * tr.dir, 1, 0.95, 0.8, 5, night);
        }
      }
    }
    // maglev
    const mag = ramp(year, 2042, 2046);
    this.tubeMat.emissiveIntensity = 0.15 + night * 0.9;
    for (const m of this.maglev) {
      m.tube.visible = m.pm.visible = mag > 0.01;
      m.tube.scale.y = 1;
      if (mag < 0.01) continue;
      for (const pod of m.pods) {
        pod.u += dt * 0.012 * pod.dir;
        m.path.at(pod.u * m.path.len, p);
        if (nt < 200) putYaw(ta, nt++, p.x, p.y - 1.5, p.z, p.dx, p.dz, 30, 2.6, 2.6);
        glow.push(p.x, p.y, p.z, 0.5, 1.0, 1.0, 9, 0.5 + night);
      }
    }
    this.tMesh.count = nt;
    this.tMesh.instanceMatrix.needsUpdate = true;

    // ----- ships -----
    this.updateShips(t, dt, year, night);

    // ----- air taxis -----
    const fa = this.fMesh.instanceMatrix.array;
    let nf = 0;
    const fly = ramp(year, 2040, 2050);
    for (const f of this.flyers) {
      if (f.k > fly) continue;
      const a = f.ph + t * f.w;
      const x = f.cx + Math.cos(a) * f.rx, z = f.cz + Math.sin(a) * f.rz, y = f.y + Math.sin(a * 3) * 20;
      putYaw(fa, nf++, x, y, z, -Math.sin(a) * Math.sign(f.w), Math.cos(a) * Math.sign(f.w), 6, 1.6, 4);
      const blink = (Math.sin(t * 6 + f.ph * 10) > 0.6) ? 1 : 0.25;
      glow.push(x, y + 1, z, 0.6, 1, 0.95, 5, (0.4 + night) * blink);
    }
    this.fMesh.count = nf;
    this.fMesh.instanceMatrix.needsUpdate = true;

    // ----- wind turbines -----
    const twa = this.towerMesh.instanceMatrix.array, bla = this.bladeMesh.instanceMatrix.array;
    let ntw = 0, nb = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), zAxis = new THREE.Vector3(0, 0, 1);
    for (const tb of this.turbines) {
      const g = clamp((year - tb.from) / 1.5, 0, 1);
      if (g <= 0) continue;
      const H = 130 * g;
      twa.set([1, 0, 0, 0, 0, H, 0, 0, 0, 0, 1, 0, tb.x, WATER_Y, tb.z, 1], ntw++ * 16);
      for (let b = 0; b < 3; b++) {
        q.setFromAxisAngle(zAxis, tb.ph + t * tb.sp + b * 2.094);
        m4.compose(pos.set(tb.x - 4, H + WATER_Y, tb.z), q, s.set(2.2, 75 * g, 0.8));
        m4.toArray(bla, nb++ * 16);
      }
      if (night > 0.1 && Math.sin(t * 3 + tb.ph) > 0.3) glow.push(tb.x, H + 4, tb.z, 1, 0.05, 0.02, 7, night);
    }
    this.towerMesh.count = ntw; this.bladeMesh.count = nb;
    this.towerMesh.instanceMatrix.needsUpdate = true; this.bladeMesh.instanceMatrix.needsUpdate = true;

    // ----- aviation warning lights on tall towers -----
    if (night > 0.05 && year > 1925) {
      const blink = Math.sin(t * 3.2) > 0 ? 1 : 0.15;
      const tt = city.tallTops;
      for (let i = 0; i < tt.length; i += 3) glow.push(tt[i], tt[i + 1], tt[i + 2], 1, 0.06, 0.03, 6, night * blink);
      for (const it of landmarks.active) if (it.height > 180) glow.push(it.def.x, it.height * it.group.scale.y + 2, it.def.z, 1, 0.06, 0.03, 7, night * blink);
    }

    // ----- fire of 1871 -----
    const burning = city.burning;
    for (const l of burning) {
      const k = clamp((year - l.burn) / 0.035, 0, 1);
      const fl = Math.sin(k * Math.PI) * (0.7 + 0.6 * Math.random());
      for (let f = 0; f < 3; f++) {
        const hot = Math.random();
        glow.push(l.x + (Math.random() - 0.5) * l.w, 4 + Math.random() * 26, l.z + (Math.random() - 0.5) * l.d,
          1.0, 0.35 + hot * 0.4, 0.06 + hot * 0.1, 26 + 46 * Math.random(), fl * 2.2);
      }
    }
    // a towering smoke plume drifting east over the lake
    const plumes = Math.min(burning.length, Math.ceil(70 * dt * 60 / 4));
    for (let i = 0; i < plumes; i++) {
      const l = burning[Math.floor(Math.random() * burning.length)];
      this.smoke.emit(l.x, 20, l.z, (Math.random() - 0.5) * 6, 26 + Math.random() * 20, (Math.random() - 0.5) * 6, 14 + Math.random() * 6, 50, 420, 0.16, 0.85);
    }
    this.fireLevel = Math.min(1, burning.length / 500);

    // ----- smoke: factories, steamers, campfires -----
    const stacks = city.stackEmitters;
    const smokeAmt = clamp((year - 1850) / 20, 0, 1) * clamp((1975 - year) / 30, 0, 1);
    const nStacks = stacks.length / 3;
    const spawn = Math.min(nStacks, Math.ceil(60 * dt * nStacks / 8));
    for (let i = 0; i < spawn; i++) {
      const j = Math.floor(Math.random() * nStacks) * 3;
      this.smoke.emit(stacks[j], stacks[j + 1] + 2, stacks[j + 2], 0, 4 + Math.random() * 3, 0, 26, 6, 70, 0.32, 0.5 * smokeAmt);
    }
    const fires = nature.campfires;
    for (let i = 0; i < fires.length; i += 3) if (Math.random() < dt * 4) this.smoke.emit(fires[i], 3, fires[i + 2], 0, 2.5, 0, 18, 3, 26, 0.75, 0.45);
    for (const e of this.steamSmoke) if (Math.random() < dt * 5) this.smoke.emit(e[0], e[1], e[2], 0, 3, 0, 16, 4, 40, 0.25, 0.6);
    this.smoke.update(dt, WIND, SMOKE_TINT.setRGB(1, 1, 1).lerp(FIRE_TINT, this.fireLevel));

    glow.end();
  }

  updateShips(t, dt, year, night) {
    const ha = this.hMesh.instanceMatrix.array, hc = this.hMesh.instanceColor.array, sa = this.sMesh.instanceMatrix.array;
    let nh = 0, ns = 0;
    const p = this.tmp;
    this.steamSmoke = [];
    this.riverShips.length = 0;
    const main = new Path(mainBranch(year).slice(0, -1), 1.2);
    const mouthX = shoreX(-640, year);
    const busy = ramp(year, 1835, 1860);
    const Y = WATER_Y;
    const draw = (type, x, z, dx, dz) => {
      let L, W, H, c, sail = 0;
      switch (type) {
        case 'canoe': L = 6; W = 1.1; H = 0.6; c = [0.35, 0.24, 0.14]; break;
        case 'schooner': L = 32; W = 7; H = 3; c = [0.2, 0.15, 0.11]; sail = 24; break;
        case 'steamer': L = 60; W = 11; H = 5; c = [0.12, 0.11, 0.11]; this.steamSmoke.push([x, Y + 14, z]); break;
        case 'freighter': L = 180; W = 22; H = 8; c = [0.45, 0.12, 0.08]; break;
        case 'barge': L = 55; W = 10; H = 2.2; c = [0.32, 0.22, 0.14]; break;
        case 'tour': L = 26; W = 7; H = 2.6; c = [0.88, 0.88, 0.85]; break;
        case 'sail': L = 11; W = 3.5; H = 1.4; c = [0.92, 0.92, 0.9]; sail = 14; break;
        case 'ferry': L = 40; W = 12; H = 4; c = [0.9, 0.95, 0.97]; break;
      }
      putYaw(ha, nh, x, Y - 0.6, z, dx, dz, L, H, W);
      hc.set(c, nh * 3);
      nh++;
      if (sail) {
        putYaw(sa, ns++, x + dx * L * 0.1, Y + H, z + dz * L * 0.1, dx, dz, L * 0.5, sail, 0.4);
        if (type === 'schooner') putYaw(sa, ns++, x - dx * 9, Y + H, z - dz * 9, dx, dz, L * 0.4, sail * 0.85, 0.4);
      }
      if (night > 0.1 && type !== 'canoe') this.glow.push(x, Y + H + 3, z, type === 'ferry' ? 0.4 : 1, type === 'ferry' ? 1 : 0.85, type === 'ferry' ? 1 : 0.6, 5, night * 0.8);
      return sail > 0 || type === 'steamer';
    };
    for (const s of this.ships) {
      // pick type for this era
      let type;
      if (year < 1835) type = s.k < 0.6 ? 'canoe' : null;
      else if (year < 1960) type = s.k2 < (year < 1880 ? 0.75 : year < 1915 ? 0.35 : 0.05) ? 'schooner' : 'steamer';
      else if (year < 2035) type = s.river ? (s.k2 < 0.6 ? 'tour' : 'sail') : (s.k2 < 0.25 ? 'freighter' : 'sail');
      else type = s.k2 < 0.35 ? 'ferry' : 'sail';
      if (type === null) continue;
      if (year >= 1835 && s.k > 0.25 + 0.75 * busy) continue;
      if (year > 1960 && year < 2035 && s.k > 0.55) continue;
      if (s.river && type === 'steamer' && year > 1930) type = 'barge';
      let x, z, dx, dz;
      if (s.river) {
        const path = s.k3 < 0.45 ? main : s.k3 < 0.7 ? this.riverPaths.north : this.riverPaths.south;
        s.u += dt * s.speed * s.dir * 0.004;
        path.at(s.u * path.len, p);
        const side = (s.k2 - 0.5) * 18;
        x = p.x - p.dz * side; z = p.z + p.dx * side; dx = p.dx * s.dir; dz = p.dz * s.dir;
      } else {
        if (type === 'canoe') { s.x = Math.max(s.x, s0(s.z) + 60); }
        s.ang += dt * 0.02 * s.dir;
        dx = Math.cos(s.ang); dz = Math.sin(s.ang);
        s.x += dx * s.speed * dt * 3; s.z += dz * s.speed * dt * 3;
        const minX = shoreX(s.z, year) + 120;
        if (s.x < minX) { s.x = minX; s.ang = Math.PI - s.ang; }
        if (s.x > 7000 || Math.abs(s.z) > 6000) { s.x = mouthX + 200; s.z = -640 + (s.k - 0.5) * 400; }
        x = s.x; z = s.z;
      }
      const tall = draw(type, x, z, dx, dz);
      if (s.river) this.riverShips.push({ x, z, tall });
    }
    // vessels tied up along the dock walls, at Navy Pier and along the Riverwalk
    const wharfEra = ramp(year, 1835, 1852) * (1 - ramp(year, 1915, 1940));
    const riverEnd = mouthX + 10;
    for (const m of this.wf.moorings) {
      let type = null;
      if (m.where === 'river') {
        if (m.x > riverEnd || year < 1835) continue;
        if (m.k < wharfEra * 0.8) type = year < 1880 || m.k < 0.25 ? 'schooner' : 'steamer';
        else if (year >= 1935 && year < 1995 && m.k > 0.93) type = 'barge';
      } else if (m.where === 'pier') {
        if (year >= 1916 && year < 1960 && m.k < 0.6) type = 'steamer';
        else if (year >= 1995 && m.k < 0.35) type = 'tour';
      } else if (year >= 2010 && m.k < 0.7) type = 'tour';
      if (type) draw(type, m.x, m.z, m.dx, m.dz);
    }
    // Monroe Harbor moorings
    if (year > 1932) {
      const fill = ramp(year, 1932, 1960);
      for (const m of this.moored) {
        if (m.k > fill) continue;
        putYaw(ha, nh, m.x, Y - 0.6, m.z, 0, 1, 10, 1.3, 3.2);
        hc.set([0.92, 0.92, 0.9], nh * 3);
        nh++;
        if (m.k < 0.7) putYaw(sa, ns++, m.x, Y + 0.7, m.z, 0, 1, 0.3, 13, 0.3);
      }
    }
    this.hMesh.count = nh; this.sMesh.count = ns;
    this.hMesh.instanceMatrix.needsUpdate = true; this.hMesh.instanceColor.needsUpdate = true; this.sMesh.instanceMatrix.needsUpdate = true;
  }

  setViewport(height, fovDeg) {
    const scale = height / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
    this.glow.uniforms.uScale.value = scale;
    this.smoke.sprites.uniforms.uScale.value = scale;
  }
  setFog(color, density) {
    for (const s of [this.glow, this.smoke.sprites]) { s.uniforms.uFogColor.value.copy(color); s.uniforms.uFogDensity.value = density; }
  }
}

const TMP_C = new THREE.Color();
const WIND = { x: 7, z: 2.5 };
const SMOKE_TINT = new THREE.Color();
const FIRE_TINT = new THREE.Color(1.6, 0.8, 0.4);

