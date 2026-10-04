// Chicago, 1800–2050: the river mouth and lakefront (the original scene).
import * as THREE from 'three';
import { CHICAGO_ERAS, CHICAGO_EVENTS, PRESENT_YEAR, ramp, lerp, calendarOf } from '../timeline.js';
import { buildLandTexture, createShoreTexture, updateShoreTexture, s0, FIRE_START, FIRE_SPAN } from '../geo.js';
import { createGroundMaterial, createWaterMaterial } from '../materials.js';
import { City } from '../city.js';
import { Landmarks } from '../landmarks.js';
import { Nature } from '../nature.js';
import { Life } from '../life.js';
import { Waterfront } from '../waterfront.js';
import { ribbonGeometry } from '../geom.js';

export const meta = {
  id: 'chicago',
  name: 'Chicago',
  title: 'Chicago 1800–2050',
  kicker: 'Chicago, Illinois · fixed drone time-lapse',
  eras: CHICAGO_ERAS,
  events: CHICAGO_EVENTS,
  defaultPreset: 'harbor',
  presets: {
    harbor:  { name: 'Harbor & river mouth', pos: [1900, 210, -560], target: [-150, 0, -655], fov: 30 },
    bridges: { name: 'Bridges · low over the river', pos: [330, 48, -560], target: [-430, 0, -655] },
    wacker:  { name: 'Wacker Dr · South Branch', pos: [-560, 110, -420], target: [-790, 0, 520] },
    drone:   { name: 'Drone · whole city', pos: [2700, 760, -160], target: [-900, 0, 260] },
    skydeck: { name: 'Skydeck · looking east', pos: [-705, 470, 470], target: [1500, 0, -700] },
    north:   { name: 'Gold Coast · looking south', pos: [1100, 420, -6200], target: [-250, 0, -500] },
    south:   { name: 'Museum Campus · looking north', pos: [1500, 330, 5600], target: [-150, 60, -200] },
    top:     { name: 'Satellite', pos: [-300, 7600, 1400], target: [-300, 0, 0] },
  },
  jumps: [[1800, '1800'], [1833, 'Harbor'], [1860, 'Wharves'], [1871.69, 'Fire'], [1905, 'Bascules'], [1930, 'Deco'], [1973, 'Sears'], [2016, 'Riverwalk'], [PRESENT_YEAR, 'Today'], [2050, '2050']],
  sunTarget: [-400, 0, 0],
};

export async function build({ scene, setStatus, nextFrame, waterNormal, year0 }) {
  setStatus('Surveying the prairie…');
  await nextFrame();
  const landTex = buildLandTexture(512);
  const shoreTex = createShoreTexture();
  updateShoreTexture(shoreTex, year0);
  const groundMat = createGroundMaterial(landTex, shoreTex);
  // the river and lake are cut out of the ground plane through the stencil buffer (see waterfront.js)
  groundMat.stencilWrite = true;
  groundMat.stencilRef = 1;
  groundMat.stencilFunc = THREE.NotEqualStencilFunc;
  groundMat.stencilZPass = THREE.KeepStencilOp;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(90000, 90000).rotateX(-Math.PI / 2), groundMat);
  ground.receiveShadow = true;
  scene.add(ground);

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

  let lastShoreYear = -1;
  const tmpC = new THREE.Color();

  return {
    city, life, landmarks, nature,
    setYear(year) {
      if (Math.abs(year - lastShoreYear) > 0.25) { updateShoreTexture(shoreTex, year); lastShoreYear = year; }
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
    },
    frame(t, dt, year, env) {
      waterfront.update(year, dt, life.riverShips);
      landmarks.update(year, env.night, env.labels, env.camera.position);
      life.update(t, dt, year, { night: env.night, trafficOn: env.traffic, city, nature, landmarks });
    },
    atmo(year) {
      const fire = life.fireLevel || 0;
      let firePos = null;
      if (fire > 0 && city.burning.length) { const b = city.burning[Math.floor(city.burning.length / 2)]; firePos = [b.x, 600, b.z]; }
      return { smoke: ramp(year, 1855, 1885) * (1 - ramp(year, 1955, 1990)), fire, firePos };
    },
    gates: [FIRE_START - 0.08],
    speedCap(year) {
      if (year > FIRE_START - 0.08 && year < FIRE_START + FIRE_SPAN + 0.05) return 0.07;
      return Infinity;
    },
    clock(year) {
      if (year < 1871.66 || year >= 1872.0) return null;
      // the fire is stretched over several weeks of the timeline so it can be seen spreading
      return { label: 'Oct 8–10, 1871' };
    },
  };
}
