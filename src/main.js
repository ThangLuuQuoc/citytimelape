import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { START_YEAR, END_YEAR, EVENTS, clamp, lerp, ramp, smoothstep, window01 } from './timeline.js';
import { buildLandTexture, createShoreTexture, updateShoreTexture, s0, FIRE_START, FIRE_SPAN } from './geo.js';
import { U, createGroundMaterial, createWaterMaterial, makeWaterNormalTexture } from './materials.js';
import { City } from './city.js';
import { Landmarks } from './landmarks.js';
import { Nature } from './nature.js';
import { Life } from './life.js';
import { Waterfront } from './waterfront.js';
import { ribbonGeometry } from './geom.js';
import { UI } from './ui.js';
import { bindGestures } from './touch.js';

const setStatus = (t) => { const el = document.getElementById('loading-text'); if (el) el.textContent = t; };
// setTimeout (not rAF) so loading also progresses in a background tab
const nextFrame = () => new Promise(r => setTimeout(r, 16));

// ---------------------------------------------------------------- state
export const state = {
  year: START_YEAR, playing: false, speed: 6, loop: true, slowEvents: true,
  tod: 10, autoDay: false, season: 'summer',
  labels: true, traffic: true, smoke: true,
  camMode: 'locked', preset: 'harbor',
  shadows: true, bloom: true, trails: false, quality: 'auto',
};
(function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('y')) state.year = clamp(parseFloat(h.get('y')) || START_YEAR, START_YEAR, END_YEAR);
  if (h.has('tod')) state.tod = clamp(parseFloat(h.get('tod')) || 10, 0, 24);
  if (h.has('cam')) state.preset = h.get('cam');
  if (h.has('play')) state.playing = h.get('play') === '1';
})();

export const PRESETS = {
  harbor:  { name: 'Harbor & river mouth', pos: [1900, 210, -560], target: [-150, 0, -655], fov: 30 },
  bridges: { name: 'Bridges · low over the river', pos: [330, 48, -560], target: [-430, 0, -655] },
  wacker:  { name: 'Wacker Dr · South Branch', pos: [-560, 110, -420], target: [-790, 0, 520] },
  drone:   { name: 'Drone · whole city', pos: [2700, 760, -160], target: [-900, 0, 260] },
  skydeck: { name: 'Skydeck · looking east', pos: [-705, 470, 470], target: [1500, 0, -700] },
  north:   { name: 'Gold Coast · looking south', pos: [1100, 420, -6200], target: [-250, 0, -500] },
  south:   { name: 'Museum Campus · looking north', pos: [1500, 330, 5600], target: [-150, 60, -200] },
  top:     { name: 'Satellite', pos: [-300, 7600, 1400], target: [-300, 0, 0] },
};

