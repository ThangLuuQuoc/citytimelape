// Shared shader-patched materials: procedural facades, the evolving ground and the lake.
import * as THREE from 'three';
import { REGION, SHORE_TEX } from './geo.js';

// Uniforms shared by every patched material (same objects → one update reaches all).
export const U = {
  uYear: { value: 1700 },
  uNight: { value: 0 },
  uSnow: { value: 0 },
  uGreenRoof: { value: 0 },
  uSolar: { value: 0 },
  uTime: { value: 0 },
  uAutumn: { value: 0 },
};

const GLSL_HASH = /* glsl */`
float bHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bNoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(bHash(i), bHash(i+vec2(1,0)), u.x), mix(bHash(i+vec2(0,1)), bHash(i+vec2(1,1)), u.x), u.y);
}`;

// ---------------- GPU-timed instances ----------------
// Each instance is one "phase" of a lot: iBox = (x, z, width, depth), iTime = (start, end, buildYears, demoYears),
// iShape = (height, crownFraction, crownFootprint, -). The vertex shader grows/shrinks it from uYear,
// so the CPU never touches instance data while the timeline plays.
const TIMED_VERT_PARS = /* glsl */`
#ifdef TIMED
attribute vec4 iBox; attribute vec4 iTime; attribute vec4 iShape;
uniform float uYear;
#endif`;
const TIMED_VERT = /* glsl */`
#ifdef TIMED
{
  float g = clamp((uYear - iTime.x) / iTime.z, 0.0, 1.0);
  g = 1.0 - (1.0 - g) * (1.0 - g);
  g *= clamp((iTime.y - uYear) / iTime.w, 0.0, 1.0);
  float isCrown = step(0.001, iShape.y);
  float hBody = iShape.x * g;
  float hh = mix(hBody, iShape.x * iShape.y * clamp((g - 0.3) / 0.7, 0.0, 1.0), isCrown);
  float base = isCrown * hBody;
  vec2 fp = iBox.zw * mix(1.0, iShape.z, isCrown);
  float alive = step(0.01, hh);
  transformed = vec3(transformed.x * fp.x, transformed.y * hh + base, transformed.z * fp.y) * alive + vec3(iBox.x, 0.0, iBox.y);
  tTop = base + hh;
}
#endif`;

export function timedDepthMaterial() {
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  m.defines = { TIMED: '' };
  m.onBeforeCompile = (s) => {
    s.uniforms.uYear = U.uYear;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\n' + TIMED_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat tTop = 1e5;\n' + TIMED_VERT);
  };
  m.customProgramCacheKey = () => 'timed-depth-v1';
  return m;
}

// ---------------- building facades ----------------
export const STYLE_DEFS = {
  wood:       { wall: 0x7d6b55, win: 0x2b2722, lit: [1.0, 0.62, 0.28], litAmt: 0.55, chance: 0.35, floorH: 3.3, winW: 3.6, mx: 0.34, my: 0.30, roof: 0x4a4038, glass: 0 },
  brick:      { wall: 0x8c4c37, win: 0x221f1d, lit: [1.0, 0.72, 0.42], litAmt: 0.8, chance: 0.40, floorH: 3.6, winW: 3.0, mx: 0.30, my: 0.25, roof: 0x3d3632, glass: 0.1 },
  stone:      { wall: 0xb3a385, win: 0x2a2928, lit: [1.0, 0.80, 0.52], litAmt: 0.9, chance: 0.45, floorH: 3.9, winW: 2.8, mx: 0.24, my: 0.22, roof: 0x55504a, glass: 0.2 },
  deco:       { wall: 0xc4b59b, win: 0x2b2c30, lit: [1.0, 0.83, 0.58], litAmt: 1.0, chance: 0.45, floorH: 3.9, winW: 2.2, mx: 0.32, my: 0.18, roof: 0x5a5650, glass: 0.2, crownGlow: 0.6 },
  industrial: { wall: 0x5b3b2d, win: 0x1f1f1f, lit: [1.0, 0.75, 0.45], litAmt: 0.6, chance: 0.20, floorH: 5.0, winW: 4.2, mx: 0.28, my: 0.32, roof: 0x34302d, glass: 0.1 },
  modern:     { wall: 0x9d9d97, win: 0x33414a, lit: [1.0, 0.94, 0.82], litAmt: 1.1, chance: 0.50, floorH: 3.6, winW: 2.0, mx: 0.14, my: 0.26, roof: 0x5c5c5c, glass: 0.6 },
  mies:       { wall: 0x1d1e21, win: 0x25313b, lit: [1.0, 0.93, 0.80], litAmt: 1.2, chance: 0.55, floorH: 3.8, winW: 1.6, mx: 0.06, my: 0.12, roof: 0x2b2b2b, glass: 0.85 },
  glass:      { wall: 0x5a7180, win: 0x3a5566, lit: [0.92, 0.96, 1.0], litAmt: 1.2, chance: 0.55, floorH: 3.8, winW: 1.5, mx: 0.04, my: 0.06, roof: 0x4b5157, glass: 1.0 },
  white:      { wall: 0xe6e3da, win: 0x394047, lit: [1.0, 0.95, 0.85], litAmt: 1.1, chance: 0.50, floorH: 3.8, winW: 1.7, mx: 0.22, my: 0.18, roof: 0x8a8a86, glass: 0.4 },
  future:     { wall: 0xdfe7e4, win: 0x46707e, lit: [0.80, 1.0, 1.0], litAmt: 1.3, chance: 0.60, floorH: 4.0, winW: 2.0, mx: 0.10, my: 0.14, roof: 0x5d7a55, glass: 0.9, plants: 1, edgeGlow: 1 },
  ruin:       { wall: 0x1b1714, win: 0x1b1714, lit: [1.0, 0.4, 0.1], litAmt: 0.0, chance: 0.0, floorH: 3.5, winW: 3.0, mx: 0.3, my: 0.3, roof: 0x141210, glass: 0 },
  concrete:   { wall: 0xc9c6bd, win: 0x33373b, lit: [1.0, 0.9, 0.75], litAmt: 1.0, chance: 0.5, floorH: 3.0, winW: 4.0, mx: 0.05, my: 0.45, roof: 0x7a7872, glass: 0.3 },
  gold:       { wall: 0xb08a3a, win: 0x3a2e18, lit: [1.0, 0.85, 0.5], litAmt: 1.6, chance: 0.9, floorH: 3.0, winW: 1.5, mx: 0.2, my: 0.2, roof: 0x8a6a2a, glass: 0.3, metal: 0.8 },
  darkgreen:  { wall: 0x1f3229, win: 0x18211d, lit: [1.0, 0.85, 0.6], litAmt: 1.0, chance: 0.45, floorH: 3.8, winW: 2.2, mx: 0.3, my: 0.2, roof: 0x202a25, glass: 0.2 },
  steel:      { wall: 0x6b6f73, win: 0x6b6f73, lit: [1, 1, 1], litAmt: 0, chance: 0, floorH: 1000, winW: 1000, mx: 0.5, my: 0.5, roof: 0x55595d, glass: 0, metal: 0.7 },
  timber:     { wall: 0x6e5a42, win: 0x6e5a42, lit: [1, 0.6, 0.3], litAmt: 0, chance: 0, floorH: 1000, winW: 1000, mx: 0.5, my: 0.5, roof: 0x5a4a38, glass: 0 },
  bark:       { wall: 0x6a5a45, win: 0x6a5a45, lit: [1, 0.6, 0.3], litAmt: 0, chance: 0, floorH: 1000, winW: 1000, mx: 0.5, my: 0.5, roof: 0x7a6a50, glass: 0 },
};

function patchBuilding(mat, def) {
  const su = {
    uWall: { value: new THREE.Color(def.wall) },
    uWin: { value: new THREE.Color(def.win) },
    uRoof: { value: new THREE.Color(def.roof) },
    uLit: { value: new THREE.Vector3(...def.lit).multiplyScalar(def.litAmt) },
    uChance: { value: def.chance },
    uGrid: { value: new THREE.Vector4(def.floorH, def.winW, def.mx, def.my) },
    uGlass: { value: def.glass || 0 },
    uPlants: { value: def.plants || 0 },
    uEdgeGlow: { value: def.edgeGlow || 0 },
    uCrownGlow: { value: def.crownGlow || 0 },
  };
  mat.userData.styleUniforms = su;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, su);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
