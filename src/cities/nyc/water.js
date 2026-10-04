// New York Harbor: water, the land masses (Manhattan grows with landfill), seawalls, finger piers,
// and the East River suspension bridges (Brooklyn 1883, Williamsburg 1903, Manhattan 1909).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y } from '../../geo.js';
import { styleMaterial } from '../../materials.js';
import { wallGeometry, box } from '../../geom.js';
import { ramp, clamp } from '../../timeline.js';
import { landPolys, manhattan, LANDS } from './geo.js';

const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = {
  seawall: lambert(0x8f8a80, { side: THREE.DoubleSide }),
  timber: lambert(0x5a4a38),
  pier: lambert(0x75706a),
  shed: lambert(0x6e5b4a),
  shedNew: lambert(0x8c8f93),
  deck: lambert(0x3a3a3c),
  cable: lambert(0x9da3a8),
  stone: styleMaterial('stone'),
  granite: styleMaterial('granite'),
  steel: styleMaterial('steel'),
  wire: new THREE.LineBasicMaterial({ color: 0x8e959b, transparent: true, opacity: 0.75 }),
};

// ---------------- suspension bridges ----------------
class SuspensionBridge {
  constructor(scene, d) {
    Object.assign(this, d);
    const [mx, mz] = d.towerM, [bx, bz] = d.towerB;
    const S = Math.hypot(bx - mx, bz - mz);
    this.S = S;
    this.dir = [(bx - mx) / S, (bz - mz) / S];
    const W = d.width, T = d.towerH, D = d.deckH, A = d.side, R = d.ramp;
    this.group = new THREE.Group();
    this.group.position.set(mx, 0, mz);
    this.group.rotation.y = Math.atan2(-this.dir[1], this.dir[0]);   // local +x runs along the bridge
    scene.add(this.group);

    // deck profile: ramps up from the street, side spans, slightly arched main span
    const anchorY = D * 0.82;
    this.profile = (x) => {
      if (x < -A - R || x > S + A + R) return 0.45;
      if (x < -A) return 0.45 + (anchorY - 0.45) * (x + A + R) / R;
      if (x < 0) return anchorY + (D - anchorY) * (x + A) / A;
      if (x <= S) return D + 4 * (1 - Math.pow((x - S / 2) / (S / 2), 2));
      if (x <= S + A) return D + (anchorY - D) * (x - S) / A;
      return anchorY + (0.45 - anchorY) * (x - S - A) / R;
    };
    this.x0 = -A - R; this.x1 = S + A + R;

    const deck = [];
    for (let x = this.x0; x < this.x1; x += 12) {
      const y0 = this.profile(x), y1 = this.profile(x + 12);
      const g = new THREE.BoxGeometry(12.4, 1.6, W);
      g.rotateZ(Math.atan2(y1 - y0, 12));
      g.translate(x + 6, (y0 + y1) / 2 - 0.9, 0);
      deck.push(g);
      // truss stiffening girders along both edges of the suspended part
      if (x > -A && x < S + A) for (const s of [-1, 1]) { const t = new THREE.BoxGeometry(12.4, 3, 0.8); t.rotateZ(Math.atan2(y1 - y0, 12)); t.translate(x + 6, (y0 + y1) / 2 + 0.4, s * (W / 2 + 0.4)); deck.push(t); }
    }
    this.deck = new THREE.Mesh(mergeGeometries(deck), M.deck);

    // towers on caissons
    const towers = [];
    for (const tx of [0, S]) {
      towers.push(box(36, 6, W + 26, tx, WATER_Y - 1, 0));
      if (d.style === 'stone') {
        // masonry tower with two pointed-arch openings: three piers joined at the top
        for (const tz of [-(W / 2 + 6), 0, W / 2 + 6]) towers.push(box(18, T - WATER_Y, tz === 0 ? 7 : 10, tx, WATER_Y + 4, tz));
        towers.push(box(18, 18, W + 22, tx, T - 18, 0), box(20, 3, W + 24, tx, T, 0), box(18, 8, W + 22, tx, D + 12 + (T - D) * 0.25, 0));
      } else {
        for (const tz of [-(W / 2 + 2), W / 2 + 2]) towers.push(box(5, T - WATER_Y, 6, tx, WATER_Y + 4, tz));
        for (let y = D + 8; y < T; y += (T - D) / 3) towers.push(box(3, 3, W + 4, tx, y, 0));
        towers.push(box(6, 4, W + 10, tx, T - 2, 0));
      }
    }
    this.towers = new THREE.Mesh(mergeGeometries(towers), d.style === 'stone' ? M.granite : M.steel);
    this.anchors = new THREE.Mesh(mergeGeometries([box(48, anchorY + 10, W + 22, -A - 10, 0, 0), box(48, anchorY + 10, W + 22, S + A + 10, 0, 0)]), M.stone);

    // main cables (catenary-ish parabolas) and vertical suspenders
    const cables = [], wires = [], lamps = [];
    const cableZ = d.style === 'stone' ? [-(W / 2 + 6), -W / 6, W / 6, W / 2 + 6] : [-(W / 2 + 2), -(W / 2 + 1), W / 2 + 1, W / 2 + 2];
    const cableY = (x) => {
      if (x < 0) { const t = (x + A) / A; return anchorY + 8 + (T - 2 - anchorY - 8) * t - 10 * t * (1 - t); }
      if (x <= S) { const t = x / S; return T - 2 - 4 * (T - 2 - D - 3) * t * (1 - t); }
      const t = (x - S) / A; return T - 2 + (anchorY + 8 - T + 2) * t - 10 * t * (1 - t);
    };
    for (const cz of cableZ) {
      const pts = [];
      for (let x = -A; x <= S + A + 0.01; x += 8) pts.push(new THREE.Vector3(x, cableY(x), cz));
      cables.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, d.style === 'stone' ? 0.45 : 0.6, 5));
      for (let x = -A + 6; x < S + A; x += 6) {
        if (Math.abs(x) < 10 || Math.abs(x - S) < 10) continue;
        wires.push(x, cableY(x), cz, x, this.profile(x) + 1, cz);
      }
      if (Math.abs(cz) > W / 3) for (let x = -A + 8; x < S + A; x += 16) lamps.push(new THREE.Vector3(x, cableY(x), cz));
    }
    if (d.style === 'stone') {
      // the Brooklyn Bridge's diagonal stays fanning out from each tower
      for (const tx of [0, S]) for (const cz of cableZ) for (let k = 1; k <= 9; k++) {
        const s = tx === 0 ? 1 : -1;
        for (const dir of [s, -s]) wires.push(tx, T - 6, cz, tx + dir * k * 12, this.profile(tx + dir * k * 12) + 1, cz);
      }
    }
    this.cables = new THREE.Mesh(mergeGeometries(cables), M.cable);
    const wg = new THREE.BufferGeometry();
    wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
    this.wires = new THREE.LineSegments(wg, M.wire);
    this.lampsLocal = lamps;
    for (const m of [this.deck, this.towers, this.anchors, this.cables]) { m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    this.group.add(this.wires);
  }
  // world point on the deck centreline at local distance x (for the traffic lanes)
  lanePoints(offset) {
    const pts = [];
    for (let x = this.x0; x <= this.x1; x += 15) {
      const wx = this.towerM[0] + this.dir[0] * x - this.dir[1] * offset, wz = this.towerM[1] + this.dir[1] * x + this.dir[0] * offset;
      pts.push([wx, wz, this.profile(x) + 0.4]);
    }
    return pts;
  }
  contains(x, z) {
    const dx = x - this.towerM[0], dz = z - this.towerM[1];
    const along = dx * this.dir[0] + dz * this.dir[1], across = -dx * this.dir[1] + dz * this.dir[0];
    return along > this.x0 && along < this.x1 && Math.abs(across) < this.width / 2 + 2;
  }
  exists(year) { return year >= this.open; }
  passable(year) { return year >= this.open; }
  update(year) {
    const t = clamp((year - this.start) / (this.towersDone - this.start), 0, 1);
    this.group.visible = year >= this.start;
    this.towers.scale.y = Math.max(0.001, t);
    this.anchors.scale.y = Math.max(0.001, t);
    this.cables.visible = year >= this.towersDone + 0.5;
    this.wires.visible = year >= this.towersDone + 1.5;
    this.deck.visible = year >= this.towersDone + 1.5;
    this.deck.scale.set(1, 1, 1);
  }
}

