// New York, 1800–2050: Lower Manhattan, the East River bridges and the harbor —
// including September 11, 2001, played out in slowed clock time.
import * as THREE from 'three';
import { PRESENT_YEAR, ramp, lerp, yearOf } from '../../timeline.js';
import { buildLandTexture, createShoreTexture, mulberry32 } from '../../geo.js';
import { createGroundMaterial, createWaterMaterial } from '../../materials.js';
import { City } from '../../city.js';
import { Landmarks } from '../../landmarks.js';
import { Nature } from '../../nature.js';
import { Life, Path } from '../../life.js';
import { GRID_ROT, REGION, NYC_LAND, toWorld, landId, settleYear, parkYear, zoneOf, manhattan, LANDS, uptown } from './geo.js';
import { generateNycLots } from './lots.js';
import { NycWater } from './water.js';
import { NYC_LANDMARKS } from './landmarks.js';
import { WTC, WTC_LANDMARKS, T, DAY, wtcSpeedCap, wtcClock, wtcTod } from './wtc.js';

const at = (h, m, s = 0) => yearOf(2001, 9, 11, h, m, s);

const ERAS = [
  { from: 1800, to: 1825, name: 'Federal Seaport', color: '#a0794a',
    text: 'About 60,000 people live below Chambers Street. Federal-style rowhouses and counting houses, the Battery, the new City Hall, and sailing ships at the South Street wharves.' },
  { from: 1825, to: 1865, name: 'Port of the Nation', color: '#b8693a',
    text: 'The Erie Canal makes New York the country\'s gateway. Landfill pushes the shore outward, piers line both rivers, and the grid marches up the island.' },
  { from: 1865, to: 1900, name: 'Gilded Age', color: '#b5523a',
    text: 'Elevated railways rattle above the avenues. The Brooklyn Bridge, the Statue of Liberty and Ellis Island arrive, along with the first skyscrapers.' },
  { from: 1900, to: 1931, name: 'Race for the Sky', color: '#c9a03a',
    text: 'The Singer, Woolworth, 40 Wall and Empire State buildings each claim the skyline. New bridges cross the East River and ocean liners crowd the Hudson piers.' },
  { from: 1931, to: 1960, name: 'Depression, War & Boom', color: '#8f8a5a',
    text: 'Construction stalls, then the port booms through the war. The elevated lines come down and the FDR Drive and West Side Highway wrap the island.' },
  { from: 1960, to: T.impact1, name: 'Modern Downtown', color: '#4a7aa8',
    text: 'Glass and steel replace the old counting houses. The World Trade Center rises in 1970–73, its excavated earth becoming Battery Park City.' },
  { from: T.impact1, to: 2014.84, name: 'September 11 & Recovery', color: '#6b7280',
    text: 'The attacks of September 11, 2001 destroy the World Trade Center and kill 2,977 people. Ground Zero is cleared, the Memorial opens in 2011, and rebuilding begins.' },
  { from: 2014.84, to: 2027, name: 'One World Trade', color: '#3a9aa0',
    text: 'One World Trade Center stands 1,776 feet tall over the Memorial. Downtown becomes a neighborhood of residential towers, and new supertalls rise in Midtown.' },
  { from: 2027, to: 2050.01, name: 'Resilient Harbor', color: '#4ac08a', speculative: true,
    text: 'Speculative: raised seawalls and waterfront parks against the rising sea, electric ferries, autonomous traffic and green roofs across the boroughs.' },
];

const EVENTS = [
  { y: 1800, t: 'New York: about 60,000 people, almost all below Chambers Street' },
  { y: 1803, t: 'Construction of the new City Hall begins' },
  { y: 1811, t: 'Commissioners\' Plan lays out the Manhattan street grid; Castle Clinton built off the Battery' },
  { y: 1825.8, t: 'Erie Canal opens: New York becomes the nation\'s port', slow: true },
  { y: 1846, t: 'Trinity Church, the tallest building in the city' },
  { y: 1868, t: 'First elevated railway on Greenwich Street' },
  { y: 1883.4, t: 'Brooklyn Bridge opens', slow: true },
  { y: 1886.8, t: 'Statue of Liberty dedicated', slow: true },
  { y: 1892, t: 'Ellis Island immigration station opens' },
  { y: 1898, t: 'Greater New York: Brooklyn joins Manhattan' },
  { y: 1903.95, t: 'Williamsburg Bridge' },
  { y: 1908, t: 'Singer Building, briefly the world\'s tallest' },
  { y: 1909.99, t: 'Manhattan Bridge' },
  { y: 1913.3, t: 'Woolworth Building, the world\'s tallest until 1930' },
  { y: 1930.4, t: '40 Wall Street and the Chrysler Building race for the sky' },
  { y: 1931.3, t: 'Empire State Building opens', slow: true },
  { y: 1955, t: 'The last elevated railways downtown are torn down' },
  { y: 1961, t: 'One Chase Manhattan Plaza' },
  { y: 1968.3, t: 'Singer Building demolished' },
  { y: 1973.26, t: 'World Trade Center dedicated: the world\'s tallest buildings', slow: true },
  { y: 1976, t: 'Battery Park City rises on landfill from the WTC excavation' },
  { y: 1988, t: 'World Financial Center and the Winter Garden' },
  { y: T.impact1, t: '08:46 — Flight 11 strikes the North Tower', slow: true, lead: T.impact1 - at(8, 40), cam: 'hudson' },
  { y: T.impact2, t: '09:03 — Flight 175 strikes the South Tower', lead: T.impact2 - at(9, 0) },
  { y: T.collapseS, t: '09:59 — The South Tower collapses', lead: T.collapseS - at(9, 57) },
  { y: T.collapseN, t: '10:28 — The North Tower collapses', lead: T.collapseN - at(10, 26) },
  { y: T.collapse7, t: '17:20 — 7 World Trade Center collapses', lead: T.collapse7 - at(17, 17) },
  { y: yearOf(2002, 3, 11, 20), t: 'First Tribute in Light', tod: 21, lead: 0 },
  { y: T.cleanup, t: 'Recovery at Ground Zero ends' },
  { y: 2006.4, t: '7 World Trade Center rebuilt' },
  { y: 2011.69, t: 'National September 11 Memorial opens', slow: true },
  { y: 2014.84, t: 'One World Trade Center opens, 1,776 ft tall', slow: true },
  { y: 2016.2, t: 'The Oculus transit hall' },
  { y: 2019.2, t: 'Hudson Yards' },
  { y: 2026, t: 'Present day', slow: true },
  { y: 2032, t: 'Speculative: raised seawalls and parks protect Lower Manhattan' },
  { y: 2038, t: 'Speculative: electric ferries and autonomous traffic' },
  { y: 2046, t: 'Speculative: green-roofed, carbon-neutral skyline' },
];

export const meta = {
  id: 'nyc',
  name: 'New York',
  title: 'New York 1800–2050',
  kicker: 'New York City · Lower Manhattan & the harbor',
  eras: ERAS,
  events: EVENTS,
  defaultPreset: 'harbor',
  presets: {
    harbor:   { name: 'Upper Bay · looking north', pos: [380, 250, 2750], target: [560, 150, -950], fov: 36 },
    hudson:   { name: 'Over the Hudson · facing the WTC', pos: [-1150, 150, -650], target: [330, 210, -980], fov: 38 },
    brooklyn: { name: 'Brooklyn Heights promenade', pos: [2000, 70, 330], target: [520, 160, -880], fov: 38 },
    wtc:      { name: 'World Trade Center · close', pos: [1150, 620, 250], target: [300, 230, -960], fov: 36 },
    bridges:  { name: 'East River bridges · low', pos: [3650, 55, -430], target: [1600, 35, -300], fov: 36 },
    liberty:  { name: 'Statue of Liberty', pos: [-2460, 95, 1780], target: [380, 150, -900], fov: 34 },
    midtown:  { name: 'Drone over Midtown · looking south', pos: [3300, 900, -8600], target: [700, 60, -700], fov: 40 },
    top:      { name: 'Satellite', pos: [800, 8200, 400], target: [800, 0, -1200] },
  },
  jumps: [[1800, '1800'], [1825.7, 'Erie Canal'], [1883.3, 'Brooklyn Br.'], [1886.75, 'Liberty'], [1913, 'Woolworth'], [1931.2, 'Empire St.'],
    [1973.2, 'Twin Towers'], [at(8, 40), '9/11', null, 'hudson'], [yearOf(2002, 9, 11, 21), 'Tribute', 21, 'harbor'], [2011.68, 'Memorial'],
    [2014.8, 'One WTC'], [PRESENT_YEAR, 'Today'], [2050, '2050']],
  sunTarget: [800, 0, -1300],
};

