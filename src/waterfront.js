// The working waterfront: river and lake below street level (cut out of the ground with the
// stencil buffer), dock walls and seawalls, ~20 movable bridges, riverside streets, the Riverwalk,
// harbor piers, lighthouse, breakwaters and the mooring spots ships tie up at.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WATER_Y, shoreX, riverPaths, mainBranch, southBranchX } from './geo.js';
import { styleMaterial } from './materials.js';
import { ribbonGeometry, densify, offsetLine, wallGeometry, box, cyl, pyramid, strut } from './geom.js';
import { clamp, ramp } from './timeline.js';

export const MAIN_Z = -640;        // main branch centreline (z) along the Loop
export const MAIN_H = 32;          // half width of the main branch
export const SOUTH_H = 29;         // half width of the South Branch
export const QUAY = 6;             // quay between the dock wall and the riverside street
export const LSD_BRIDGE_X = shoreX(-640, 1945) - 230;

// [name, position along the river, swing-bridge year | null, bascule year | null, kind, removed]
const MAIN_BRIDGES = [
  ['Franklin St', -603, null, 1920], ['Wells St', -402, 1841, 1922], ['LaSalle St', -281, null, 1928],
  ['Clark St', -201, 1840, 1929], ['Dearborn St', -72, 1834, 1907], ['State St', 0, 1864, 1949],
  ['Wabash Ave', 100.6, null, 1930], ['Rush St', 150, 1856, null, 'normal', 1920],
  ['Michigan Ave', 201.2, null, 1920, 'grand'], ['Columbus Dr', 402, null, 1982],
  ['Lake Shore Dr', LSD_BRIDGE_X, null, 1937, 'wide'],
];
const SOUTH_BRIDGES = [
  ['Lake St', -402, 1857, 1916], ['Randolph St', -301, 1850, 1904], ['Washington St', -201, 1852, 1913],
  ['Madison St', 0, 1851, 1922], ['Monroe St', 201, 1855, 1919], ['Adams St', 402, 1856, 1927],
  ['Jackson Blvd', 603, 1858, 1916], ['Van Buren St', 804, 1860, 1956], ['Harrison St', 1207, 1865, 1960],
];

// ---------------- materials ----------------
const lambert = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, ...extra });
const M = {
  cut: new THREE.MeshBasicMaterial({
    colorWrite: false, depthWrite: false, depthTest: false,
    stencilWrite: true, stencilRef: 1, stencilFunc: THREE.AlwaysStencilFunc,
    stencilZPass: THREE.ReplaceStencilOp, stencilZFail: THREE.ReplaceStencilOp, stencilFail: THREE.ReplaceStencilOp,
  }),
  bank: lambert(0x3e4a2c, { side: THREE.DoubleSide }),
  wallWood: lambert(0x4e4134, { side: THREE.DoubleSide }),
  wallStone: lambert(0x8e897e, { side: THREE.DoubleSide }),
  seawall: lambert(0x9c978b, { side: THREE.DoubleSide }),
  planks: lambert(0x6f5c45),
  asphalt: lambert(0x2c2d30),
  pavers: lambert(0xb8b0a2),
  steel: styleMaterial('steel'),
  timber: styleMaterial('timber'),
  brick: styleMaterial('brick'),
  white: styleMaterial('white'),
  deco: styleMaterial('deco'),
  stone: styleMaterial('stone'),
  roof: lambert(0x3d4146),
  red: lambert(0xa8322a),
  leaf: lambert(0x3f6a2c),
  lantern: new THREE.MeshStandardMaterial({ color: 0xfff2c0, emissive: 0xffe08a, emissiveIntensity: 0.2 }),
};

function roadTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#9c968b'; g.fillRect(0, 0, 64, 256);              // sidewalks
  g.fillStyle = '#2f3033'; g.fillRect(9, 0, 46, 256);               // asphalt
  g.fillStyle = '#d8d2c0'; g.fillRect(31, 0, 2, 120);               // dashed centre line
  g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(20, 0, 1, 256); g.fillRect(43, 0, 1, 256);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const ROAD_MAT = new THREE.MeshLambertMaterial({ map: roadTexture() });
const DIRT_ROAD = lambert(0x6b5d48);