export const BRIDGES = [
  { name: 'Brooklyn Bridge', towerM: [1589, -439], towerB: [1947, -110], width: 26, towerH: 81, deckH: 38, side: 283, ramp: 300,
    style: 'stone', start: 1870, towersDone: 1876.5, open: 1883.4 },
  { name: 'Williamsburg Bridge', towerM: [3440, -1294], towerB: [3905, -1147], width: 36, towerH: 99, deckH: 41, side: 180, ramp: 380,
    style: 'steel', start: 1896.5, towersDone: 1900.5, open: 1903.95 },
  { name: 'Manhattan Bridge', towerM: [2150, -600], towerB: [2336, -192], width: 37, towerH: 99, deckH: 40, side: 220, ramp: 380,
    style: 'steel', start: 1901.5, towersDone: 1905.5, open: 1909.99 },
];

// ---------------- the harbor ----------------
export class NycWater {
  constructor(scene, waterNormal, waterMat, groundMat) {
    // one big harbor surface; the land masses are flat shapes at street level above it
    const plane = new THREE.PlaneGeometry(90000, 90000, 1, 1).rotateX(-Math.PI / 2);
    const uv = plane.attributes.uv.array, pos = plane.attributes.position.array;
    for (let i = 0; i < pos.length / 3; i++) { uv[i * 2] = pos[i * 3] / 260; uv[i * 2 + 1] = pos[i * 3 + 2] / 260; }
    this.water = new THREE.Mesh(plane, waterMat);
    this.water.position.y = WATER_Y;
    this.water.receiveShadow = true;
    scene.add(this.water);

    this.groundMat = groundMat;
    this.lands = new Map();
    this.walls = new THREE.Mesh(new THREE.BufferGeometry(), M.seawall);
    this.walls.receiveShadow = true;
    scene.add(this.walls);
    this.scene = scene;

    this.bridges = BRIDGES.map(b => new SuspensionBridge(scene, b));
    this.roads = [];

    // finger piers: Hudson & East River (Manhattan), Brooklyn Heights, Jersey City rail piers
    this.piers = [];
    const mPoly = manhattan(2050);
    const addAlong = (poly, i0, i1, every, len, w, from, to, kind) => {
      for (let i = i0; i < i1; i++) {
        const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length];
        const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / every);
        for (let k = 0; k < n; k++) this.piers.push({ poly: kind, i, t: (k + 0.5) / n, len: len * (0.85 + 0.3 * hash(i, k)), w, from: from + hash(k, i) * 15, to: to + hash(i * 3, k) * 12 });
      }
    };
    addAlong(mPoly, 2, 11, 130, 210, 26, 1845, 1962, 'manhattan');   // Hudson piers
    addAlong(mPoly, 21, 25, 110, 95, 20, 1805, 1955, 'manhattan');   // South Street piers
    addAlong(LANDS[0].pts, 1, 3, 190, 290, 45, 1850, 1983, 'brooklyn');  // Brooklyn Heights piers (later Brooklyn Bridge Park)
    addAlong(LANDS[1].pts, 2, 5, 170, 260, 30, 1860, 1966, 'nj');      // Jersey City rail piers
    // South Street Seaport: Piers 16/17 survive with museum ships
    this.piers.push({ poly: 'manhattan', i: 23, t: 0.5, len: 110, w: 30, from: 1810, to: 9999, seaport: true });
    const unit = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    this.pierMesh = new THREE.InstancedMesh(unit, M.pier, this.piers.length);
    this.shedMesh = new THREE.InstancedMesh(unit, M.shed, this.piers.length);
    for (const m of [this.pierMesh, this.shedMesh]) { m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; scene.add(m); }
    this.moorings = [];
    for (const p of this.piers) for (const side of [-1, 1]) this.moorings.push({ pier: p, side, x: 0, z: 0, dx: 1, dz: 0, where: p.seaport ? 'seaport' : 'pier', k: hash(p.i * 7 + side, p.t * 31) });
    // North Cove marina (Battery Park City)
    this.lamps = [];
    this.beacon = null;
    this.lastLandYear = -1;
  }

  setYear(year) {
    if (Math.abs(year - this.lastLandYear) > 0.25) {
      this.lastLandYear = year;
      this.rebuildLand(year);
      this.placePiers(year);
    }
    for (const b of this.bridges) b.update(year);
    this.beacon = year >= 1886.8 ? { x: -2316, y: 90, z: 1568, steady: true } : null;   // Liberty's torch
  }

  rebuildLand(year) {
    const polys = landPolys(year);
    const walls = [];
    for (const p of polys) {
      let mesh = this.lands.get(p.id);
      const key = p.id === 'manhattan' ? 'm' + Math.round(year * 4) : 'static';
      if (!mesh || (mesh.userData.key !== key)) {
        const shape = new THREE.Shape(p.pts.map(([x, z]) => new THREE.Vector2(x, -z)));
        const g = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
        if (mesh) { mesh.geometry.dispose(); mesh.geometry = g; }
        else { mesh = new THREE.Mesh(g, this.groundMat); mesh.receiveShadow = true; this.scene.add(mesh); this.lands.set(p.id, mesh); }
        mesh.userData.key = key;
      }
      mesh.visible = true;
      walls.push(wallGeometry([...p.pts, p.pts[0]], WATER_Y - 0.6, 0.12));
    }
    for (const [id, mesh] of this.lands) if (!polys.find(p => p.id === id)) mesh.visible = false;
    this.walls.geometry.dispose();
    this.walls.geometry = mergeGeometries(walls);
  }

  placePiers(year) {
    const polys = { manhattan: manhattan(year), brooklyn: LANDS[0].pts, nj: LANDS[1].pts };
    const pa = this.pierMesh.instanceMatrix.array, sa = this.shedMesh.instanceMatrix.array;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), v = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const allLand = landPolys(year);
    this.piers.forEach((p, idx) => {
      const poly = polys[p.poly];
      const [ax, az] = poly[p.i], [bx, bz] = poly[(p.i + 1) % poly.length];
      const ex = bx - ax, ez = bz - az, el = Math.hypot(ex, ez) || 1;
      // outward normal (toward the water): try both sides, keep the one leaving the land polygon
      let nx = ez / el, nz = -ex / el;
      const px = ax + ex * p.t, pz = az + ez * p.t;
      const g = allLand.find(l => l.id === p.poly);
      if (g && inside(g.pts, px + nx * 20, pz + nz * 20)) { nx = -nx; nz = -nz; }
      p.on = year >= p.from && year < p.to;
      p.base = [px, pz]; p.n = [nx, nz];
      const ang = Math.atan2(-nz, nx);
      q.setFromAxisAngle(up, ang);
      const len = p.on ? p.len : 0.001;
      m4.compose(v.set(px + nx * len / 2 - nx * 6, WATER_Y - 1, pz + nz * len / 2 - nz * 6), q, s.set(len + 12, 3.6, p.w));
      m4.toArray(pa, idx * 16);
      const shed = p.on && year > 1880 && !p.seaport;
      m4.compose(v.set(px + nx * len / 2, WATER_Y + 2.6, pz + nz * len / 2), q, s.set(shed ? len * 0.9 : 0.001, shed ? 9 : 0.001, p.w * 0.8));
      m4.toArray(sa, idx * 16);
    });
    this.shedMesh.material = year > 1940 ? M.shedNew : M.shed;
    this.pierMesh.instanceMatrix.needsUpdate = true;
    this.shedMesh.instanceMatrix.needsUpdate = true;
    // ships tie up alongside
    for (const m of this.moorings) {
      const p = m.pier;
      m.on = p.on;
      const along = p.len * (0.35 + 0.4 * m.k);
      m.x = p.base[0] + p.n[0] * along - p.n[1] * m.side * (p.w / 2 + 9);
      m.z = p.base[1] + p.n[1] * along + p.n[0] * m.side * (p.w / 2 + 9);
      m.dx = p.n[0]; m.dz = p.n[1];
    }
  }

  update() {}

  bridgeLamps(year, out) {
    const v = new THREE.Vector3();
    for (const b of this.bridges) {
      if (year < b.open) continue;
      b.group.updateMatrixWorld();
      for (const l of b.lampsLocal) { v.copy(l).applyMatrix4(b.group.matrixWorld); out.push(v.x, v.y, v.z); }
    }
    return out;
  }
}

function inside(pts, x, z) {
  let c = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c;
  }
  return c;
}
function hash(a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }
