// Hand-modelled landmarks with real positions and dates. Each one rises during its
// construction years and shrinks away when demolished.
import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { styleMaterial } from './materials.js';
import { WATER_Y } from './geo.js';
import { clamp, smoothstep } from './timeline.js';

// ---------- geometry helpers (geometry is translated, so every part of a landmark shares one facade seed) ----------
function taper(wb, db, wt, dt, h) {
  const g = new THREE.BoxGeometry(1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    p.setX(i, p.getX(i) * (top ? wt : wb));
    p.setZ(i, p.getZ(i) * (top ? dt : db));
    p.setY(i, (p.getY(i) + 0.5) * h);
  }
  g.computeVertexNormals();
  return g;
}

class Kit {
  constructor(group) { this.g = group; this.glows = []; }
  mesh(geo, style, x = 0, y = 0, z = 0, ry = 0) {
    if (ry) geo.rotateY(ry);
    geo.translate(x, y, z);
    const mat = typeof style === 'string' ? styleMaterial(style) : style;
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    this.g.add(m);
    return m;
  }
  box(w, h, d, style, x = 0, y = 0, z = 0, ry = 0) {
    return this.mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0), style, x, y, z, ry);
  }
  taper(wb, db, wt, dt, h, style, x = 0, y = 0, z = 0, ry = 0) {
    return this.mesh(taper(wb, db, wt, dt, h), style, x, y, z, ry);
  }
  cyl(r, h, style, x = 0, y = 0, z = 0, seg = 24, rTop = r) {
    return this.mesh(new THREE.CylinderGeometry(rTop, r, h, seg).translate(0, h / 2, 0), style, x, y, z);
  }
  pyramid(w, h, style, x = 0, y = 0, z = 0, d = w) {
    const g = new THREE.CylinderGeometry(0, Math.SQRT1_2, 1, 4, 1).rotateY(Math.PI / 4).scale(w, h, d).translate(0, h / 2, 0);
    return this.mesh(g, style, x, y, z);
  }
  // lit element whose emissive follows the night factor (crowns, beacons…)
  glow(geo, color, strength, x = 0, y = 0, z = 0, dayColor = 0x888888) {
    const mat = new THREE.MeshStandardMaterial({ color: dayColor, emissive: color, emissiveIntensity: 0, roughness: 0.6 });
    geo.translate(x, y, z);
    const m = new THREE.Mesh(geo, mat);
    this.g.add(m);
    this.glows.push({ mat, strength });
    return m;
  }
}

const mirror = new THREE.MeshStandardMaterial({ color: 0xdfe3e8, metalness: 1, roughness: 0.05 });
const steelMat = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.35 });
const waterMat = new THREE.MeshStandardMaterial({ color: 0x5b8fa0, roughness: 0.1, metalness: 0.1 });