async function main() {
  // ------------------------------------------------------------ renderer
  const app = document.getElementById('app');
  const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true, powerPreference: 'high-performance' });
  const gpuName = (() => {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
  })();
  const QUALITY = {
    high: { pr: Math.min(devicePixelRatio, 2), shadow: 4096, bloom: 0.5, lite: false },
    medium: { pr: 1, shadow: 2048, bloom: 0.5, lite: true },
    low: { pr: 0.75, shadow: 1024, bloom: 0.35, lite: true },
  };
  const autoQuality = /mobile|android|iphone|ipad/i.test(navigator.userAgent) || /swiftshader|llvmpipe|mali|adreno|powervr/i.test(gpuName)
    ? 'low' : /intel|uhd|iris|apple m1|microsoft basic/i.test(gpuName) ? 'medium' : 'high';
  let q = QUALITY[autoQuality];
  let pixelRatio = q.pr;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(innerWidth, innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.55;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  app.appendChild(renderer.domElement);

  const labelRenderer = new CSS2DRenderer();
  labelRenderer.setSize(innerWidth, innerHeight);
  labelRenderer.domElement.className = 'labels';
  app.appendChild(labelRenderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 8, 120000);
  scene.fog = new THREE.FogExp2(0xaabbcc, 0.00006);

  // ------------------------------------------------------------ sky, sun, environment
  const sky = new Sky();
  sky.scale.setScalar(90000);
  sky.renderOrder = 100;          // draw after the city so hidden sky pixels are depth-rejected
  scene.add(sky);
  const skyU = sky.material.uniforms;
  skyU.mieDirectionalG.value = 0.8;
  // fade the sky into the fog colour at the horizon so the distant land never shows a seam
  skyU.uHorizon = { value: new THREE.Color() };
  sky.material.fragmentShader = sky.material.fragmentShader
    .replace('void main() {', 'uniform vec3 uHorizon;\nvoid main() {')
    .replace('gl_FragColor = vec4( retColor, 1.0 );', `
      float hz = 1.0 - smoothstep(-0.02, 0.09, direction.y);
      retColor = mix(retColor, uHorizon, hz);
      gl_FragColor = vec4( retColor, 1.0 );`);
  const envScene = new THREE.Scene();
  const envSky = new Sky();
  envSky.scale.setScalar(1000);
  envScene.add(envSky);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envRT = null, lastEnvKey = '';

  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(q.shadow, q.shadow);
  const sc = sun.shadow.camera;
  sc.left = -3600; sc.right = 3600; sc.top = 3600; sc.bottom = -3600; sc.near = 100; sc.far = 16000;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 1.5;
  scene.add(sun, sun.target);
  sun.target.position.set(-400, 0, 0);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4436, 0.8);
  scene.add(hemi);
  const fireLight = new THREE.PointLight(0xff6a20, 0, 9000, 1.2);
  fireLight.position.set(-300, 400, 300);
  scene.add(fireLight);

  // stars
  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 2500; i++) {
    const u = Math.random(), v = Math.random() * 0.9 + 0.08;
    const th = u * Math.PI * 2, ph = Math.acos(1 - v);
    sp.push(Math.sin(ph) * Math.cos(th) * 80000, Math.cos(ph) * 80000, Math.sin(ph) * Math.sin(th) * 80000);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  scene.add(new THREE.Points(starGeo, starMat));

  // ------------------------------------------------------------ ground, lake, river
  setStatus('Surveying the prairie…');
  await nextFrame();
  const landTex = buildLandTexture(512);
  const shoreTex = createShoreTexture();
  updateShoreTexture(shoreTex, state.year);
  const groundMat = createGroundMaterial(landTex, shoreTex);
  // the river and lake are cut out of the ground plane through the stencil buffer (see waterfront.js)
  groundMat.stencilWrite = true;
  groundMat.stencilRef = 1;
  groundMat.stencilFunc = THREE.NotEqualStencilFunc;
  groundMat.stencilZPass = THREE.KeepStencilOp;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

  const waterNormal = makeWaterNormalTexture();
  const lakeMat = createWaterMaterial(waterNormal);
  const riverMat = createWaterMaterial(waterNormal, { color: 0x203a2c });
  const waterfront = new Waterfront(scene, waterNormal, lakeMat, riverMat);

  // Illinois Central tracks: a trestle in the lake (1852), later inside Grant Park
  const icMat = new THREE.MeshStandardMaterial({ color: 0x3b342e, roughness: 0.95 });
  const icPts = [];
  for (let z = -640; z <= 9000; z += 100) icPts.push([s0(z) + (z < 2400 ? 125 : 110), z]);
  const icSegs = [
    { pts: icPts.filter(p => p[1] <= -290), cover: 9999 },
    { pts: icPts.filter(p => p[1] >= -300 && p[1] <= 200), cover: 2004 },
    { pts: icPts.filter(p => p[1] >= 190), cover: 9999 },
  ].map(s => { const m = new THREE.Mesh(ribbonGeometry(s.pts, 40, 0), icMat); m.position.y = 1.9; m.receiveShadow = true; scene.add(m); return { m, cover: s.cover }; });

  // ------------------------------------------------------------ city
  setStatus('Platting the street grid…');
  await nextFrame();
  const landmarks = new Landmarks(scene);
  const city = new City(scene, landmarks.clears());
  setStatus('Planting trees…');
  await nextFrame();
  const nature = new Nature(scene);
  setStatus('Starting traffic…');
  await nextFrame();
  const life = new Life(scene, waterfront);

  // ------------------------------------------------------------ camera
  // the label layer ignores pointer events, so the canvas itself receives mouse and touch input
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 40;
  controls.maxDistance = 20000;
  controls.enabled = false;
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.zoomSpeed = 1.2;
  let camTween = null;
  function applyPreset(id, instant = false) {
    const p = PRESETS[id] || PRESETS.harbor;
    state.preset = id in PRESETS ? id : 'harbor';
    const to = { pos: new THREE.Vector3(...p.pos), target: new THREE.Vector3(...p.target), fov: p.fov || 40 };
    if (instant) {
      camera.position.copy(to.pos); controls.target.copy(to.target); camera.lookAt(to.target);
      camera.fov = to.fov; camera.updateProjectionMatrix(); camTween = null; return;
    }
    camTween = { from: { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov }, to, t: 0 };
  }
  function setCamMode(mode) {
    state.camMode = mode;
    controls.enabled = mode === 'free';
    if (mode === 'locked') applyPreset(state.preset);
  }
  applyPreset(state.preset, true);

  // ------------------------------------------------------------ post-processing
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, stencilBuffer: true }));
  composer.addPass(new RenderPass(scene, camera));
  const afterimage = new AfterimagePass(0.9);
  afterimage.enabled = false;
  composer.addPass(afterimage);
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.6, 0.55, 0.9);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const w = Math.max(1, app.clientWidth), h = Math.max(1, app.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(Math.round(w * pixelRatio * q.bloom), Math.round(h * pixelRatio * q.bloom));
    labelRenderer.setSize(w, h);
    life.setViewport(h * renderer.getPixelRatio(), camera.fov);
  }
  new ResizeObserver(resize).observe(app);
  resize();

  // ------------------------------------------------------------ UI
  function applyQuality() {
    const name = state.quality === 'auto' ? autoQuality : state.quality;
    q = QUALITY[name];
    pixelRatio = q.pr;
    renderer.setPixelRatio(pixelRatio);
    if (sun.shadow.mapSize.x !== q.shadow) {
      sun.shadow.mapSize.set(q.shadow, q.shadow);
      if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
    }
    city.setLite(q.lite);
    resize();
    renderer.shadowMap.needsUpdate = true;
  }
  city.setLite(q.lite);
  state.autoQuality = autoQuality;

  const ui = new UI(state, {
    onSeek: y => { state.year = clamp(y, START_YEAR, END_YEAR); },
    onPreset: id => { state.preset = id; if (state.camMode === 'free') applyPreset(id); else applyPreset(id); },
    onCamMode: m => setCamMode(m),
    onQuality: () => applyQuality(),
  }, PRESETS);

  bindGestures(renderer.domElement, {
    mode: () => state.camMode,
    year: () => state.year,
    playing: () => state.playing,
    setPlaying: (v) => { state.playing = v; ui.syncPlay(); },
    togglePlay: () => ui.togglePlay(),
    seek: (y) => { state.year = clamp(y, START_YEAR, END_YEAR); },
    free: () => { setCamMode('free'); ui.syncAll(); },
    toast: (t) => ui.toast(t),
  });

  // ------------------------------------------------------------ world update
  const sunDir = new THREE.Vector3();
  const fogColor = new THREE.Color();
  const tmpC = new THREE.Color();
  let lastWorldYear = -1, lastShoreYear = -1, lastSeason = '';
  const clock = new THREE.Clock();
  let elapsed = 0;

  function seasonFor(year) {
    if (state.season !== 'cycle') return state.season;
    const m = (year - Math.floor(year)) * 12;
    return m < 2.2 || m >= 11.3 ? 'winter' : m < 5 ? 'spring' : m < 8.6 ? 'summer' : 'autumn';
  }

  function updateWorld(year) {
    const season = seasonFor(year);
    if (season !== lastSeason) { nature.setSeason(season); lastSeason = season; }
    U.uSnow.value = season === 'winter' ? 0.85 : 0;
    U.uAutumn.value = season === 'autumn' ? 1 : 0;
    U.uYear.value = year;
    U.uGreenRoof.value = ramp(year, 2026, 2058) * 0.7 + ramp(year, 2008, 2020) * 0.05;
    U.uSolar.value = ramp(year, 2015, 2050) * 0.45;
    if (Math.abs(year - lastShoreYear) > 0.25) {
      updateShoreTexture(shoreTex, year);
      lastShoreYear = year;
    }
    waterfront.setYear(year);
    city.update(year);
    nature.update(year);
    for (const s of icSegs) s.m.visible = year >= 1852 && year < s.cover;
    // street lighting by era: gas → incandescent → sodium → LED
    const gu = groundMat.userData.groundUniforms;
    gu.uStreetAmt.value = ramp(year, 1850, 1870) * 0.35 + ramp(year, 1905, 1930) * 0.5 + ramp(year, 1955, 1970) * 0.25;
    const lamp = year < 1910 ? [1.0, 0.72, 0.38] : year < 1958 ? [1.0, 0.82, 0.58] : year < 2016 ? [1.0, 0.55, 0.2] : year < 2035 ? [0.92, 0.94, 1.0] : [0.75, 0.95, 1.0];
    gu.uStreetLight.value.set(...lamp);
    const road = year < 1880 ? [0.42, 0.36, 0.27] : year < 1925 ? [0.33, 0.31, 0.28] : [0.2, 0.2, 0.21];
    gu.uRoadTone.value.set(...road);
    // water quality: clear → industrial murk → recovery → clean future
    const murk = ramp(year, 1850, 1880) * (1 - ramp(year, 1975, 2030));
    riverMat.color.setRGB(lerp(0.08, 0.17, murk), lerp(0.2, 0.17, murk), lerp(0.17, 0.09, murk)).lerp(tmpC.setRGB(0.05, 0.2, 0.23), ramp(year, 2026, 2050));
    lakeMat.color.setRGB(0.035 + murk * 0.03, 0.12, 0.15 - murk * 0.03);
    lastWorldYear = year;
  }

  function updateAtmosphere(year, dt) {
    const a = (state.tod - 6) / 12 * Math.PI;
    sunDir.set(Math.cos(a), Math.sin(a) * 0.85, Math.sin(a) * 0.35 + 0.12).normalize();
    const fire = life.fireLevel || 0;
    const day = smoothstep(-0.06, 0.25, sunDir.y) * (1 - 0.6 * fire);   // smoke pall dims the sun during the fire
    const night = smoothstep(0.06, -0.12, sunDir.y);
    const dusk = smoothstep(-0.1, 0.05, sunDir.y) * (1 - smoothstep(0.05, 0.3, sunDir.y));
    U.uNight.value = night;
    const smokeAmt = ramp(year, 1855, 1885) * (1 - ramp(year, 1955, 1990));
    const future = ramp(year, 2030, 2055);

    skyU.sunPosition.value.copy(sunDir);
    skyU.turbidity.value = lerp(3, 9, smokeAmt) - future * 1.2;
    skyU.rayleigh.value = lerp(2.4, 3.2, smokeAmt * 0.5) + night * 0.5;
    skyU.mieCoefficient.value = lerp(0.004, 0.02, smokeAmt);
    for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG', 'sunPosition']) envSky.material.uniforms[k].value = skyU[k].value;

    sun.position.copy(sunDir).multiplyScalar(8000).add(sun.target.position);
    if (sunDir.y < 0) sun.position.set(-3000, 6000, 2500).add(sun.target.position); // moonlight
    sun.intensity = day * 3.2 + night * 0.1;
    sun.color.setRGB(1, lerp(0.62, 0.97, smoothstep(0.0, 0.4, sunDir.y)), lerp(0.4, 0.92, smoothstep(0.0, 0.4, sunDir.y)));
    if (night > 0.5) sun.color.setRGB(0.6, 0.7, 1.0);
    if (sun.castShadow !== state.shadows) { sun.castShadow = state.shadows; shadowDirty = true; }
    hemi.intensity = 0.12 + day * 0.78;
    hemi.color.setRGB(lerp(0.12, 0.72, day), lerp(0.15, 0.8, day), lerp(0.25, 0.95, day));
    hemi.groundColor.setRGB(lerp(0.08, 0.35, day), lerp(0.07, 0.31, day), lerp(0.06, 0.25, day));
    starMat.opacity = night * (1 - smokeAmt * 0.6) * (1 - ramp(year, 1900, 1960) * 0.7);

    // haze
    fogColor.setRGB(0.6, 0.68, 0.8).multiplyScalar(0.12 + 0.95 * day);
    fogColor.lerp(tmpC.setRGB(0.85, 0.55, 0.38), dusk * 0.6);
    fogColor.lerp(tmpC.setRGB(0.6, 0.55, 0.46).multiplyScalar(0.3 + 0.7 * day), smokeAmt * 0.55);
    const cityGlow = ramp(year, 1880, 1960) * 0.6 + 0.2;
    fogColor.lerp(tmpC.setRGB(0.05 + 0.06 * cityGlow, 0.05 + 0.04 * cityGlow, 0.08 + 0.02 * cityGlow), night);
    fogColor.lerp(tmpC.setRGB(0.32, 0.17, 0.09), fire * 0.85);
    scene.fog.color.copy(fogColor);
    skyU.uHorizon.value.copy(fogColor);
    scene.fog.density = (0.000108 + 0.00006 * smokeAmt - 0.000014 * future + fire * 0.00005) * (1 - night * 0.2);
    life.setFog(fogColor, scene.fog.density);
    fireLight.intensity = fire * 2500;
    if (fire > 0 && city.burning.length) {
      const b = city.burning[Math.floor(city.burning.length / 2)];
      fireLight.position.set(b.x, 600, b.z);
    }

    renderer.toneMappingExposure = 0.5 + night * 0.1;
    bloom.enabled = state.bloom && night > 0.03;   // daytime bloom would smear the HDR sky over everything
    bloom.strength = 0.15 + night * 0.55 + fire * 0.3;
    bloom.threshold = lerp(1.0, 0.72, night);
    bloom.radius = 0.35;
    afterimage.enabled = state.trails;
    afterimage.uniforms.damp.value = 0.93;

    // re-render the environment map when lighting changed enough
    const key = `${(Math.round(sunDir.x * 20) / 20)}|${(Math.round(sunDir.y * 20) / 20)}|${smokeAmt.toFixed(1)}`;
    if (key !== lastEnvKey) {
      lastEnvKey = key;
      if (envRT) envRT.dispose();
      envRT = pmrem.fromScene(envScene, 0, 1, 2000);
      scene.environment = envRT.texture;
    }
    return { night, day };
  }

  // speed limiter around key events
  function speedCap(year) {
    if (!state.slowEvents) return Infinity;
    if (year > FIRE_START - 0.08 && year < FIRE_START + FIRE_SPAN + 0.05) return 0.07;
    for (const e of EVENTS) if (e.slow && year > e.y - 0.6 && year < e.y + (e.dur || 0.8)) return 1.1;
    return Infinity;
  }

  // ------------------------------------------------------------ loop
  // compile every material now (incl. the lite variants) so playback never stalls on a new shader
  setStatus('Compiling shaders…');
  await nextFrame();
  renderer.compile(scene, camera);
  city.setLite(!q.lite); renderer.compile(scene, camera); city.setLite(q.lite);

  document.getElementById('loading').classList.add('done');
  console.info(`[timelapse] ready in ${Math.round(performance.now())} ms · ${city.lots.length} lots · GPU: ${gpuName} → ${autoQuality}`);
  updateWorld(state.year);
  let hashTimer = 0, frameNo = 0, shadowDirty = true, lastShadowTod = -1, fpsAcc = 0, fpsFrames = 0;

  function frame() {
    requestAnimationFrame(frame);
    step(Math.min(clock.getDelta(), 0.1));
  }
  function step(dt) {
    elapsed += dt;
    U.uTime.value = elapsed;

    if (state.playing) {
      const sp = Math.min(state.speed, speedCap(state.year));
      state.year += sp * dt;
      if (state.year >= END_YEAR) {
        if (state.loop) state.year = START_YEAR; else { state.year = END_YEAR; state.playing = false; }
      }
    }
    if (state.autoDay) state.tod = (state.tod + dt * 24 / 40) % 24;

    frameNo++;
    const yearMoved = Math.abs(state.year - lastWorldYear) > 1e-4;
    if (yearMoved) updateWorld(state.year);
    const { night } = updateAtmosphere(state.year, dt);
    // shadows are re-rendered only when the city or the sun changed
    if (yearMoved) shadowDirty = true;
    if (Math.abs(state.tod - lastShadowTod) > 0.02) { shadowDirty = true; lastShadowTod = state.tod; }
    if (shadowDirty && (frameNo % (state.playing ? 6 : 1) === 0)) { renderer.shadowMap.needsUpdate = true; shadowDirty = false; }
    // adaptive resolution keeps playback smooth on integrated GPUs
    fpsAcc += dt; fpsFrames++;
    if (fpsAcc > 2) {
      const fps = fpsFrames / fpsAcc;
      fpsAcc = 0; fpsFrames = 0;
      const target = q.pr;
      if (fps < 24 && pixelRatio > 0.55) { pixelRatio = Math.max(0.55, pixelRatio - 0.1); renderer.setPixelRatio(pixelRatio); resize(); }
      else if (fps > 50 && pixelRatio < target) { pixelRatio = Math.min(target, pixelRatio + 0.1); renderer.setPixelRatio(pixelRatio); resize(); }
      state.fps = fps;
    }
    landmarks.update(state.year, night, state.labels, camera.position);
    waterfront.update(state.year, dt, life.riverShips);
    life.update(elapsed, dt, state.year, { night, trafficOn: state.traffic, city, nature, landmarks });
    life.smoke.sprites.points.visible = state.smoke;

    waterNormal.offset.set(elapsed * 0.004, elapsed * 0.006);

    if (camTween) {
      camTween.t = Math.min(1, camTween.t + dt / 1.8);
      const e = smoothstep(0, 1, camTween.t);
      camera.position.lerpVectors(camTween.from.pos, camTween.to.pos, e);
      controls.target.lerpVectors(camTween.from.target, camTween.to.target, e);
      camera.lookAt(controls.target);
      camera.fov = lerp(camTween.from.fov, camTween.to.fov, e);
      camera.updateProjectionMatrix();
      life.setViewport(app.clientHeight * renderer.getPixelRatio(), camera.fov);
      if (camTween.t >= 1) camTween = null;
    } else if (controls.enabled) {
      controls.update();
    }

    if (bloom.enabled || afterimage.enabled) composer.render();
    else renderer.render(scene, camera);
    labelRenderer.render(scene, camera);
    ui.update(state.year, state.tod);

    hashTimer += dt;
    if (hashTimer > 1) {
      hashTimer = 0;
      history.replaceState(null, '', `#y=${state.year.toFixed(2)}&tod=${state.tod.toFixed(1)}&cam=${state.preset}`);
    }
  }
  frame();
  // debug: run n frames synchronously and report the average frame time (ms)
  function bench(n = 30) {
    const gl = renderer.getContext(), px = new Uint8Array(4);
    const t0 = performance.now();
    for (let i = 0; i < n; i++) { step(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    return (performance.now() - t0) / n;
  }
  window.__timelapse = { bench, state, scene, camera, city, life, landmarks, renderer, waterfront, gpuName, get pixelRatio() { return pixelRatio; } };
}

main().catch(err => {
  console.error(err);
  setStatus('Failed to start: ' + err.message);
});
