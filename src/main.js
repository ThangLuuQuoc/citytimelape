// Generic time-lapse engine: renderer, sky, light, haze, camera, post-processing, playback and UI.
// Everything specific to a city lives in src/cities/* (chosen with ?city=…).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import { START_YEAR, END_YEAR, EVENTS, clamp, lerp, ramp, smoothstep, useTimeline } from './timeline.js';
import { U, makeWaterNormalTexture } from './materials.js';
import { UI } from './ui.js';
import { bindGestures } from './touch.js';

export const CITIES = {
  chicago: { name: 'Chicago', load: () => import('./cities/chicago.js') },
  nyc: { name: 'New York', load: () => import('./cities/nyc/world.js') },
};

const setStatus = (t) => { const el = document.getElementById('loading-text'); if (el) el.textContent = t; };
// setTimeout (not rAF) so loading also progresses in a background tab
const nextFrame = () => new Promise(r => setTimeout(r, 16));

const cityId = (() => {
  const q = new URLSearchParams(location.search).get('city');
  if (q && CITIES[q]) return q;
  try { const s = localStorage.getItem('ctl-city'); if (s && CITIES[s]) return s; } catch { /* storage blocked */ }
  return 'chicago';
})();
try { localStorage.setItem('ctl-city', cityId); } catch { /* storage blocked */ }

// ---------------------------------------------------------------- state
export const state = {
  year: START_YEAR, playing: false, speed: 6, loop: true, slowEvents: true,
  tod: 10, autoDay: false, season: 'summer',
  labels: true, traffic: true, smoke: true,
  camMode: 'locked', preset: null, city: cityId,
  shadows: true, bloom: true, trails: false, quality: 'auto',
};
(function readHash() {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.has('y')) state.year = clamp(parseFloat(h.get('y')) || START_YEAR, START_YEAR, END_YEAR);
  if (h.has('tod')) state.tod = clamp(parseFloat(h.get('tod')) || 10, 0, 24);
  if (h.has('cam')) state.preset = h.get('cam');
  if (h.has('play')) state.playing = h.get('play') === '1';
})();