varying vec3 vBW; varying vec3 vBN; varying float vSeed; varying float vTop;
${TIMED_VERT_PARS}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float tTop = 1e5;
${TIMED_VERT}
{
  #ifdef TIMED
    vBW = (modelMatrix * vec4(transformed, 1.0)).xyz;
    vTop = tTop;
    vSeed = fract(sin(dot(floor(iBox.xy * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
  #else
    vec4 p = vec4(transformed, 1.0);
    vec4 org = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p; org = instanceMatrix * org;
    #endif
    vBW = (modelMatrix * p).xyz;
    org = modelMatrix * org;
    vTop = 1e5;
    vSeed = fract(sin(dot(floor(org.xz * 0.37), vec2(12.9898, 78.233))) * 43758.5453);
  #endif
  vBN = normalize(mat3(modelMatrix) * objectNormal);
}`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vBW; varying vec3 vBN; varying float vSeed; varying float vTop;
uniform float uYear, uNight, uSnow, uGreenRoof, uSolar, uTime;
uniform vec3 uWall, uWin, uRoof, uLit; uniform float uChance, uGlass, uPlants, uEdgeGlow, uCrownGlow;
uniform vec4 uGrid;
${GLSL_HASH}
float gWin; float gLit; float gRoof; float gWinCell;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec3 n = normalize(vBN);
  gRoof = step(0.65, n.y);
  float hc = abs(n.x) > abs(n.z) ? vBW.z : vBW.x;
  float fy = vBW.y / uGrid.x;
  vec2 cell = vec2(floor(hc / uGrid.y), floor(fy));
  vec2 f = vec2(fract(hc / uGrid.y), fract(fy));
  float w = step(uGrid.z, f.x) * step(f.x, 1.0 - uGrid.z) * step(uGrid.w, f.y) * step(f.y, 1.0 - uGrid.w);
  // anti-alias: far away the window grid fades to its average coverage instead of shimmering
  float fw = max(fwidth(hc / uGrid.y), fwidth(fy));
  float cover = (1.0 - 2.0 * uGrid.z) * (1.0 - 2.0 * uGrid.w);
  float far = smoothstep(0.25, 0.7, fw);
  float wSharp = w;
  w = mix(w, cover, far);
  float wall01 = (1.0 - gRoof) * step(2.5, vBW.y);
  w *= wall01;
  gWin = w;
  float h1 = bHash(cell + vSeed * 91.7);
  gWinCell = h1;
  vec3 wall = uWall * (0.82 + 0.36 * vSeed);
  vec3 winC = uWin * (0.75 + 0.5 * bHash(cell.yx + 3.1));
  vec3 col = mix(wall, winC, w);
  // vertical gardens: planted balcony bands
  float band = step(0.72, fract(fy / 3.0 + vSeed)) * (1.0 - gRoof);
  col = mix(col, vec3(0.20, 0.42, 0.16) * (0.7 + 0.6 * bNoise(vBW.xz * 0.2 + vBW.y * 0.3)), band * uPlants);
  // roofs: tar → green roofs / solar in the future → snow in winter
  vec3 roof = uRoof * (0.8 + 0.4 * vSeed);
  float green = step(vSeed, uGreenRoof);
  roof = mix(roof, vec3(0.24, 0.40, 0.18) * (0.75 + 0.5 * bNoise(vBW.xz * 0.15)), green);
  float solar = step(1.0 - uSolar, fract(vSeed * 7.13)) * (1.0 - green);
  float sg = step(0.12, fract(vBW.x * 0.25)) * step(0.12, fract(vBW.z * 0.5));
  roof = mix(roof, mix(vec3(0.05, 0.07, 0.12), vec3(0.12, 0.16, 0.24), sg), solar);
  col = mix(col, roof, gRoof);
  col = mix(col, vec3(0.92, 0.94, 0.97), gRoof * uSnow);
  diffuseColor.rgb = col;
  // lit windows: per-window at close range, averaged (no sparkle) at distance
  float chance = uChance * 0.48;
  gLit = mix(step(h1, chance) * wSharp, chance * cover * (0.5 + 0.6 * vSeed) * 0.75, far) * wall01;
}`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.12, gWin * uGlass);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
metalnessFactor = mix(metalnessFactor, 0.35, gWin * uGlass);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float flick = 0.65 + 0.7 * bHash(vec2(gWinCell * 13.0, vSeed));
  totalEmissiveRadiance += uLit * vec3(1.0, 0.86, 0.66) * gLit * uNight * flick * 0.3;
  // futuristic edge lighting + art-deco crown floodlights
  float nearTop = smoothstep(vTop - 2.5, vTop - 0.5, vBW.y) * step(vBW.y, vTop - 0.05) * (1.0 - gRoof);
  totalEmissiveRadiance += vec3(0.3, 1.0, 0.95) * 1.4 * nearTop * uEdgeGlow * uNight;
  float crown = smoothstep(vTop - 25.0, vTop, vBW.y) * (1.0 - gRoof) * step(90.0, vTop);
  totalEmissiveRadiance += vec3(1.0, 0.8, 0.5) * 0.5 * crown * uCrownGlow * uNight;
}`);
  };
  mat.customProgramCacheKey = () => 'building-v1-' + mat.type;
  return mat;
}

const styleCache = {};
// lite = Lambert shading (used by the medium/low quality tiers for the thousands of city blocks)
export function styleMaterial(name, timed = false, lite = false) {
  const key = name + (timed ? ':t' : '') + (lite ? ':l' : '');
  if (styleCache[key]) return styleCache[key];
  const def = STYLE_DEFS[name];
  const mat = lite
    ? new THREE.MeshLambertMaterial({ color: 0xffffff })
    : new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: def.metal || 0.0, envMapIntensity: 0.9 });
  if (timed) mat.defines = { TIMED: '' };
  patchBuilding(mat, def);
  styleCache[key] = mat;
  return mat;
}

// ---------------- ground ----------------
// Tileable value-noise texture: r,g,b,a = noise at four scales (cheaper than per-pixel hashing).
function makeNoiseTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const lattice = (n, seed) => {
    const g = new Float32Array(n * n);
    let a = seed;
    for (let i = 0; i < g.length; i++) { a = (a * 16807) % 2147483647; g[i] = a / 2147483647; }
    return (x, y) => g[((y % n + n) % n) * n + ((x % n + n) % n)];
  };
  const layers = [[8, 11], [32, 23], [64, 37], [16, 51]].map(([n, sd]) => ({ n, f: lattice(n, sd) }));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const k = (y * size + x) * 4;
    layers.forEach(({ n, f }, li) => {
      const fx = x / size * n, fy = y / size * n;
      const xi = Math.floor(fx), yi = Math.floor(fy), tx = fx - xi, ty = fy - yi;
      const u = tx * tx * (3 - 2 * tx), v = ty * ty * (3 - 2 * ty);
      const val = f(xi, yi) * (1 - u) * (1 - v) + f(xi + 1, yi) * u * (1 - v) + f(xi, yi + 1) * (1 - u) * v + f(xi + 1, yi + 1) * u * v;
      img.data[k + li] = val * 255;
    });
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export function createGroundMaterial(landTex, shoreTex) {
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const gu = {
    uLand: { value: landTex },
    uShore: { value: shoreTex },
    uRegion: { value: new THREE.Vector4(REGION.minX, REGION.minZ, REGION.maxX - REGION.minX, REGION.maxZ - REGION.minZ) },
    uShoreRange: { value: new THREE.Vector2(SHORE_TEX.minZ, SHORE_TEX.maxZ - SHORE_TEX.minZ) },
    uStreetLight: { value: new THREE.Vector3(1, 0.7, 0.35) },
    uStreetAmt: { value: 0 },
    uRoadTone: { value: new THREE.Vector3(0.4, 0.33, 0.25) },
    uNoise: { value: makeNoiseTexture() },
  };
  mat.userData.groundUniforms = gu;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U, gu);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vGW;
uniform sampler2D uLand, uShore, uNoise; uniform vec4 uRegion; uniform vec2 uShoreRange;
uniform float uYear, uNight, uSnow, uTime, uAutumn, uStreetAmt;
uniform vec3 uStreetLight, uRoadTone;
${GLSL_HASH}
float gRoad; float gUrban; float gPark; float gNS;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 p = vGW.xz;
  vec2 uv = (p - uRegion.xy) / uRegion.zw;
  vec4 L = texture2D(uLand, clamp(uv, 0.001, 0.999));
  float shore = texture2D(uShore, vec2((p.y - uShoreRange.x) / uShoreRange.y, 0.5)).r;
  vec4 NA = texture2D(uNoise, p / 2400.0);   // broad patches
  vec4 NB = texture2D(uNoise, p / 300.0);    // fine texture
  float n1 = NA.r, n2 = NB.g, n3 = NB.b;
  // natural landscape of 1700
  float veg = L.a; float rail = 0.0;
  if (veg > 1.5) { rail = step(uYear, 1800.0 + (veg - 2.0) * 1000.0) * step(1852.0, uYear); veg = 0.5; }
  vec3 prairie = mix(vec3(0.36, 0.37, 0.16), vec3(0.24, 0.33, 0.12), n1);
  prairie = mix(prairie, vec3(0.55, 0.45, 0.22), uAutumn * 0.8);
  vec3 forest = mix(vec3(0.13, 0.25, 0.09), vec3(0.20, 0.30, 0.12), n2);
  forest = mix(forest, vec3(0.45, 0.28, 0.10), uAutumn * 0.7);
  vec3 marsh = mix(vec3(0.20, 0.30, 0.22), vec3(0.26, 0.36, 0.20), n2);
  marsh = mix(marsh, vec3(0.16, 0.24, 0.24), smoothstep(0.66, 0.74, NA.b) * 0.8);
  vec3 nat = veg < 0.5 ? mix(marsh, prairie, smoothstep(0.15, 0.5, veg)) : mix(prairie, forest, smoothstep(0.55, 0.85, veg));
  nat *= 0.9 + 0.2 * n3;
  // beach / dunes along the current shoreline
  float beach = 1.0 - smoothstep(10.0, 55.0, shore - p.x);
  // urban fabric
  float settle = L.r;
  gUrban = smoothstep(settle, settle + 14.0, uYear);
  float cx = p.x / 100.6, cz = p.y / 201.2;
  bool loop = p.x > -800.0 && p.x < 240.0 && p.y > -640.0 && p.y < 1100.0;
  if (loop) cz = p.y / 100.6;
  float fx = abs(fract(cx + 0.5) - 0.5) * 100.6;
  float fz = abs(fract(cz + 0.5) - 0.5) * (loop ? 100.6 : 201.2);
  vec2 aa = fwidth(p) * 0.75 + 0.5;
  float art = step(abs(fract(p.x / 804.67 + 0.5) - 0.5) * 804.67, 16.0) + step(abs(fract(p.y / 804.67 + 0.5) - 0.5) * 804.67, 16.0);
  float rw = mix(9.0, 13.0, clamp(art, 0.0, 1.0));
  gNS = step(fx, fz);   // 1 on north–south streets
  gRoad = max(1.0 - smoothstep(rw - aa.x, rw + aa.x, fx), 1.0 - smoothstep(rw - aa.y, rw + aa.y, fz)) * gUrban;
  vec3 dirt = vec3(0.42, 0.36, 0.27);
  vec3 yard = mix(vec3(0.30, 0.34, 0.20), vec3(0.38, 0.36, 0.26), n2);
  float paved = smoothstep(1890.0, 1950.0, uYear);
  vec3 lots = mix(mix(dirt, yard, 0.5 + 0.3 * n3), mix(vec3(0.25, 0.25, 0.24), yard * 0.8, 0.35 + 0.3 * n2), paved);
  vec3 col = mix(nat, lots, gUrban);
  col = mix(col, uRoadTone * (0.9 + 0.2 * n3), gRoad);
  // rail yards: gravel + tracks
  float tw = fwidth(p.y / 9.0);
  float tracks = (1.0 - smoothstep(0.1 - tw, 0.1 + tw, abs(fract(p.y / 9.0) - 0.5))) * (1.0 - smoothstep(0.15, 0.5, tw));
  col = mix(col, mix(vec3(0.30, 0.27, 0.24), vec3(0.14, 0.12, 0.11), tracks), rail * gUrban);
  // parks
  gPark = step(1.0, L.g) * smoothstep(L.g, L.g + 6.0, uYear);
  vec3 grass = mix(vec3(0.24, 0.40, 0.15), vec3(0.32, 0.46, 0.20), n2);
  grass = mix(grass, vec3(0.50, 0.40, 0.18), uAutumn * 0.5);
  float pw = fwidth(p.x / 160.0) + 0.004;
  float path = (1.0 - smoothstep(0.012, 0.012 + pw, abs(fract(p.x / 160.0 + n1 * 0.3) - 0.5))) * (1.0 - smoothstep(0.1, 0.3, pw));
  grass = mix(grass, vec3(0.5, 0.48, 0.42), path * 0.45);
  col = mix(col, grass, gPark);
  gRoad *= (1.0 - gPark);
  col = mix(col, vec3(0.78, 0.70, 0.52) * (0.9 + 0.2 * n3), beach * (1.0 - gUrban * (1.0 - gPark)) * 0.9);
  // the Great Fire scorch
  if (L.b > 1800.0) {
    float burn = smoothstep(L.b, L.b + 0.02, uYear) * (1.0 - smoothstep(1872.2, 1874.5, uYear));
    col = mix(col, vec3(0.06, 0.05, 0.045), burn * 0.9);
  }
  col = mix(col, vec3(0.90, 0.92, 0.95), uSnow * (1.0 - 0.55 * gRoad));
  diffuseColor.rgb = col;
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  // lamp posts every ~36 m along each street: dots up close, their average far away
  vec2 q = abs(fract(vGW.xz / 36.0) - 0.5) * 36.0;
  float along = mix(q.x, q.y, gNS);
  float dots = 1.0 - smoothstep(1.5, 4.0, along);
  float farL = smoothstep(0.6, 3.0, length(fwidth(vGW.xz)));
  dots = mix(dots, 0.32, farL);
  float lamps = gRoad * uNight * uStreetAmt * (0.75 + 0.5 * texture2D(uNoise, vGW.xz / 700.0).a);
  totalEmissiveRadiance += uStreetLight * lamps * (0.08 + 1.5 * dots);
  totalEmissiveRadiance += uStreetLight * gUrban * uNight * uStreetAmt * 0.025;
}`);
  };
  mat.customProgramCacheKey = () => 'ground-v1';
  return mat;
}