// ---------------- bridges ----------------
// A pony truss along one side of a deck: chords, verticals and alternating diagonals.
function trussParts(x, length, height, z0, panel = 5) {
  const parts = [box(0.45, 0.45, length, x, 0.45, z0 + length / 2), box(0.45, 0.45, length, x, 0.45 + height, z0 + length / 2)];
  const n = Math.max(2, Math.round(length / panel));
  for (let i = 0; i <= n; i++) {
    const z = z0 + length * i / n;
    parts.push(box(0.35, height, 0.35, x, 0.45, z));
    if (i < n) {
      const zn = z0 + length * (i + 1) / n;
      parts.push(i % 2 ? strut(x, 0.45, z, 0.45 + height, zn) : strut(x, 0.45 + height, z, 0.45, zn));
    }
  }
  return parts;
}

class Bridge {
  constructor(scene, def) {
    Object.assign(this, def);
    this.open = 0;
    this.root = new THREE.Group();
    this.root.position.set(this.cx, 0, this.cz);
    if (this.axis === 'x') this.root.rotation.y = Math.PI / 2;
    scene.add(this.root);
    const h = this.h;
    const W = this.kind === 'grand' ? 28 : this.kind === 'wide' ? 38 : 16;
    this.W = W;

    // ---------- swing bridge (wood, later iron) turning on a pivot pier ----------
    if (this.swingFrom != null) {
      this.swing = new THREE.Group();
      const L = 2 * h + 10, Ws = 12;
      const deck = new THREE.Mesh(box(Ws, 0.8, L, 0, -0.35, 0), M.planks);
      const truss = mergeGeometries([
        ...trussParts(-Ws / 2 - 0.3, L, 3.4, -L / 2, 6),
        ...trussParts(Ws / 2 + 0.3, L, 3.4, -L / 2, 6),
        box(1.2, 5.5, 1.2, -Ws / 2 - 0.3, 0.45, 0), box(1.2, 5.5, 1.2, Ws / 2 + 0.3, 0.45, 0),
      ]);
      this.swingTruss = new THREE.Mesh(truss, M.timber);
      for (const m of [deck, this.swingTruss]) { m.castShadow = true; m.receiveShadow = true; this.swing.add(m); }
      this.swingDeck = deck;
      const pier = new THREE.Mesh(cyl(7, 7, -0.6 - (WATER_Y - 1), 0, WATER_Y - 1, 0, 16), M.stone);
      this.swing.add(pier);
      this.root.add(this.swing);
    }

    // ---------- Chicago-type trunnion bascule: two leaves that tip up ----------
    if (this.basculeFrom != null) {
      this.bascule = new THREE.Group();
      this.leaves = [];
      const steel = [], road = [];
      // leaf built for the +z direction, pivot at its own origin
      road.push(box(W - 1.5, 0.08, h + 0.3, 0, 0.42, h / 2));
      steel.push(box(W, 0.9, h + 0.3, 0, -0.5, h / 2));
      steel.push(box(1, 2.4, h, -W / 3, -2.9, h / 2), box(1, 2.4, h, W / 3, -2.9, h / 2));
      if (this.kind === 'normal') {
        steel.push(...trussParts(-W / 2 - 0.25, h, 2.6, 0, 4.5), ...trussParts(W / 2 + 0.25, h, 2.6, 0, 4.5));
      } else {
        // heavy girders and ornamental railings
        for (const s of [-1, 1]) {
          steel.push(box(0.6, 1.2, h, s * (W / 2 - 0.3), 0.45, h / 2));
          for (let z = 2; z < h; z += 2.5) steel.push(box(0.25, 1.2, 0.25, s * (W / 2 - 0.3), 0.45, z));
        }
        if (this.kind === 'grand') road.push(box(1, 0.1, h, 0, 0.5, h / 2)); // median
      }
      const steelGeo = mergeGeometries(steel), roadGeo = mergeGeometries(road);
      for (const dir of [1, -1]) {
        const leaf = new THREE.Group();
        leaf.position.z = -dir * h;
        const s = new THREE.Mesh(dir === 1 ? steelGeo : steelGeo.clone().rotateY(Math.PI), M.steel);
        const r = new THREE.Mesh(dir === 1 ? roadGeo : roadGeo.clone().rotateY(Math.PI), M.asphalt);
        for (const m of [s, r]) { m.castShadow = true; m.receiveShadow = true; leaf.add(m); }
        leaf.userData.dir = dir;
        this.bascule.add(leaf);
        this.leaves.push(leaf);
      }
      // bridge-tender houses on the four corners
      const houses = [], roofs = [];
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx * (W / 2 + 4), z = sz * (h + 3.2);
        if (this.kind === 'grand') { houses.push(box(9, 16, 6, sx * (W / 2 + 5.5), 0, z)); roofs.push(pyramid(9.5, 3, sx * (W / 2 + 5.5), 16, z)); }
        else if (this.kind === 'wide') { houses.push(box(7, 9, 5, sx * (W / 2 + 4.5), 0, z)); roofs.push(box(7.6, 0.8, 5.6, sx * (W / 2 + 4.5), 9, z)); }
        else { houses.push(box(5, 5.5, 4.5, x, 0, z)); roofs.push(pyramid(6, 2.6, x, 5.5, z)); }
      }
      const hm = new THREE.Mesh(mergeGeometries(houses), this.kind === 'grand' ? M.white : this.kind === 'wide' ? M.deco : M.brick);
      const rm = new THREE.Mesh(mergeGeometries(roofs), M.roof);
      for (const m of [hm, rm]) { m.castShadow = true; m.receiveShadow = true; this.bascule.add(m); }
      this.root.add(this.bascule);
    }

