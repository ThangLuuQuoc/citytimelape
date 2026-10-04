# Chicago 1800 → 2050 — interactive time-lapse

A Three.js scene of Chicago's river mouth and lakefront, from Fort Dearborn (1800) to a speculative 2050 skyline,
and you control the timeline.

## Run

```bash
node server.mjs
```

Then open http://localhost:5173. No install is needed: three.js loads from jsDelivr through an import map.
Any static server works, but opening `index.html` as a file does not, because ES modules need http.

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

- `src/main.js`: renderer, sky/lighting, camera, post-processing, main loop
- `src/waterfront.js`: river/lake cut-out, dock walls, bridges, riverside streets, Riverwalk, piers, lighthouse
- `src/geom.js`: ribbon / wall / box geometry helpers
- `src/geo.js`: shoreline, rivers, land use, fire zone, GPU data textures
- `src/city.js`: lot generation and GPU-timed building instances
- `src/landmarks.js`: hand-modelled landmarks
- `src/nature.js`: trees and Indigenous camps
- `src/life.js`: traffic, trains, ships, aircraft, turbines, smoke and light sprites
- `src/materials.js`: procedural facade / ground / water shaders
- `src/timeline.js`: eras and events; `src/ui.js`: controls

Quality is detected from the GPU (Auto → High / Medium / Low) and resolution adapts to keep playback smooth.