// ---------------- water ----------------
export function makeWaterNormalTexture(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  // many integer-frequency waves in random directions: tileable but without an obvious pattern
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const waves = [];
  for (let i = 0; i < 28; i++) {
    const f = 2 + Math.floor(rnd() * 14), a = rnd() * Math.PI * 2;
    waves.push([Math.round(Math.cos(a) * f), Math.round(Math.sin(a) * f), 0.6 / f, rnd() * 6.28]);
  }
  const H = (x, y) => {
    let h = 0;
    for (const [kx, ky, a, ph] of waves) h += a * Math.sin(((kx * x + ky * y) / size) * Math.PI * 2 + ph);
    return h;
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.5, dy = (H(x, y + 1) - H(x, y - 1)) * 2.5;
    const len = Math.hypot(dx, dy, 1);
    const k = (y * size + x) * 4;
    img.data[k] = (-dx / len * 0.5 + 0.5) * 255;
    img.data[k + 1] = (-dy / len * 0.5 + 0.5) * 255;
    img.data[k + 2] = (1 / len * 0.5 + 0.5) * 255;
    img.data[k + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createWaterMaterial(normalTex, opts = {}) {
  const mat = new THREE.MeshStandardMaterial({
    color: opts.color ?? 0x123540, roughness: 0.12, metalness: 0.0,
    normalMap: normalTex, normalScale: new THREE.Vector2(0.3, 0.3), envMapIntensity: 0.75,
  });
  return mat;
}