async function main() {
  const cityMod = await CITIES[cityId].load();
  const meta = cityMod.meta;
  useTimeline(meta.eras, meta.events);
  const PRESETS = meta.presets;
  if (!(state.preset in PRESETS)) state.preset = meta.defaultPreset;
  document.title = meta.title;
  document.querySelector('.loading-title').innerHTML = `${meta.name} <span>1800 → 2050</span>`;
  document.querySelector('.kicker').textContent = meta.kicker;

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
  // updateStyle=false: never pin the canvas to a px size, CSS keeps it full-screen (an installed PWA
  // starts smaller and then grows to full screen / rotates, which left a black band on the right)
  renderer.setSize(innerWidth, innerHeight, false);
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
  sun.target.position.set(...meta.sunTarget);
  const hemi = new THREE.HemisphereLight(0xbcd4ff, 0x4a4436, 0.8);
  scene.add(hemi);
  const fireLight = new THREE.PointLight(0xff6a20, 0, 9000, 1.2);
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

  // ------------------------------------------------------------ the city
  const waterNormal = makeWaterNormalTexture();
  const world = await cityMod.build({ scene, renderer, setStatus, nextFrame, waterNormal, year0: state.year });
  const { city, life, landmarks } = world;

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
    const p = PRESETS[id] || PRESETS[meta.defaultPreset];
    state.preset = id in PRESETS ? id : meta.defaultPreset;
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
  // resize right away (not on the next frame): a backgrounded or just-launched PWA may not get frames yet
  const queueResize = () => resize();
  new ResizeObserver(queueResize).observe(app);
  addEventListener('resize', queueResize);
  addEventListener('orientationchange', () => { queueResize(); setTimeout(resize, 350); });
  window.visualViewport?.addEventListener('resize', queueResize);
  matchMedia('(display-mode: standalone), (display-mode: fullscreen)').addEventListener?.('change', () => setTimeout(resize, 100));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) queueResize(); });
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
    onSeek: (y, tod, cam) => {
      if (Math.abs(y - state.year) > 1e-4) life.smoke.clear();   // smoke belongs to the moment it was made
      state.year = clamp(y, START_YEAR, END_YEAR);
      if (tod != null) { state.tod = tod; state.autoDay = false; }
      if (cam && PRESETS[cam]) { if (state.camMode !== 'locked') setCamMode('locked'); applyPreset(cam); }
    },
    onPreset: id => applyPreset(id),
    onCamMode: m => setCamMode(m),
    onQuality: () => applyQuality(),
    onCity: id => {
      if (id === cityId) return;
      const u = new URL(location.href);
      u.searchParams.set('city', id);
      u.hash = '';
      location.href = u.toString();
    },
  }, PRESETS, { jumps: meta.jumps, cities: Object.entries(CITIES).map(([id, c]) => ({ id, name: c.name })), city: cityId });

  bindGestures(renderer.domElement, {
    mode: () => state.camMode,
    year: () => state.year,
    playing: () => state.playing,
    setPlaying: (v) => { state.playing = v; ui.syncPlay(); },
    togglePlay: () => ui.togglePlay(),
    seek: (y) => { life.smoke.clear(); state.year = clamp(y, START_YEAR, END_YEAR); },
    free: () => { setCamMode('free'); ui.syncAll(); },
    toast: (t) => ui.toast(t),
  });

  // ------------------------------------------------------------ world update
  const sunDir = new THREE.Vector3();
  const fogColor = new THREE.Color();
  const tmpC = new THREE.Color();
  let lastWorldYear = -1, lastSeason = '';
  const clock = new THREE.Clock();
  let elapsed = 0;

  function seasonFor(year) {
    if (state.season !== 'cycle') return state.season;
    const m = (year - Math.floor(year)) * 12;
    return m < 2.2 || m >= 11.3 ? 'winter' : m < 5 ? 'spring' : m < 8.6 ? 'summer' : 'autumn';
  }

  function updateWorld(year) {
    const season = seasonFor(year);
    if (season !== lastSeason) { world.nature?.setSeason(season); lastSeason = season; }
    U.uSnow.value = season === 'winter' ? 0.85 : 0;
    U.uAutumn.value = season === 'autumn' ? 1 : 0;
    U.uYear.value = year;
    U.uGreenRoof.value = ramp(year, 2026, 2058) * 0.7 + ramp(year, 2008, 2020) * 0.05;
    U.uSolar.value = ramp(year, 2015, 2050) * 0.45;
    world.setYear(year);
    lastWorldYear = year;
  }

  function updateAtmosphere(year) {
    const a = (state.tod - 6) / 12 * Math.PI;
    sunDir.set(Math.cos(a), Math.sin(a) * 0.85, Math.sin(a) * 0.35 + 0.12).normalize();
    const atmo = world.atmo(year);
    const fire = atmo.fire || 0;
    const clear = atmo.clear || 0;            // "severe clear" skies (e.g. the morning of 9/11)
    const day = smoothstep(-0.06, 0.25, sunDir.y) * (1 - 0.6 * fire);   // smoke pall dims the sun during a fire
    const night = smoothstep(0.06, -0.12, sunDir.y);
    const dusk = smoothstep(-0.1, 0.05, sunDir.y) * (1 - smoothstep(0.05, 0.3, sunDir.y));
    U.uNight.value = night;
    const smokeAmt = (atmo.smoke || 0) * (1 - clear);
    const future = ramp(year, 2030, 2055);

    skyU.sunPosition.value.copy(sunDir);
    skyU.turbidity.value = lerp(3, 9, smokeAmt) - future * 1.2 - clear * 1.4;
    skyU.rayleigh.value = lerp(2.4, 3.2, smokeAmt * 0.5) + night * 0.5 + clear * 0.4;
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
    if (atmo.dust) fogColor.lerp(tmpC.setRGB(0.62, 0.58, 0.5).multiplyScalar(0.4 + 0.6 * day), atmo.dust * 0.8);
    scene.fog.color.copy(fogColor);
    skyU.uHorizon.value.copy(fogColor);
    scene.fog.density = (0.000108 + 0.00006 * smokeAmt - 0.000014 * future + fire * 0.00005 + (atmo.dust || 0) * 0.00035) * (1 - night * 0.2) * (1 - clear * 0.35);
    life.setFog(fogColor, scene.fog.density);
    fireLight.intensity = fire * 2500;
    if (atmo.firePos) fireLight.position.set(...atmo.firePos);

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

  // playback speed limits: the city's special windows (fires, 9/11) and generic "slow" events
  function speedCap(year) {
    if (!state.slowEvents) return Infinity;
    const c = world.speedCap(year);
    if (c < Infinity) return c;
    for (const e of EVENTS) if (e.slow && year > e.y - 0.6 && year < e.y + (e.dur || 0.8)) return 1.1;
    return Infinity;
  }
  // never jump over the start of a slowed window when playing fast
  const gates = () => (state.slowEvents ? [...(world.gates || []), ...EVENTS.filter(e => e.slow).map(e => e.y - 0.6)] : []);

  // ------------------------------------------------------------ loop
  // compile every material now (incl. the lite variants) so playback never stalls on a new shader
  setStatus('Compiling shaders…');
  await nextFrame();
  renderer.compile(scene, camera);
  city.setLite(!q.lite); renderer.compile(scene, camera); city.setLite(q.lite);

  document.getElementById('loading').classList.add('done');
  console.info(`[timelapse] ${meta.name} ready in ${Math.round(performance.now())} ms · ${city.lots.length} lots · GPU: ${gpuName} → ${autoQuality}`);
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
      let next = state.year + sp * dt;
      for (const g of gates()) if (state.year < g && next >= g) { next = g; break; }
      state.year = next;
      if (state.year >= END_YEAR) {
        if (state.loop) state.year = START_YEAR; else { state.year = END_YEAR; state.playing = false; }
      }
    }
    const forcedTod = world.todOverride?.(state.year);
    if (forcedTod != null) state.tod = forcedTod;
    else if (state.autoDay) state.tod = (state.tod + dt * 24 / 40) % 24;

    frameNo++;
    const yearMoved = Math.abs(state.year - lastWorldYear) > 1e-9;
    if (yearMoved) updateWorld(state.year);
    const { night } = updateAtmosphere(state.year);
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
    world.frame(elapsed, dt, state.year, { night, labels: state.labels, traffic: state.traffic, camera });
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
    ui.update(state.year, state.tod, world.clock?.(state.year));

    hashTimer += dt;
    if (hashTimer > 1) {
      hashTimer = 0;
      history.replaceState(null, '', `${location.pathname}${location.search}#y=${state.year.toFixed(5)}&tod=${state.tod.toFixed(2)}&cam=${state.preset}`);
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
  window.__timelapse = { bench, state, scene, camera, city, life, landmarks, renderer, world, gpuName, get pixelRatio() { return pixelRatio; } };
}

main().catch(err => {
  console.error(err);
  setStatus('Failed to start: ' + err.message);
});