    // lamp posts along both railings (local coords; transformed in lampPositions)
    this.lampsLocal = [];
    for (let z = -h + 4; z <= h - 4; z += 12) for (const s of [-1, 1]) this.lampsLocal.push(new THREE.Vector3(s * (W / 2 - 0.4), 5, z));
  }

  // footprint test used by the traffic lanes
  contains(x, z) {
    const dx = x - this.cx, dz = z - this.cz;
    const along = this.axis === 'z' ? dz : dx, across = this.axis === 'z' ? dx : dz;
    return Math.abs(along) < this.h + 1 && Math.abs(across) < this.W / 2 + 1;
  }
  exists(year) { return year >= this.from && year < this.to; }
  passable(year) { return this.exists(year) && this.open < 0.04; }

  update(year, dt, ships) {
    const swingOn = this.swing && year >= this.swingFrom && year < (this.basculeFrom ?? this.to);
    const basOn = this.bascule && year >= this.basculeFrom && year < this.to;
    this.root.visible = !!(swingOn || basOn);
    if (this.swing) this.swing.visible = !!swingOn;
    if (this.bascule) this.bascule.visible = !!basOn;
    if (!this.root.visible) { this.open = 0; return; }
    // open for any tall-masted vessel approaching along the river
    let want = 0;
    for (const s of ships) {
      if (!s.tall) continue;
      if (Math.hypot(s.x - this.cx, s.z - this.cz) < 85) { want = 1; break; }
    }
    this.open = clamp(this.open + (want ? 1 : -1) * dt * 0.8, 0, 1);
    const e = this.open * this.open * (3 - 2 * this.open);
    if (swingOn) {
      this.swing.rotation.y = e * Math.PI / 2;
      this.swingTruss.material = year < 1866 ? M.timber : M.steel;
      this.swingDeck.material = year < 1885 ? M.planks : M.asphalt;
    }
    if (basOn) for (const leaf of this.leaves) leaf.rotation.x = -leaf.userData.dir * e * 1.22;
  }
}

