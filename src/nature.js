// Trees (forest of 1700 → park and street trees → future urban forest) and Indigenous camps.
import * as THREE from 'three';
import { mulberry32, vegetation, settleYear, parkYear, shoreX, s0, distToRiver, LOOP, inRect } from './geo.js';
import { styleMaterial, U } from './materials.js';
import { clamp, smoothstep } from './timeline.js';

const SEASON_TINTS = {
  summer: [[0.16, 0.30, 0.10], [0.22, 0.36, 0.12], [0.12, 0.24, 0.09]],
  spring: [[0.36, 0.50, 0.18], [0.45, 0.56, 0.24], [0.62, 0.55, 0.60]],
  autumn: [[0.62, 0.30, 0.08], [0.75, 0.52, 0.12], [0.45, 0.16, 0.08]],
  winter: [[0.30, 0.26, 0.22], [0.36, 0.32, 0.28], [0.26, 0.24, 0.22]],
};

export class Nature {
  // opts.trees(add, rand) and opts.camps let another city plant its own trees / camps
  constructor(scene, opts = {}) {
    this.trees = [];
    const r = mulberry32(42);
    const add = (x, z, s, from, to) => this.trees.push({ x, z, s, from, to, k: r() });
    if (opts.trees) opts.trees(add, r); else chicagoTrees(add, r);
    this.buildTrees(scene);
    this.buildCamps(scene, opts.camps ?? CHICAGO_CAMPS);
  }