export async function build({ scene, setStatus, nextFrame, waterNormal }) {
  setStatus('Charting the harbor…');
  await nextFrame();
  const landTex = buildLandTexture(384, NYC_LAND);
  const shoreTex = createShoreTexture();
  shoreTex.image.data.fill(THREE.DataUtils.toHalfFloat(60000));   // no beaches: Manhattan is edged by seawalls
  shoreTex.needsUpdate = true;
  const groundMat = createGroundMaterial(landTex, shoreTex, { rot: GRID_ROT, x: 110, z: 80, art: 1e6, loop: [0, 0, 0, 0] }, REGION);
  const waterMat = createWaterMaterial(waterNormal, { color: 0x10303a });
  const water = new NycWater(scene, waterNormal, waterMat, groundMat);

  setStatus('Laying out the grid…');
  await nextFrame();
  const defs = [...NYC_LANDMARKS, ...WTC_LANDMARKS];
  const landmarks = new Landmarks(scene, defs);
  const clears = defs.filter(d => landId(d.x, d.z) && !['liberty', 'ellis', 'castleclinton', 'castlewilliams', 'fortjay'].includes(d.id))
    .map(d => ({ x: d.x, z: d.z, rx: d.clear?.[0] ?? (d.id === 'empire' ? 70 : 40), rz: d.clear?.[1] ?? 40, from: d.from, to: 9999 }));
  setStatus('Raising the city…');
  await nextFrame();
  const lifeRef = {};
  const wtcClears = [{ x: 300, z: -955, rx: 150, rz: 190, from: 1966.5, to: 9999 }];
  const city = new City(scene, [...clears, ...wtcClears], { generate: generateNycLots });

  setStatus('Planting trees…');
  await nextFrame();
  const nature = new Nature(scene, { trees: nycTrees, camps: [] });
  setStatus('Starting traffic and ferries…');
  await nextFrame();
  const life = new Life(scene, water, nycHooks(water));
  lifeRef.life = life;
  const wtc = new WTC(scene, life);

  return {
    city, life, landmarks, nature,
    setYear(year) {
      water.setYear(year);
      city.update(year);
      nature.update(year);
      const gu = groundMat.userData.groundUniforms;
      gu.uStreetAmt.value = ramp(year, 1825, 1850) * 0.35 + ramp(year, 1890, 1915) * 0.5 + ramp(year, 1955, 1970) * 0.25;
      const lamp = year < 1900 ? [1.0, 0.72, 0.38] : year < 1960 ? [1.0, 0.82, 0.58] : year < 2015 ? [1.0, 0.58, 0.22] : [0.92, 0.94, 1.0];
      gu.uStreetLight.value.set(...lamp);
      gu.uRoadTone.value.set(...(year < 1870 ? [0.4, 0.35, 0.28] : year < 1920 ? [0.33, 0.31, 0.29] : [0.2, 0.2, 0.21]));
      const murk = ramp(year, 1850, 1890) * (1 - ramp(year, 1975, 2020));
      waterMat.color.setRGB(lerp(0.06, 0.1, murk), lerp(0.19, 0.17, murk), lerp(0.22, 0.14, murk));
    },
    frame(t, dt, year, env) {
      landmarks.update(year, env.night, env.labels, env.camera.position);
      life.update(t, dt, year, { night: env.night, trafficOn: env.traffic, city, nature, landmarks,
        extra: () => wtc.update(year, dt, env.night, env.labels) });
    },
    atmo(year) {
      const onDay = year >= DAY && year < T.dayEnd;
      return {
        smoke: ramp(year, 1850, 1885) * (1 - ramp(year, 1955, 1985)),
        fire: wtc.fire, firePos: wtc.firePos, dust: wtc.dust,
        clear: onDay ? (year < T.impact1 ? 1 : 0.6) : 0,          // the famously cloudless morning
      };
    },
    gates: [at(6, 0)],
    speedCap: wtcSpeedCap,
    todOverride: wtcTod,
    clock: wtcClock,
  };
}