// ---------- landmark catalogue ----------
// x/z: meters from State & Madison (+x east, +z south). from/to: years. build: construction years.
export const LANDMARKS = [
  { id: 'dusable', x: 215, z: -730, from: 1784, to: 1830, build: 0.5, label: y => (y < 1804 ? 'Du Sable trading post' : 'Kinzie House'),
    make: k => { k.box(14, 4, 9, 'timber'); k.pyramid(15, 3, 'bark', 0, 4, 0, 10); k.box(8, 3, 6, 'timber', 14, 0, 4); } },
  { id: 'fort1', x: 225, z: -570, from: 1803, to: 1812.62, build: 0.6, demo: 0.05, label: () => 'Fort Dearborn',
    make: fortDearborn },
  { id: 'fort2', x: 225, z: -570, from: 1816, to: 1857, build: 0.6, label: () => 'Fort Dearborn (II)',
    make: fortDearborn },
  { id: 'watertower', x: 185, z: -1620, from: 1867, to: 9999, build: 2, label: () => 'Water Tower', clear: [24, 24],
    make: k => { k.box(22, 12, 22, 'stone'); k.box(8, 32, 8, 'stone', 0, 12, 0); k.cyl(3.5, 10, 'stone', 0, 44, 0, 8); k.pyramid(5, 6, 'steel', 0, 54, 0);
      for (const [a, b] of [[-10, -10], [10, -10], [-10, 10], [10, 10]]) k.cyl(1.6, 16, 'stone', a, 0, b, 8); } },
  { id: 'homeins', x: -281, z: 400, from: 1884, to: 1931, build: 1.5, label: () => 'Home Insurance Building', clear: [22, 30],
    make: k => { k.box(42, 42, 30, 'stone'); k.box(30, 13, 20, 'stone', 0, 42, 0); } },
  { id: 'monadnock', x: -72, z: 720, from: 1889, to: 9999, build: 2, clear: [12, 32],
    make: k => { k.box(20, 60, 62, 'brick'); } },
  { id: 'auditorium', x: 150, z: 950, from: 1887, to: 9999, build: 2.5, label: () => 'Auditorium Building', clear: [48, 52],
    make: k => { k.box(95, 45, 100, 'stone'); k.box(22, 28, 22, 'stone', 0, 45, 30); } },
  { id: 'artinst', x: 300, z: 400, from: 1892, to: 9999, build: 1.5, label: () => 'Art Institute',
    make: k => { k.box(55, 22, 110, 'stone'); k.pyramid(14, 5, 'steel', 0, 22, 0); k.box(70, 14, 70, 'white', 70, 0, 20); } },
  { id: 'navypier', x: 1640, z: -1110, from: 1914, to: 9999, build: 2, label: y => (y < 1927 ? 'Municipal Pier' : 'Navy Pier'),
    make: k => {
      const D = 1.2;                                                     // deck level
      k.box(1100, D - WATER_Y + 0.5, 100, 'concrete', -40, WATER_Y - 0.5, 0);   // pier on its pilings
      for (const s of [-1, 1]) {
        k.box(900, 10, 30, 'brick', 10, D, s * 30);                      // freight & passenger sheds
        for (let x = -430; x <= 450; x += 30) k.box(3, 12, 32, 'brick', x, D, s * 30);   // shed bays
        k.box(900, 1.2, 8, 'steel', 10, D + 10, s * 46);                 // roofed loading galleries
      }
      k.box(70, 24, 100, 'brick', -500, D, 0);                           // Head House
      for (const s of [-1, 1]) { k.box(12, 36, 12, 'brick', -500, D, s * 38); k.pyramid(13, 8, 'steel', -500, D + 36, s * 38); }
      k.cyl(28, 18, 'brick', 480, D, 0, 24);                             // East End auditorium
      k.mesh(new THREE.SphereGeometry(28, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2), 'concrete', 480, D + 18, 0);
      k.box(40, 6, 70, 'concrete', 400, D, 0);
    } },
  { id: 'ferris', x: 1290, z: -1110, from: 1994.5, to: 9999, build: 0.8, label: y => (y < 2016 ? 'Navy Pier Ferris Wheel' : 'Centennial Wheel'),
    make: k => { const t = k.mesh(new THREE.TorusGeometry(42, 1.4, 6, 48), steelMat, 0, 48, 0); k.mesh(new THREE.CylinderGeometry(1.5, 3, 48, 6).translate(0, 24, 0), steelMat);
      for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; const s = new THREE.BoxGeometry(0.6, 84, 0.6); s.rotateZ(a); k.mesh(s, steelMat, 0, 48, 0); }
      k.glow(new THREE.TorusGeometry(42.5, 0.7, 4, 64), 0xff3366, 3, 0, 48, 0); } },
  // grain elevators: wooden giants lining the river until the 1920s
  ...[[300, -722, 1855, 1912], [-640, -722, 1858, 1927], [-860, 260, 1862, 1925], [-868, 820, 1866, 1928], [-885, 1560, 1870, 1930]].map(([x, z, from, to], i) => ({
    id: 'elevator' + i, x, z, from, to, build: 1.5, label: () => 'Grain elevator', clear: [16, 14],
    make: k => { k.box(26, 40, 20, from < 1865 ? 'timber' : 'industrial'); k.box(12, 16, 10, 'timber', 0, 40, 0); k.pyramid(13, 5, 'steel', 0, 56, 0); k.box(5, 4, 22, 'timber', 0, 28, 18); },
  })),
  { id: 'wrigley', x: 168, z: -770, from: 1920, to: 9999, build: 1.5, label: () => 'Wrigley Building', clear: [28, 32],
    make: k => { k.box(55, 92, 34, 'white', 0, 0, 10); k.box(55, 50, 28, 'white', 0, 0, -30); k.box(16, 26, 16, 'white', 0, 92, 18); k.cyl(6, 12, 'white', 0, 118, 18, 8); k.pyramid(7, 8, 'steel', 0, 130, 18);
      k.glow(new THREE.CylinderGeometry(9, 9, 6, 8).translate(0, 107, 18), 0xffffff, 1.2, 0, 0, 0, 0xeeeeee); } },
  { id: 'tribune', x: 255, z: -860, from: 1923, to: 9999, build: 2, label: () => 'Tribune Tower', clear: [24, 24],
    make: k => { k.box(42, 100, 42, 'stone'); k.box(26, 24, 26, 'stone', 0, 100, 0);
      for (const [a, b] of [[-12, -12], [12, -12], [-12, 12], [12, 12]]) k.taper(4, 4, 0.5, 0.5, 18, 'stone', a, 124, b);
      k.taper(16, 16, 4, 4, 18, 'stone', 0, 124, 0); } },
  { id: 'carbide', x: 150, z: -470, from: 1928, to: 9999, build: 1.5, label: () => 'Carbide & Carbon Building', clear: [16, 16],
    make: k => { k.box(30, 112, 30, 'darkgreen'); k.box(18, 20, 18, 'darkgreen', 0, 112, 0); k.taper(12, 12, 2, 2, 22, 'gold', 0, 132, 0); } },
  { id: 'palmolive', x: 190, z: -1580, from: 1928, to: 9999, build: 1.5, label: () => 'Palmolive Building', clear: [26, 22],
    make: k => { k.box(52, 95, 42, 'stone'); k.box(38, 25, 30, 'stone', 0, 95, 0); k.box(24, 16, 18, 'stone', 0, 120, 0); k.cyl(1.2, 14, steelMat, 0, 136, 0, 6); } },
  { id: 'merchmart', x: -500, z: -745, from: 1929, to: 9999, build: 1.8, label: () => 'Merchandise Mart', clear: [90, 52],
    make: k => { k.box(175, 72, 100, 'stone'); k.box(120, 12, 70, 'stone', 0, 72, 0); k.box(36, 22, 36, 'stone', 0, 84, 0); } },
  { id: 'opera', x: -700, z: 250, from: 1928, to: 9999, build: 1.5, label: () => 'Civic Opera House', clear: [22, 56],
    make: k => { k.box(40, 75, 105, 'stone'); k.box(40, 95, 38, 'stone', 0, 75, 0); } },
  { id: 'cbot', x: -281, z: 680, from: 1929, to: 9999, build: 1.5, label: () => 'Chicago Board of Trade', clear: [28, 28],
    make: k => { k.box(52, 100, 52, 'deco'); k.box(34, 40, 34, 'deco', 0, 100, 0); k.pyramid(30, 18, 'steel', 0, 140, 0); k.cyl(1.4, 9, 'gold', 0, 158, 0, 6);
      k.glow(new THREE.BoxGeometry(35, 6, 35).translate(0, 136, 0), 0xffd59a, 0.5, 0, 0, 0, 0xc4b59b); } },
  { id: 'buckingham', x: 720, z: 1000, from: 1927, to: 9999, build: 0.5, label: () => 'Buckingham Fountain',
    make: k => { k.cyl(45, 1.2, 'stone', 0, 0, 0, 32); k.cyl(42, 0.6, waterMat, 0, 1.2, 0, 32); k.cyl(16, 4, 'stone', 0, 0, 0, 24); k.cyl(10, 3, 'stone', 0, 4, 0, 20); k.cyl(5, 3, 'stone', 0, 7, 0, 16); } },
  { id: 'field', x: 640, z: 2950, from: 1919, to: 9999, build: 2, label: () => 'Field Museum',
    make: k => { k.box(110, 26, 230, 'white'); k.box(40, 36, 60, 'white'); } },
  { id: 'soldier', x: 640, z: 3480, from: 1922, to: 9999, build: 2, label: () => 'Soldier Field',
    make: k => { k.box(30, 26, 290, 'white', -95, 0, 0); k.box(30, 26, 290, 'white', 95, 0, 0); k.box(200, 12, 40, 'stone', 0, 0, 160); } },
  { id: 'soldierbowl', x: 640, z: 3480, from: 2002, to: 9999, build: 1.5,
    make: k => { const g = new THREE.CylinderGeometry(95, 80, 42, 32, 1, true).scale(1, 1, 1.25).translate(0, 21, 0); k.mesh(g, 'glass'); } },
  { id: 'shedd', x: 1150, z: 2820, from: 1928, to: 9999, build: 1.5, label: () => 'Shedd Aquarium',
    make: k => { k.cyl(48, 20, 'white', 0, 0, 0, 8); k.cyl(18, 10, 'white', 0, 20, 0, 8); k.pyramid(16, 8, 'steel', 0, 30, 0); } },
  { id: 'adler', x: 1430, z: 2860, from: 1929, to: 9999, build: 1, label: () => 'Adler Planetarium',
    make: k => { k.cyl(26, 14, 'brick', 0, 0, 0, 12); k.mesh(new THREE.SphereGeometry(14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), steelMat, 0, 14, 0); } },
  { id: 'prudential', x: 280, z: -355, from: 1953, to: 9999, build: 2, label: () => 'Prudential Building', clear: [32, 24],
    make: k => { k.box(62, 183, 40, 'modern'); k.cyl(1.5, 60, steelMat, 0, 183, 0, 6); } },
  { id: 'marina', x: -40, z: -712, from: 1962, to: 9999, build: 2, label: () => 'Marina City', clear: [40, 22],
    make: k => { for (const dx of [-21, 21]) { k.cyl(15, 179, 'concrete', dx, 0, 0, 24); } } },
  { id: 'chase', x: -72, z: 0, from: 1967, to: 9999, build: 2.5, clear: [32, 24],
    make: k => { k.taper(62, 42, 46, 32, 259, 'modern'); } },
  { id: 'lakepoint', x: 1240, z: -1000, from: 1966, to: 9999, build: 2, label: () => 'Lake Point Tower',
    make: k => { for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; k.cyl(24, 197, 'mies', Math.cos(a) * 20, 0, Math.sin(a) * 20, 24); } } },
  { id: 'hancock', x: 215, z: -1765, from: 1966, to: 9999, build: 2.8, label: y => (y < 2018 ? 'John Hancock Center' : '875 N Michigan (Hancock)'), clear: [30, 44],
    make: k => { k.taper(50, 80, 31, 49, 344, 'mies'); k.cyl(1.5, 110, steelMat, -8, 344, 0, 6); k.cyl(1.5, 110, steelMat, 8, 344, 0, 6);
      k.glow(new THREE.BoxGeometry(32, 4, 50).translate(0, 340, 0), 0xffffff, 1.6, 0, 0, 0, 0x222222); } },
  { id: 'aon', x: 480, z: -335, from: 1971, to: 9999, build: 2.5, label: y => (y < 1985 ? 'Standard Oil Building' : y < 1999 ? 'Amoco Building' : 'Aon Center'), clear: [32, 32],
    make: k => { k.box(59, 346, 59, 'white'); } },
  { id: 'willis', x: -705, z: 500, from: 1970.5, to: 9999, build: 2.6, label: y => (y < 2009.5 ? 'Sears Tower' : 'Willis Tower'), clear: [38, 38],
    make: k => {
      const t = 23, fl = 4.04;
      const floors = [[66, 108, 66], [90, 108, 90], [50, 66, 50]];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) k.box(t, floors[r][c] * fl, t, 'mies', (c - 1) * t, 0, (r - 1) * t);
      k.cyl(1.6, 85, 'white', -6, 108 * fl, -8, 6); k.cyl(1.6, 85, 'white', 6, 108 * fl, -8, 6);
      k.glow(new THREE.SphereGeometry(1.5, 6, 4).translate(-6, 108 * fl + 85, -8), 0xff2200, 6);
      k.glow(new THREE.SphereGeometry(1.5, 6, 4).translate(6, 108 * fl + 85, -8), 0xff2200, 6); } },
  { id: 'wtp', x: 255, z: -1655, from: 1974, to: 9999, build: 2, clear: [36, 40],
    make: k => { k.box(70, 40, 80, 'white'); k.box(48, 222, 48, 'white', 0, 40, -10); } },
  { id: 'mccormick', x: 700, z: 5000, from: 1958, to: 9999, build: 2, label: () => 'McCormick Place',
    make: k => { k.box(300, 24, 200, 'mies'); k.box(320, 3, 220, 'steel', 0, 24, 0); } },
  { id: 'attcc', x: -220, z: 230, from: 1987.5, to: 9999, build: 2, clear: [26, 24],
    make: k => { k.box(50, 210, 45, 'deco'); k.box(38, 50, 34, 'deco', 0, 210, 0); k.taper(26, 24, 4, 4, 30, 'deco', 0, 260, 0); k.cyl(1, 30, steelMat, 0, 290, 0, 6); } },
  { id: 'wacker311', x: -705, z: 700, from: 1988, to: 9999, build: 2, label: () => '311 S Wacker', clear: [28, 28],
    make: k => { k.box(52, 225, 52, 'deco'); k.box(40, 30, 40, 'deco', 0, 225, 0); k.cyl(18, 30, 'glass', 0, 255, 0, 8);
      k.glow(new THREE.CylinderGeometry(18.5, 18.5, 28, 8).translate(0, 256, 0), 0xffffff, 2.2, 0, 0, 0, 0x8899aa); } },
  { id: 'twopru', x: 295, z: -440, from: 1988, to: 9999, build: 2, label: () => 'Two Prudential Plaza', clear: [24, 24],
    make: k => { k.box(44, 210, 44, 'modern'); k.box(32, 25, 32, 'modern', 0, 210, 0); k.pyramid(30, 30, 'modern', 0, 235, 0); k.cyl(0.8, 40, steelMat, 0, 262, 0, 6); } },
  { id: 'millennium', x: 420, z: -60, from: 2002.5, to: 9999, build: 1.5, label: () => 'Millennium Park',
    make: k => {
      const pav = new THREE.CylinderGeometry(22, 22, 36, 24, 1, true, -Math.PI / 2.4, Math.PI / 1.2).translate(0, 18, 0);
      k.mesh(pav, steelMat, 20, 0, -160);
      for (let i = -3; i <= 3; i++) k.box(1, 1.2, 160, steelMat, i * 14, 22, -90);
      k.mesh(new THREE.SphereGeometry(1, 32, 16).scale(10, 5, 7).translate(0, 5, 0), mirror, -90, 0, 30);
      k.box(4, 15, 7, 'glass', -110, 0, 120); k.box(4, 15, 7, 'glass', -110, 0, 170); } },
  { id: 'trump', x: 95, z: -705, from: 2006.5, to: 9999, build: 2.5, label: () => 'Trump International Hotel & Tower', clear: [30, 26],
    make: k => { k.box(58, 100, 42, 'glass'); k.box(46, 110, 34, 'glass', 0, 100, 0); k.box(34, 147, 26, 'glass', 0, 210, 0); k.cyl(1.6, 66, steelMat, 0, 357, 0, 6); } },
  { id: 'aqua', x: 600, z: -450, from: 2007, to: 9999, build: 2, label: () => 'Aqua', clear: [24, 32],
    make: k => { k.box(36, 262, 52, 'white'); } },
  { id: 'nema', x: 402, z: 2490, from: 2017, to: 9999, build: 2, clear: [20, 20],
    make: k => { k.box(32, 273, 36, 'glass'); } },
  { id: 'stregis', x: 740, z: -545, from: 2016, to: 9999, build: 3.5, label: () => 'St. Regis Chicago', clear: [44, 30],
    make: k => {
      const tw = [[-30, 205], [0, 363], [30, 286]];
      for (const [dx, h] of tw) { k.taper(22, 24, 30, 30, h * 0.55, 'glass', dx, 0, 0); k.taper(30, 30, 22, 22, h * 0.45, 'glass', dx, h * 0.55, 0); } } },
  // ----- speculative future -----
  { id: 'f-spire', x: 1150, z: -665, from: 2041, to: 9999, build: 5, label: () => 'Lakeshore Supertall (speculative)', future: true,
    make: k => { for (let i = 0; i < 30; i++) { const s = 1 - i * 0.022; k.box(42 * s, 20, 42 * s, 'future', 0, i * 20, 0, i * 0.06); } k.cyl(1.2, 60, steelMat, 0, 600, 0, 6);
      k.glow(new THREE.CylinderGeometry(4, 4, 8, 12).translate(0, 600, 0), 0x66ffee, 3); } },
  { id: 'f-wolf', x: -600, z: -780, from: 2039, to: 9999, build: 4, label: () => 'River Forest Towers (speculative)', future: true, clear: [40, 30],
    make: k => { k.cyl(20, 380, 'future', -24, 0, 0, 16, 15); k.cyl(17, 320, 'future', 26, 0, 10, 16, 12); } },
  { id: 'f-78', x: -1050, z: 2300, from: 2044, to: 9999, build: 4, label: () => 'The 78 Eco-district (speculative)', future: true,
    make: k => { k.cyl(24, 420, 'future', 0, 0, 0, 18, 12); k.cyl(18, 300, 'future', 70, 0, -40, 18, 12); k.cyl(18, 260, 'future', -60, 0, 50, 18, 12); } },
  { id: 'f-southloop', x: -260, z: 1820, from: 2048, to: 9999, build: 5, label: () => 'South Loop Spire (speculative)', future: true, clear: [30, 30],
    make: k => { k.taper(46, 46, 14, 14, 520, 'future'); k.glow(new THREE.CylinderGeometry(3, 3, 30, 8).translate(0, 535, 0), 0x66ffee, 3); } },
];

