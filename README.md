# Geoform — technical documentation

Geoform is a browser worldbuilding app. Paint a heightfield; climate, rivers, and biomes follow; cities sit where land can support them. Default engine: **Local (browser)**. Typical world: **320×160**.

Pages:

- Map editor `/` — paint, Full continents vs islands, silent geography repair
- Labs `/labs.html` — one rule at a time (including continent clumping)
- Critique `/critique.html` — grade fixtures and Geoform JSON
- Roadmap `/roadmap.html` — T0 shipped, T1 Earth calibration next

Optional Mindwerks WorldEngine backend remains available as **WorldEngine API**.

---

## Architecture

```
┌─────────────────────────────┐     Vite proxy /api/*      ┌──────────────────────────────┐
│  Browser (Vite + TS)        │ ─────────────────────────► │  ThreadingHTTPServer :8765   │
│  src/main.ts                │     JSON grids             │  server/worldengine_api.py   │
│  TypedArrays in memory      │ ◄───────────────────────── │  vendor/worldengine (pip -e) │
│  Canvas 2D renderer         │                            │  PyPlatec + numpy sims       │
│  localStorage autosave      │                            └──────────────────────────────┘
└─────────────────────────────┘
```

| Process | Command | Port | Role |
|---------|---------|------|------|
| Frontend | `npm run dev` | `127.0.0.1:5173` | UI, brush edits, suitability, render, persist |
| Backend | `npm run dev:api` | `127.0.0.1:8765` | `world_gen` / climate recompute → JSON |

`vite.config.ts` proxies `/api` and `/health` to `:8765` so the browser stays same-origin.

There is **no database**. Runtime state is in-memory typed arrays. Persistence is `localStorage` + optional JSON file export.

---

## Setup / run

```bash
npm run setup:api          # clones vendor/worldengine + creates .venv (gitignored)
npm run dev:api            # terminal 1 → :8765
npm run dev                # terminal 2 → http://127.0.0.1:5173
```

Or manually:

```bash
cd vendor/worldengine && python3 -m venv .venv && source .venv/bin/activate
pip install -e .          # worldengine + PyPlatec, numpy, noise, protobuf, …
cd ../.. && npm install

npm run dev:api           # terminal 1
npm run dev               # terminal 2 → http://127.0.0.1:5173
```

**If the map is blank / “Bad Gateway”:** an old build expected WorldEngine. Current default is **Local (browser)** — just `npm run dev` and hit New world. Optional: `npm run setup:api && npm run dev:api` for WorldEngine.

There is **no cloud account / cloud sync** for worlds. Autosave is `localStorage` in the current browser only; use Export/Import JSON to move maps between machines.

---

## In-memory world model (`src/world/types.ts`)

All spatial fields are length `width * height`, row-major (`i = y * width + x`).

| Field | Type | Semantics |
|-------|------|-----------|
| `elev` | `Float32Array` | Normalized elevation in **\[0, 1\]**; sea ≈ `seaLevel` (0.42) |
| `temp` | `Float32Array` | Normalized temperature **\[0, 1\]** |
| `moist` | `Float32Array` | Normalized humidity (preferred) or precip **\[0, 1\]** |
| `flux` | `Float32Array` | Scaled WorldEngine watermap; rivers drawn if ≳ 3.2–3.8 |
| `plateId` | `Int16Array` | Plate index per cell |
| `biome` | `string[]` | Holdridge names (e.g. `cool temperate moist forest`) or `ocean` |
| `suitability` | `Float32Array` | Client-side settlement score **\[0, 1\]** (lazy / on demand) |
| `cities` | `{x,y,name,score}[]` | Placed settlements |
| `rawElevMin/Max`, `rawSeaThreshold` | `number` | WorldEngine native elevation calibration for round-trip recompute |

`engine: 'worldengine' | 'local'` marks provenance. Default new worlds are `local`. WorldEngine is opt-in.

---

## Backend pipeline (WorldEngine)

Entry: `worldengine.plates.world_gen(...)` then serialization in `server/worldengine_api.py`.

### Generate (`POST /api/generate`)