// ---------------- the waterfront ----------------
export class Waterfront {
  constructor(scene, waterNormal, lakeMat, riverMat) {
    this.scene = scene;
    this.lakeMat = lakeMat;
    this.riverMat = riverMat;
    this.waterNormal = waterNormal;

    // lake: water at WATER_Y, a stencil cutter on the ground plane, and a seawall along the shore
    this.lakeGeo = buildLakeGeometry();
    this.lake = new THREE.Mesh(this.lakeGeo, lakeMat);
    this.lake.position.y = WATER_Y;
    this.lake.receiveShadow = true;
    this.lakeCut = new THREE.Mesh(this.lakeGeo, M.cut);
    this.lakeCut.renderOrder = -100;
    this.seawall = new THREE.Mesh(new THREE.BufferGeometry(), M.seawall);
    scene.add(this.lake, this.lakeCut, this.seawall);

    this.river = new THREE.Group();
    scene.add(this.river);
    this.riverKey = '';

    // bridges
    this.bridges = [];
    for (const [name, x, sw, ba, kind = 'normal', removed = 9999] of MAIN_BRIDGES) {
      this.bridges.push(new Bridge(scene, { name, cx: x, cz: MAIN_Z, axis: 'z', h: MAIN_H, kind,
        swingFrom: sw, basculeFrom: ba, from: sw ?? ba, to: removed }));
    }
    for (const [name, z, sw, ba] of SOUTH_BRIDGES) {
      this.bridges.push(new Bridge(scene, { name, cx: southBranchX(z), cz: z, axis: 'x', h: SOUTH_H, kind: 'normal',
        swingFrom: sw, basculeFrom: ba, from: sw ?? ba, to: 9999 }));
    }

    // riverside streets (and their traffic lanes)
    const off = (h) => h + QUAY + 8;
    const southBank = [], northBank = [], eastSB = [], westSB = [];
    for (let z = MAIN_Z + off(MAIN_H); z <= 1060; z += 20) eastSB.push([southBranchX(z) + off(SOUTH_H), z]);
    for (let x = eastSB[0][0]; x <= 201.2; x += 20) southBank.push([x, MAIN_Z + off(MAIN_H)]);
    for (let x = -655; x <= 201.2; x += 20) northBank.push([x, MAIN_Z - off(MAIN_H)]);
    for (let z = -560; z <= 1500; z += 20) westSB.push([southBranchX(z) - off(SOUTH_H), z]);
    const wackerEast = [];
    for (let x = 201.2; x <= LSD_BRIDGE_X - 40; x += 20) wackerEast.push([x, MAIN_Z + off(MAIN_H)]);
    this.roads = [
      { name: 'South Water St → Wacker Dr', pts: southBank, from: 1838, paved: 1885 },
      { name: 'Kinzie St / North Water St', pts: northBank, from: 1845, paved: 1890 },
      { name: 'Market St → Wacker Dr', pts: eastSB, from: 1845, paved: 1890 },
      { name: 'Canal St', pts: westSB, from: 1850, paved: 1895 },
      { name: 'Wacker Dr (east)', pts: wackerEast, from: 1975, paved: 1975 },
    ];
    for (const r of this.roads) {
      const g = ribbonGeometry(r.pts, 16, 0.3);
      r.mesh = new THREE.Mesh(g, DIRT_ROAD);
      r.mesh.receiveShadow = true;
      scene.add(r.mesh);
    }

    // Riverwalk (2009–2016), built east to west along the south bank at water level
    this.riverwalk = [];
    const rwZ = MAIN_Z + MAIN_H - 5.5, rwTop = WATER_Y + 1.4;
    const segs = [[201, 420, 2009], [0, 201, 2010.5], [-201, 0, 2012], [-402, -201, 2014], [-600, -402, 2015], [-720, -600, 2016]];
    const treeGeo = new THREE.IcosahedronGeometry(1, 0);
    for (const [x0, x1, y] of segs) {
      const parts = [box(x1 - x0, 1.5, 9, (x0 + x1) / 2, WATER_Y - 0.1, rwZ)];
      const g = new THREE.Group();
      g.add(new THREE.Mesh(mergeGeometries(parts), M.pavers));
      const trees = [];
      for (let x = x0 + 8; x < x1 - 4; x += 18) trees.push(treeGeo.clone().scale(2.6, 3.2, 2.6).translate(x, rwTop + 3.2, rwZ + 2.5));
      if (trees.length) g.add(new THREE.Mesh(mergeGeometries(trees), M.leaf));
      g.children.forEach(m => { m.receiveShadow = true; m.castShadow = true; });
      g.userData = { from: y, x0, x1 };
      scene.add(g);
      this.riverwalk.push(g);
    }

    // harbor piers flanking the river mouth, the lighthouse and two generations of breakwater
    this.piers = [MAIN_Z - MAIN_H - 7, MAIN_Z + MAIN_H + 7].map((z, i) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0), M.timber);
      m.userData = { z, north: i === 0 };
      m.castShadow = m.receiveShadow = true;
      scene.add(m);
      return m;
    });
    this.lighthouse = buildLighthouse();
    scene.add(this.lighthouse);
    this.breakwaters = [
      { x: 1260, segs: [[-1500, -760], [-540, 300]], from: 1870, to: 1914 },
      { x: 2300, segs: [[-2600, -780], [-500, 1800]], from: 1913, to: 9999 },
    ].map(b => {
      const g = mergeGeometries(b.segs.map(([z0, z1]) => box(10, 3.4, z1 - z0, b.x, WATER_Y - 1, (z0 + z1) / 2)));
      const m = new THREE.Mesh(g, M.wallStone);
      m.userData = b;
      m.receiveShadow = true;
      scene.add(m);
      return m;
    });

    // places where ships tie up: along both dock walls and Navy Pier
    this.moorings = [];
    const main = densify(mainBranch(2060), 34, 0);
    for (const side of [1, -1]) {
      for (const [x, z] of offsetLine(main, side * (MAIN_H - 6))) {
        if (x < -690 || this.bridges.some(b => b.axis === 'z' && Math.abs(b.cx - x) < 30)) continue;
        this.moorings.push({ x, z, dx: 1, dz: 0, where: 'river', k: hash(x, z) });
      }
      for (let z = -560; z < 1500; z += 34) {
        if (this.bridges.some(b => b.axis === 'x' && Math.abs(b.cz - z) < 30)) continue;
        this.moorings.push({ x: southBranchX(z) + side * (SOUTH_H - 6), z, dx: 0, dz: 1, where: 'river', k: hash(z, side) });
      }
    }
    for (const side of [1, -1]) for (let x = 1200; x < 2100; x += 75) this.moorings.push({ x, z: -1110 + side * 60, dx: 1, dz: 0, where: 'pier', k: hash(x, side * 3) });
    for (let x = -150; x < 400; x += 55) this.moorings.push({ x, z: rwZ - 9, dx: 1, dz: 0, where: 'riverwalk', k: hash(x, 9) });

    this.lamps = [];
    this.beacon = null;
    this.lastShore = -1;
  }

  // x where the river currently meets the lake
  mouthX(year) { return shoreX(MAIN_Z, year) + 30; }

  setYear(year) {
    // shoreline-dependent pieces (rebuilt only when the shore moved)
    if (Math.abs(year - this.lastShore) > 0.25) {
      this.lastShore = year;
      updateLakeGeometry(this.lakeGeo, year);
      const pts = this.lakeGeo.userData.zs.filter(z => z > -9000 && z < 9000).map(z => [shoreX(z, year) - 4, z]);
      this.seawall.geometry.dispose();
      this.seawall.geometry = wallGeometry(pts, WATER_Y - 0.6, 0.15);
      this.seawall.material = year < 1880 ? M.wallWood : M.seawall;
    }
    this.updateRiver(year);

    for (const r of this.roads) {
      r.mesh.visible = year >= r.from;
      r.mesh.material = year < r.paved ? DIRT_ROAD : ROAD_MAT;
    }
    for (const g of this.riverwalk) g.visible = year >= g.userData.from;

    // piers grow out after the 1833 harbor cut and follow the shore as it is filled in
    const mx = shoreX(MAIN_Z, year);
    const grow = ramp(year, 1833, 1845);
    for (const p of this.piers) {
      const { z, north } = p.userData;
      const x0 = shoreX(z, year) - 40, x1 = mx + (north ? 560 : 420) * grow;
      p.visible = year >= 1833;
      p.position.set(x0, WATER_Y - 1, z);
      p.scale.set(Math.max(1, x1 - x0), 3.4, 12);
      p.material = year < 1905 ? M.timber : M.wallStone;
    }
    const lh = this.lighthouse;
    lh.visible = year >= 1859;
    if (year < 1919) lh.position.set(mx + 560 * grow - 8, WATER_Y + 2.4, MAIN_Z - MAIN_H - 7);
    else lh.position.set(2300, WATER_Y + 2.4, -770);
    this.beacon = lh.visible ? { x: lh.position.x, y: lh.position.y + 17, z: lh.position.z } : null;
    for (const b of this.breakwaters) b.visible = year >= b.userData.from && year < b.userData.to;

    // lamp posts along the riverside streets (gas → electric)
    this.lamps.length = 0;
    if (year > 1855) {
      for (const r of this.roads) {
        if (year < r.from + 10) continue;
        for (const side of [1, -1]) for (const [x, z] of offsetLine(r.pts, side * 7.2).filter((_, i) => i % 2 === 0)) this.lamps.push(x, 5, z);
      }
      for (const g of this.riverwalk) if (year >= g.userData.from) {
        for (let x = g.userData.x0 + 4; x < g.userData.x1; x += 14) this.lamps.push(x, WATER_Y + 4.5, MAIN_Z + MAIN_H - 9);
      }
    }
  }

  updateRiver(year) {
    const key = year < 1833 ? 'old' : Math.round(shoreX(MAIN_Z, year) / 10);
    // natural banks → timber dock walls (from the 1830s) → stone and concrete (from 1900)
    const era = year < 1835 ? 0 : year < 1900 ? 1 : 2;
    if (key === this.riverKey && this.riverEra === era) return;
    this.riverKey = key;
    this.riverEra = era;
    this.river.children.forEach(c => { if (c.geometry !== this._shared) c.geometry.dispose(); });
    this.river.clear();
    for (const r of riverPaths(year)) {
      const pts = densify(r.pts, 30);
      const g = ribbonGeometry(pts, r.w, 0);
      const p = g.attributes.position.array, uv = g.attributes.uv.array;
      for (let i = 0; i < p.length / 3; i++) { uv[i * 2] = p[i * 3] / 90; uv[i * 2 + 1] = p[i * 3 + 2] / 90; }
      const water = new THREE.Mesh(g, this.riverMat);
      water.position.y = WATER_Y;
      water.receiveShadow = true;
      const cut = new THREE.Mesh(g, M.cut);
      cut.renderOrder = -100;
      const walls = new THREE.Mesh(mergeGeometries([
        wallGeometry(offsetLine(pts, r.w / 2), WATER_Y - 0.6, 0.2),
        wallGeometry(offsetLine(pts, -r.w / 2), WATER_Y - 0.6, 0.2),
      ]), [M.bank, M.wallWood, M.wallStone][era]);
      walls.receiveShadow = true;
      this.river.add(water, cut, walls);
    }
  }

  update(year, dt, ships) {
    for (const b of this.bridges) b.update(year, dt, ships);
  }

  // lamp positions of the bridges currently down (world space), for the night glow layer
  bridgeLamps(year, out) {
    const v = new THREE.Vector3();
    for (const b of this.bridges) {
      if (!b.root.visible || b.open > 0.04 || year < 1855) continue;
      b.root.updateMatrixWorld();
      for (const l of b.lampsLocal) { v.copy(l).applyMatrix4(b.root.matrixWorld); out.push(v.x, v.y, v.z); }
    }
    return out;
  }
}