// ---------------- traffic, trains and ships ----------------
function nycHooks(water) {
  const G = (lx, lz) => toWorld(lx, lz);
  const routes = {
    statenIsland: new Path([[380, 330], [250, 1200], [-300, 3200], [-900, 6000], [-1400, 9000]], 0),
    eastRiver: new Path([[300, 1100], [900, 350], [1770, -272], [2240, -380], [3000, -560], [3820, -1100], [4250, -2900], [4420, -5200], [4600, -8000]], 0),
    hudson: new Path([[-900, 9000], [-800, 3500], [-650, 0], [-560, -2000], [-300, -4500], [100, -8000], [300, -11000]], 0),
    harbor: new Path(Array.from({ length: 25 }, (_, i) => { const a = i / 24 * Math.PI * 2; return [-700 + Math.cos(a) * 1900, 3600 + Math.sin(a) * 1500]; }), 0),
    liberty: new Path([[-60, 120], [-1300, 900], [-2150, 1420], [-1850, 560], [-700, 300], [-60, 120]], 0),
  };
  const routeOf = (s) => s.k3 < 0.12 ? 'statenIsland' : s.k3 < 0.4 ? 'eastRiver' : s.k3 < 0.68 ? 'hudson' : s.k3 < 0.9 ? 'harbor' : 'liberty';
  const west = manhattan(2050).slice(1, 14).map(([x, z]) => [x + 55, z]);
  const east = manhattan(2050).slice(14, 26).map(([x, z]) => [x - 55, z]);
  return {
    settleAt: settleYear,
    waterAt: (x, z) => !landId(x, z),
    smokeCap: 9000,
    buildLanes(street, hwy) {
      // Broadway, the old Indian trail that cuts across the grid
      street([[278, -178], [464, -477], [877, -1054], [1299, -1743], [1687, -2453], [2226, -3618], [2319, -4218], [2471, -5150], [2656, -6072], [2960, -7193]], 1800, { core: true });
      // avenues and cross streets on the 1811 grid
      for (let k = -19; k <= 22; k += 2) street([G(k * 110, -7900), G(k * 110, 700)], 1820, { core: Math.abs(k) < 12 });
      for (let j = -98; j <= 7; j += 5) street([G(-2300, j * 80), G(2600, j * 80)], 1820, { core: j > -40 });
      street(west, 1850, { core: true });                                  // West Street
      street(east, 1820, { core: true });                                  // South Street / the East River waterfront
      // the bridges
      for (const b of water.bridges) street(b.lanePoints(0), b.open, { core: true });
      // Brooklyn and Jersey City streets
      for (let j = -12; j <= 30; j += 4) street([G(1400, j * 80 + 600), G(9000, j * 80 + 600)], 1840);
      for (let k = 13; k <= 60; k += 4) street([G(k * 110, -4000), G(k * 110, 5000)], 1840);
      for (let k = -40; k <= -18; k += 4) street([G(k * 110, -6000), G(k * 110, 4000)], 1850);
      // highways: the elevated West Side Highway (1931–73), FDR Drive (1942), Route 9A (1989), the BQE (1954)
      const wsh = west.map(([x, z]) => [x - 20, z, 7.5]);
      const fdr = east.map(([x, z]) => [x + 22, z]);
      const r9a = west.map(([x, z]) => [x - 18, z]);
      const bqe = LANDS[0].pts.slice(1, 5).map(([x, z]) => [x + 160, z + 60]);
      hwy(wsh, 1931, { to: 1973.5 }); hwy(fdr, 1942); hwy(r9a, 1989); hwy(bqe, 1954);
      return [
        { pts: wsh.map(([x, z]) => [x, z]), w: 24, year: 1931, to: 1973.5, y: 7 },
        { pts: fdr, w: 24, year: 1942 }, { pts: r9a, w: 30, year: 1989 }, { pts: bqe, w: 26, year: 1954 },
      ];
    },
    // the elevated railways ("Els"), all gone by the 1950s
    trainLines: [
      { pts: [[250, 260], [330, -500], [420, -1600], [560, -2700], [700, -3800], [850, -5000], [1100, -6500]], year: 1868, to: 1940, n: 4 },
      { pts: [[260, 250], [560, -400], [900, -1800], [1400, -3000], [1800, -4300], [2200, -5500], [2500, -6800]], year: 1878, to: 1938, n: 4 },
      { pts: [[320, 240], [700, -100], [1400, -900], [2000, -1800], [2600, -3000], [3000, -4300], [3400, -5500], [3700, -6600]], year: 1878, to: 1955, n: 5 },
      { pts: [[760, -60], [1600, -800], [2600, -1800], [3200, -3200], [3700, -4800]], year: 1880, to: 1942, n: 3 },
    ],
    maglev: [],
    shipCount: 70,
    riverShipCount: 0,
    marina(r) {
      const list = [];
      for (let i = 0; i < 28; i++) list.push({ x: -95 + (i % 7) * 13, z: -1100 + Math.floor(i / 7) * 22, k: r() });
      return list;
    },
    marinaFrom: 1988,
    flyArea: [-1500, -6000, 5000, 7000],
    turbineSpots: () => [],
    shipType(s, year, busy) {
      const route = routeOf(s);
      if (s.k > 0.3 + 0.7 * ramp(year, 1800, 1860) || (year > 1965 && year < 2030 && s.k > 0.6)) return null;
      if (route === 'statenIsland') return year < 1905 ? 'steamer' : 'siferry';
      if (route === 'liberty') return year > 1955 ? 'tour' : null;
      if (year < 1840) return 'schooner';
      if (year < 1880) return s.k2 < 0.55 ? 'schooner' : 'steamer';
      if (year < 1965) return route === 'hudson' && year > 1905 && s.k2 < 0.3 ? 'liner' : s.k2 < 0.15 ? 'schooner' : 'steamer';
      if (year < 2035) return route === 'eastRiver' ? (s.k2 < 0.5 ? 'tour' : 'barge') : s.k2 < 0.4 ? 'freighter' : 'sail';
      return s.k2 < 0.5 ? 'ferry' : 'sail';
    },
    moveShip(s, type, year, dt, p) {
      const path = routes[routeOf(s)];
      const speed = type === 'liner' || type === 'freighter' ? 9 : type === 'siferry' ? 12 : 10 + s.speed;
      s.u += dt * s.dir * speed * 3.5 / path.len;
      path.at(((s.u % 1) + 1) % 1 * path.len, p);
      const side = (s.k2 - 0.5) * (routeOf(s) === 'eastRiver' ? 140 : 300);
      return { x: p.x - p.dz * side, z: p.z + p.dx * side, dx: p.dx * s.dir, dz: p.dz * s.dir };
    },
    mooringType(m, year) {
      if (!m.on) return null;
      if (m.where === 'seaport' && year > 1967) return m.k < 0.7 ? 'schooner' : null;   // the Seaport's museum ships
      if (year < 1850) return m.k < 0.7 ? 'schooner' : null;
      if (year < 1900) return m.k < 0.65 ? (m.k < 0.3 ? 'schooner' : 'steamer') : null;
      if (year < 1962) return m.k < 0.55 ? (m.pier.len > 230 && m.k < 0.2 && year > 1905 ? 'liner' : 'steamer') : null;
      return m.k < 0.15 ? 'barge' : null;
    },
  };
}

// ---------------- trees ----------------
function nycTrees(add, r) {
  for (let n = 0, tries = 0; n < 9000 && tries < 160000; tries++) {
    const x = -4500 + r() * 11000, z = -8000 + r() * 12000;
    const id = landId(x, z);
    if (!id) continue;
    const py = parkYear(x, z);
    if (isFinite(py)) { add(x, z, 3.5 + r() * 4, Math.max(1790, py) + 2 + r() * 12, 9999); n++; continue; }
    const sy = settleYear(x, z), zone = zoneOf(x, z);
    if (!isFinite(sy)) continue;
    // farms and woods of upper Manhattan, Brooklyn and Jersey City, cleared as the city arrives
    if (sy > 1805 && r() < 0.25) { add(x, z, 4 + r() * 5, 1700, sy - 2 + r() * 6); n++; continue; }
    if ((zone === 'village' || zone === 'bkres' || zone === 'njres') && r() < 0.5) { add(x, z, 3 + r() * 3, sy + 25 + r() * 40, 9999); n++; continue; }
    if (r() < 0.12) { add(x, z, 2.8 + r() * 2.5, 2026 + r() * 22, 9999); n++; }
  }
}