Body: `{ seed, width, height, numPlates }`.

1. **`generate_plates_simulation` (PyPlatec)**  
   C extension steps a plate simulation until finished. Returns heightmap + plate id map.

2. **Wrap in `World`**  
   `World(name, Size(w,h), seed, GenerationParameters(...))` with elevation + plates as numpy layers.

3. **`center_land`**  
   Roll map so ocean mass sits toward borders.

4. **`add_noise_to_elevation`**  
   Simplex noise (`noise.snoise2`) added to heightfield.

5. **`place_oceans_at_map_borders`** (optional fade) + **`initialize_ocean_and_thresholds`**  
   Flood-fill ocean from map edges where `elev <= ocean_level`; compute sea / plain / hill / mountain thresholds.

6. **`generate_world(world, Step.full())`** sequential simulations:
   - `TemperatureSimulation` — latitude + altitude lapse vs mountain threshold  
   - `PrecipitationSimulation` — noise precip modulated by temperature curve  
   - `ErosionSimulation`  
   - `WatermapSimulation` — drainage / flux  
   - `IrrigationSimulation`, `HumiditySimulation`, `PermeabilitySimulation`  
   - `BiomeSimulation` — Holdridge classification from temp + humidity  
   - `IcecapSimulation`

7. **`serialize_world`**  
   - Remaps WorldEngine elevation into UI space with fixed `seaLevel = 0.42` (ocean below, land above).  
   - Min–max normalizes temp and humidity to \[0,1\].  
   - Scales watermap so max → 18 (UI river threshold).  
   - Emits flat JSON arrays + `rawElev*` for inverse mapping on recompute.

### Recompute (`POST /api/recompute`)

Body: edited normalized `elev[]`, `plateId[]`, seed, size, `rawElev*`, `seaLevel`.

1. Invert UI elevation → approximate WorldEngine elevation using stored raw min/max/sea threshold.  
2. Rebuild `World`, set elevation + plates.  
3. `initialize_ocean_and_thresholds(ocean_level=raw_sea_threshold)`.  
4. `generate_world(..., Step.full())` again (**no** plate resim).  
5. Serialize like generate.

**Note:** Brushing only mutates height on the client; plates stay fixed unless you generate a new world.

---

## Frontend data path

### Load

`src/world/worldengine.ts` → `fetch('/api/generate')` → `worldFromPayload()` builds `Float32Array`/`Int16Array` fields → `recomputeSuitability()`.

Boot (`main.ts`): if `localStorage['geoform.autosave.v1']` exists, deserialize that instead of generating.

### Brush edit (`paintElevation`)

Radial falloff brush adds/subtracts from `elev` (clamped \[0,1\]).

Then **local** `recomputeDerived(world, includeSuitability=false)` in `climate.ts` (fast TS climate/hydro/biome) for immediate preview.

Debounced **`refreshGeography` / `harmonizeWorld`** repairs mix, coasts, speckles, drainage, and climate in the browser. WorldEngine recompute is only used when that engine is selected.

### Settlement (`evaluateSuitability`)

Pure client heuristic on cell `(x,y)`:

- hard fail if `elev < seaLevel`
- penalties: alpine height, steep local slope, low moisture, polar cold, hostile biome strings, distance from river/coast  
- bonuses: temperate band, grassland/forest-like biomes, near high `flux` or ocean neighbor  
- `ok` if score ≥ 0.42 and slope/height gates pass  
- UI blocks unless `ok` or Shift forced

---

## HTTP API contract

### `GET /health`

```json
{ "ok": true, "engine": "worldengine", "version": "0.20.0" }
```

### `POST /api/generate` → world payload

```json
{
  "engine": "worldengine",
  "width": 320,
  "height": 160,
  "seed": 123,
  "seaLevel": 0.42,
  "plateCount": 10,
  "elev": [/* wh floats */],
  "plateId": [/* wh ints */],
  "temp": [/* wh */],
  "moist": [/* wh */],
  "flux": [/* wh */],
  "biome": [/* wh strings */],
  "rawElevMin": 0.0,
  "rawElevMax": 8.0,
  "rawSeaThreshold": 1.0
}
```