  buildTrees(scene) {
    // GPU-timed trees: (x, z, size, -) + (from, to) per instance, scaled in the vertex shader from uYear
    const ico = new THREE.IcosahedronGeometry(1, 0).translate(0, 1.1, 0);
    const geo = new THREE.InstancedBufferGeometry().copy(ico);
    const n = this.trees.length;
    const iTree = new Float32Array(n * 4), iTreeT = new Float32Array(n * 2);
    this.trees.forEach((t, i) => { iTree.set([t.x, t.z, t.s, t.k], i * 4); iTreeT.set([t.from, t.to], i * 2); });
    geo.setAttribute('iTree', new THREE.InstancedBufferAttribute(iTree, 4));
    geo.setAttribute('iTreeT', new THREE.InstancedBufferAttribute(iTreeT, 2));
    this.colorAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('color', this.colorAttr);
    geo.instanceCount = n;
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true, vertexColors: true });
    const patch = (shader) => {
      shader.uniforms.uYear = U.uYear;
      shader.uniforms.uTreeScale = this.treeScale;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 iTree; attribute vec2 iTreeT; uniform float uYear; uniform float uTreeScale;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  float g = clamp((uYear - iTreeT.x) / 8.0, 0.0, 1.0) * clamp((iTreeT.y - uYear) / 1.5, 0.0, 1.0);
  float s = g <= 0.01 ? 0.0 : iTree.z * (0.35 + 0.65 * g) * uTreeScale;
  transformed = vec3(transformed.x * s, transformed.y * s * 1.25, transformed.z * s) + vec3(iTree.x, 0.0, iTree.y);
}`);
    };
    this.treeScale = { value: 1 };
    mat.onBeforeCompile = patch;
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
    depth.onBeforeCompile = patch;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.customDepthMaterial = depth;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.season = null;
  }

  buildCamps(scene, camps) {
    this.camps = camps.map(c => ({ ...c }));    const rc = mulberry32(7);
    this.lodges = [];
    for (const c of this.camps) {
      for (let i = 0; i < c.n; i++) {
        const a = rc() * Math.PI * 2, d = Math.sqrt(rc()) * (c.r || 90);
        const long = rc() < 0.3;
        this.lodges.push({ x: c.x + Math.cos(a) * d, z: c.z + Math.sin(a) * d, sx: long ? 9 : 4.5, sz: long ? 4.5 : 4.5, h: long ? 4 : 3.6, c });
      }
      c.fires = [[c.x, c.z]];
    }
    const lgeo = new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    this.lodgeMesh = new THREE.InstancedMesh(lgeo, styleMaterial('bark'), Math.max(1, this.lodges.length));
    this.lodgeMesh.count = 0;
    this.lodgeMesh.castShadow = true;
    this.lodgeMesh.frustumCulled = false;
    scene.add(this.lodgeMesh);
    this.campfires = [];
  }

  setSeason(season) {
    if (this.season === season) return;
    this.season = season;
    const tints = SEASON_TINTS[season] || SEASON_TINTS.summer;
    const a = this.colorAttr.array;
    this.trees.forEach((t, i) => {
      const tint = tints[Math.floor(t.k * 3)];
      const v = 0.8 + 0.4 * ((t.k * 7.3) % 1);
      a[i * 3] = tint[0] * v; a[i * 3 + 1] = tint[1] * v; a[i * 3 + 2] = tint[2] * v;
    });
    this.colorAttr.needsUpdate = true;
    this.treeScale.value = season === 'winter' ? 0.72 : 1;
  }

  update(year) {
    const la = this.lodgeMesh.instanceMatrix.array;
    let m = 0;
    this.campfires.length = 0;
    for (const c of this.camps) c.on = year >= c.from && year < c.to;
    for (const l of this.lodges) {
      if (!l.c.on) continue;
      const g = clamp((year - l.c.from) / 0.3, 0, 1) * clamp((l.c.to - year) / 0.5, 0, 1);
      const o = m * 16;
      la.set([l.sx * g, 0, 0, 0, 0, l.h * g, 0, 0, 0, 0, l.sz * g, 0, l.x, 0, l.z, 1], o);
      m++;
    }
    for (const c of this.camps) if (c.on) this.campfires.push(c.x, 1, c.z);
    this.lodgeMesh.count = m;
    this.lodgeMesh.instanceMatrix.needsUpdate = true;
  }
}

// ---------- Indigenous camps (Miami, later Potawatomi), until removal after 1833 ----------
const CHICAGO_CAMPS = [
  { x: -1300, z: -2450, n: 12, from: 1700, to: 1834 },
  { x: -950, z: 1500, n: 10, from: 1700, to: 1834 },
  { x: -3500, z: 2600, n: 14, from: 1700, to: 1834 },
  { x: 120, z: -1000, n: 8, from: 1700, to: 1812 },
  { x: -2500, z: -5200, n: 10, from: 1720, to: 1835 },
  { x: -200, z: 100, n: 46, from: 1832.6, to: 1835.6, r: 260 },   // gathering for the 1833 treaty
];

function chicagoTrees(add, r) {
    // 1700 woodland: gallery forests along the rivers + oak savanna on the prairie
    for (let n = 0, tries = 0; n < 9000 && tries < 120000; tries++) {
      const x = -6500 + r() * 7600, z = -6500 + r() * 13000;
      if (x > s0(z) - 25 || distToRiver(x, z, 50) < 45) continue;
      const v = vegetation(x, z);
      const p = v > 0.72 ? 0.85 : v > 0.45 ? 0.05 : 0.01;
      if (r() > p) continue;
      const sy = settleYear(x, z);
      add(x, z, 4 + r() * 6, 1650, (isFinite(sy) ? sy : 1900) - 3 + r() * 10);
      n++;
    }
    // parks (planted a few years after each park is made)
    for (let n = 0, tries = 0; n < 4200 && tries < 80000; tries++) {
      const x = -900 + r() * 2900, z = -8500 + r() * 15000;
      const py = parkYear(x, z);
      if (!isFinite(py) || x > shoreX(z, 2060) - 20) continue;
      if (inRect(x, z, 235, 640, -290, 180) && r() < 0.6) continue;
      add(x, z, 3.5 + r() * 4.5, py + 4 + r() * 25, 9999);
      n++;
    }
    // street and yard trees ("Urbs in Horto"), then the future urban forest
    for (let n = 0, tries = 0; n < 7000 && tries < 80000; tries++) {
      const x = -6500 + r() * 6700, z = -6500 + r() * 13000;
      if (distToRiver(x, z, 55) < 50) continue;
      const sy = settleYear(x, z);
      if (!isFinite(sy) || isFinite(parkYear(x, z))) continue;
      const loop = inRect(x, z, LOOP.x0, LOOP.x1, LOOP.z0, LOOP.z1);
      // put them on the parkways along the street grid
      const gx = Math.round(x / 100.6) * 100.6 + (r() < 0.5 ? -13 : 13);
      const tx = r() < 0.5 ? gx : x, tz = tx === gx ? z : Math.round(z / 201.2) * 201.2 + (r() < 0.5 ? -13 : 13);
      if (loop && r() < 0.8) continue;
      const future = r() < 0.3;
      const from = future ? 2028 + r() * 27 : sy + 22 + r() * 30;
      add(tx, tz, 3 + r() * 3.5, from, 9999);
      n++;
    }

}
