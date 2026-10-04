# City Time-lapse 1800 → 2050: Chicago & New York

Interactive Three.js time-lapses of two cities, from 1800 to a speculative 2050. You control the timeline. Pick the city
from the control bar or in Settings, or open `?city=chicago` / `?city=nyc`.

- **Chicago**: the river mouth and lakefront, from Fort Dearborn to the Great Fire of 1871 and the modern skyline.
- **New York**: Lower Manhattan, the East River bridges and the harbor. This includes **September 11, 2001**, played in
  slowed clock time.

## Run

```bash
node server.mjs
```

Then open http://localhost:5173. No install is needed: three.js loads from jsDelivr through an import map.
Any static server works, but opening `index.html` as a file does not, because ES modules need http.

## New York and September 11, 2001

Lower Manhattan, Brooklyn, Jersey City and the harbor islands are modelled with real positions on Manhattan's 29°
street grid. This includes the landfill of Battery Park City (built partly from the WTC excavation), the Brooklyn,
Williamsburg and Manhattan bridges, the elevated railways, the finger piers, the Statue of Liberty, Ellis Island, and
skylines from Trinity Church to One World Trade Center.

On **September 11, 2001** the timeline slows to real clock time, shown in the HUD with captions. It slows further around
each key moment: 08:46 (Flight 11, North Tower), 09:03 (Flight 175, South Tower), 09:59 and 10:28 (the collapses) and
17:20 (7 WTC). Fire, smoke and the dust cloud are shown as a documentary reconstruction. No people are depicted. The
timeline continues through Ground Zero, the Memorial (2011), One World Trade Center (2014) and the Tribute in Light on
anniversary nights. Use the **9/11** jump button, or turn off *Slow at key events* to play through at normal speed.

## Install as an app (PWA)

The page is a Progressive Web App: a manifest, icons and a service worker. Once installed it opens full-screen
and keeps working offline after the first visit.

- **Desktop Chrome / Edge**: click the ⬇ button in the control bar, or the install icon in the address bar.
- **Android**: ⬇ button, or the browser menu → *Install app*.
- **iPad / iPhone (Safari)**: Share → *Add to Home Screen*. The ⬇ button shows this hint.

Installing needs **https** (or `localhost`). To install on a tablet, host the folder over https, for example with
GitHub Pages: repo **Settings → Pages → Deploy from a branch → `main` / root**. The site is then at
`https://<user>.github.io/<repo>/`. All paths are relative, so it works from that sub-folder.
When files change, bump `VERSION` in `sw.js` so installed copies drop their old offline cache.
Icons are generated with `node tools/make-icons.mjs`.

## Controls

| | |
|---|---|
| **Space** | play / pause |
| **← / →** | ±1 year (**Shift** = ±10) |
| Timeline | drag to scrub; click an event tick to jump to it |
| **1–8** | cameras: harbor & river mouth, bridges (low), Wacker Dr, whole city, Skydeck, Gold Coast, Museum Campus, satellite |
| **F** | toggle locked drone / free orbit camera |
| **N** | day ↔ night |
| **L** | landmark labels |
| **H** | hide the UI (cinematic mode) |
| ⚙ | time of day, day–night cycle, season, quality, layers (traffic, smoke, shadows, bloom, light trails) |

**Touch (tablet / phone):**

| | |
|---|---|
| Swipe sideways on the scene | move through time (locked camera) |
| Double-tap | play / pause |
| Two fingers | switch to the free camera, then drag = orbit, pinch = zoom, two-finger drag = pan |
| Side toolbar | ◀ ▶ camera, ✋ free/locked, ☾ day/night, 🏷 labels, ⤢ hide UI |

Buttons and the timeline get bigger automatically on touch screens. Add the page to the home screen for full-screen use.

The URL hash keeps the year, time of day and camera (`#y=1871.80&tod=21&cam=harbor`), so you can share a moment as a link.

## What's modelled

- **Geography**: the real street grid (State & Madison origin), the river with its pre-1833 sandbar mouth, the north and south
  branches, and the lakefront landfill that pushes the shoreline east (IC trestle, Grant Park, Streeterville, Museum Campus,
  Lincoln Park).
- **Working waterfront**: the river and lake sit below street level between dock walls (natural banks, then timber, then
  stone) and seawalls. About 20 movable bridges: swing bridges, later Chicago-type bascules with tender houses. They open
  for tall-masted ships, and traffic crosses only when they're down. There are riverside streets (South Water St → Wacker Dr,
  Kinzie, Market, Canal), the 2009–2016 Riverwalk, harbor piers, the lighthouse, breakwaters, grain elevators and ships
  tied up along the wharves and at Navy Pier.
- **Growth**: about 22k building lots, each with its own history: wood frame, brick, stone, early skyscraper, Art Deco,
  Mies-style modern, glass, speculative green towers. Each history is evaluated on the GPU from the current year.
- **1871 Great Fire**: spreads from the O'Leary barn across the burn zone, then brick and stone rebuilding.
- **Landmarks** with real dates and positions: Fort Dearborn I/II, Du Sable post, Water Tower, Home Insurance Building,
  Navy Pier, Wrigley, Tribune, Merchandise Mart, Board of Trade, Hancock, Sears → Willis (renamed 2009), Aon, Trump,
  St. Regis, Millennium Park, and a few clearly labelled speculative towers after 2026.
- **Life by era**: canoes → schooners → steamers → sailboats; horses → streetcars → cars → autonomous pods; the Loop L,
  expressways, Lake Shore Drive, a 2040s maglev, air taxis and offshore wind turbines.
- **Atmosphere**: coal-smoke haze from about 1860 to 1970, street lighting by era (gas → incandescent → sodium → LED), seasons, stars.

## Files

- `src/main.js`: generic engine: renderer, sky/lighting, camera, post-processing, playback, UI wiring
- `src/cities/chicago.js`, `src/cities/nyc/*`: one adapter per city (eras, events, cameras, geography, lots,
  landmarks, waterfront, traffic hooks). `nyc/wtc.js` holds the World Trade Center and September 11
- `src/waterfront.js`: river/lake cut-out, dock walls, bridges, riverside streets, Riverwalk, piers, lighthouse
- `src/geom.js`: ribbon / wall / box geometry helpers
- `src/geo.js`: shoreline, rivers, land use, fire zone, GPU data textures
- `src/city.js`: lot generation and GPU-timed building instances
- `src/landmarks.js`: hand-modelled landmarks
- `src/nature.js`: trees and Indigenous camps
- `src/life.js`: traffic, trains, ships, aircraft, turbines, smoke and light sprites
- `src/materials.js`: procedural facade / ground / water shaders
- `src/timeline.js`: eras and events; `src/ui.js`: controls; `src/touch.js`: touch gestures
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA (offline cache, install)

Quality is detected from the GPU (Auto → High / Medium / Low) and resolution adapts to keep playback smooth.