function fortDearborn(k) {
  const s = 64, h = 4.5;
  k.box(s, h, 1.6, 'timber', 0, 0, -s / 2); k.box(s, h, 1.6, 'timber', 0, 0, s / 2);
  k.box(1.6, h, s, 'timber', -s / 2, 0, 0); k.box(1.6, h, s, 'timber', s / 2, 0, 0);
  k.box(9, 9, 9, 'timber', -s / 2, 0, -s / 2); k.box(9, 9, 9, 'timber', s / 2, 0, s / 2);
  k.pyramid(11, 4, 'bark', -s / 2, 9, -s / 2); k.pyramid(11, 4, 'bark', s / 2, 9, s / 2);
  k.box(36, 5, 9, 'timber', 0, 0, -14); k.box(36, 5, 9, 'timber', 0, 0, 14);
  k.cyl(0.3, 22, steelMat, 0, 0, 0, 4);
}

const MAJOR = new Set(['dusable', 'fort1', 'fort2', 'watertower', 'homeins', 'navypier', 'wrigley', 'merchmart', 'cbot',
  'hancock', 'willis', 'aon', 'millennium', 'trump', 'stregis', 'f-spire', 'f-southloop', 'buckingham', 'field']);

export class Landmarks {
  constructor(scene) {
    this.items = LANDMARKS.map(def => {
      const group = new THREE.Group();
      const kit = new Kit(group);
      def.make(kit);
      group.position.set(def.x, 0, def.z);
      scene.add(group);
      const bb = new THREE.Box3().setFromObject(group);
      const height = bb.max.y;
      let label = null;
      if (def.label) {
        const el = document.createElement('div');
        el.className = 'lm-label' + (def.future ? ' future' : '');
        el.innerHTML = '<span></span>';
        label = new CSS2DObject(el);
        label.position.set(0, height + 18, 0);
        label.center.set(0.5, 1);
        group.add(label);
      }
      return { def, group, kit, height, label, shown: true };
    });
  }