### `POST /api/recompute`

Same response shape. Request includes `elev`, `plateId`, calibration fields above.

Errors: `{ "error": "..." }` with 4xx/5xx.

---

## Persistence

Implemented in `src/world/persist.ts`.

| Mechanism | Storage | Contents |
|-----------|---------|----------|
| Autosave | `localStorage` key `geoform.autosave.v1` | Full `SavedWorld` JSON (version 1) |
| Export | Download `geoform-seed-{seed}.json` | Same schema, pretty-printed |
| Import | File picker | `deserializeWorld` → replace in-memory world |

`SavedWorld` stores number arrays (not TypedArrays), biomes, cities, and WorldEngine calibration fields. Suitability is recomputed on load.

Autosave triggers: debounced after edits/cities, and `beforeunload`.  
**New world** calls `clearAutosave()` then writes a fresh autosave after generate.

Limits: origin-scoped, quota-bound (~few MB; 320×160 × several float arrays is fine), not synced across browsers/devices.

---

## Rendering (`src/render/draw.ts`)

`MapRenderer`:

1. Rebuilds a cached `ImageData` when world hash / layer changes.  
2. Samples cell colors with bilinear interpolation at `scale=4` (display buffer 1280×640 for 320×160).  
3. Relief/biome: directional hillshade from elevation gradients; coast edge darkening/foam; river tint from `flux`.  
4. Animation loop (`requestAnimationFrame`): throttled ocean shimmer overlay, wind particles on relief/moisture, brush ring, city pulse.

Layers are **views** over the same arrays; switching layer does not mutate simulation state.

---

## Repo layout

```
src/main.ts                 UI state machine, tools, rAF, boot
src/world/worldengine.ts    HTTP client + payload → World
src/world/climate.ts        Local climate preview + suitability
src/world/generate.ts       Brush + optional local generator (fallback)
src/world/persist.ts        serialize / localStorage / file I/O
src/render/draw.ts          Canvas rasterizer
server/worldengine_api.py   WorldEngine JSON bridge
vendor/worldengine/         Upstream Mindwerks WorldEngine (editable install)
```

---

## Complexity / performance notes

| Operation | Approx cost | Bottleneck |
|-----------|-------------|------------|
| Generate 320×160 | ~5–15s | PyPlatec plate stepping |
| Recompute climate | ~1s | WE simulation chain on CPU |
| Local brush preview | ms | TS loops over brush radius + light climate |
| Full suitability map | tens of ms | 320×160 × neighborhood queries |
| Base raster rebuild | tens of ms | bilinear + hillshade CPU |

Authoritative climate after sculpt is the local TS path (`harmonizeWorld`) unless WorldEngine is selected.

---

## Accuracy roadmap (Earth-grounded next stage)

Full requirements (datasets, math, skills, storage, phases):

- Immersive interactive page: [http://127.0.0.1:5173/roadmap.html](http://127.0.0.1:5173/roadmap.html) (also linked from the map editor)
- Geography labs (elevation, rivers, rain shadow, tectonics, settlement): [http://127.0.0.1:5173/labs.html](http://127.0.0.1:5173/labs.html)
- Map critique (upload a map image, get a geography roast): [http://127.0.0.1:5173/critique.html](http://127.0.0.1:5173/critique.html)
- Training / test corpus policy: [`docs/TRAINING_AND_TESTS.md`](docs/TRAINING_AND_TESTS.md)
- Report: [`docs/ACCURACY_ROADMAP.md`](docs/ACCURACY_ROADMAP.md)

Critique regression: `npm run fixtures:critique && npm test`

Tooling references cloned locally under `vendor-skills/` (gitignored): shadcn-ui MCP, anthropics/skills, ui-ux-pro-max, Convex agent-skills.

## What is explicitly not in the stack

- No GPU compute / WebGL terrain  
- No vector SVG cartography  
- No multiplayer / server-side save store  
- No RAG or external climate datasets (WorldEngine’s internal models only)  
- Plate velocities are not exposed for interactive editing—only height brushes + full regenerations