function hash(a, b) { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

function buildLighthouse() {
  const g = new THREE.Group();
  const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
  add(cyl(4.2, 4.2, 3, 0, 0, 0, 16), M.stone);
  add(mergeGeometries([box(9, 4, 6, 6, 0, 0)]), M.red);                  // fog-signal house
  add(cyl(2.7, 2.1, 14, 0, 3, 0, 14), M.white);
  add(cyl(3, 3, 0.5, 0, 17, 0, 14), M.roof);
  add(cyl(1.7, 1.7, 2.4, 0, 17.5, 0, 12), M.lantern);
  add(new THREE.ConeGeometry(2.3, 2.6, 12).translate(0, 21.2, 0), M.red);
  return g;
}

function buildLakeGeometry() {
  const zs = [];
  for (let z = -40000; z < -9000; z += 1000) zs.push(z);
  for (let z = -9000; z <= 9000; z += 20) zs.push(z);
  for (let z = 10000; z <= 40000; z += 1000) zs.push(z);
  const pos = new Float32Array(zs.length * 6), uv = new Float32Array(zs.length * 4), idx = [];
  zs.forEach((z, i) => {
    pos.set([0, 0, z, 60000, 0, z], i * 6);
    if (i > 0) { const k = (i - 1) * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(zs.length * 6).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  g.userData.zs = zs;
  return g;
}
function updateLakeGeometry(g, year) {
  const pos = g.attributes.position.array, uv = g.attributes.uv.array;
  g.userData.zs.forEach((z, i) => {
    const x = shoreX(clamp(z, -15000, 15000), year) - 4;
    pos[i * 6] = x;
    uv[i * 4] = x / 260; uv[i * 4 + 1] = z / 260; uv[i * 4 + 2] = 60000 / 260; uv[i * 4 + 3] = z / 260;
  });
  g.attributes.position.needsUpdate = true;
  g.attributes.uv.needsUpdate = true;
  g.computeBoundingSphere();
}