  clears() {
    return this.items.filter(i => i.def.clear).map(i => ({
      x: i.def.x, z: i.def.z, rx: i.def.clear[0], rz: i.def.clear[1], from: i.def.from, to: i.def.to,
    }));
  }

  update(year, night, labelsOn, camPos) {
    this.active = [];
    for (const it of this.items) {
      const { def, group } = it;
      const demo = def.demo ?? 0.8;
      let g = clamp((year - def.from) / def.build, 0, 1);
      g = smoothstep(0, 1, g);
      if (year > def.to) g *= clamp(1 - (year - def.to) / demo, 0, 1);
      const vis = g > 0.002;
      group.visible = vis;
      if (!vis) { if (it.label) it.label.visible = false; continue; }
      group.scale.set(1, g, 1);
      for (const gl of it.kit.glows) gl.mat.emissiveIntensity = gl.strength * (0.15 + 0.85 * night) * (g > 0.98 ? 1 : 0);
      if (it.label) {
        // major landmarks are labelled from afar, the rest only when the camera is close
        let near = true;
        if (camPos) {
          const d = Math.hypot(camPos.x - def.x, camPos.y - it.height, camPos.z - def.z);
          near = d < (MAJOR.has(def.id) ? 12000 : 1600);
        }
        const show = labelsOn && g > 0.6 && near;
        it.label.visible = show;
        if (show) {
          const name = def.label(year);
          if (it._name !== name) { it.label.element.firstChild.textContent = name; it._name = name; }
          // keep label size constant while the group is scaled in y
          it.label.position.y = (it.height + 18) ;
        }
      }
      this.active.push(it);
    }
  }
}
