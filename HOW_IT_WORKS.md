# How Geoform works (for humans)

You are not supposed to already know this. This file is the tour.

## What you are looking at

Geoform is a **browser paint program** for planets, plus an optional **Python science** server.

- The map lives in RAM as a bunch of arrays of numbers.
- The canvas in the page is just a picture of those numbers.
- When you paint, TypeScript changes the numbers and redraws instantly.
- When you click **New world** (with Python up), Python builds the heightfield and climate, then sends the grids to the browser.
- When you click Save, those numbers become a JSON file on **your** computer.

### Two processes (when using Python science)

| Piece | What it does | How you start it |
| --- | --- | --- |
| TypeScript UI (Vite) | Paint, undo, cities, canvas | `npm run dev` or `npm run dev:all` |
| Python API (:8765) | New world + climate rebuild | `npm run setup:api` once, then `npm run dev:api` or `dev:all` |

If Python is offline, the app still works: **Local preview** generates the planet in the browser instead.

Pull the branch, run `npm install`, then prefer `npm run setup:api` + `npm run dev:all`.

## One cell = one pixel of planet

The world is a **grid**. Typical size is 320 cells wide by 160 cells tall.

Each cell has:

| Thing | Meaning in English |
| --- | --- |
| height | How tall the ground is. 0 is the seafloor. 1 is a huge mountain. |
| plates | Which tectonic plate owns this cell. Just an integer id. |
| rain | How wet the climate thinks this cell is. |
| temp | How warm. High at the equator, low at the poles, colder on mountains. |
| flux | How much river water is trying to flow through this cell. |
| biome | A label we pick from height + rain + temp (ocean, desert, forest, ice…). |
| cities | Optional. A city sits on one cell. |

To find cell `(x, y)` in a flat array we use:

```
index = y * width + x
```

That is the only addressing trick. If you see `idx`, that is this index.

## The map is a cylinder, not a rectangle in space

Left edge and right edge are the **same longitude**. Walk off the right, you appear on the left. That is why rivers wrap in X.

Top and bottom are poles. You do **not** wrap in Y. Walking off the north pole into the south pole would be nonsense.

## Sea level is one number

`world.seaLevel` is usually around `0.34`–`0.42`.

- height **below** sea level → ocean (we draw it blue)
- height **above** sea level → land

The **Land %** slider is a *wish*: “I want about this much of the grid to be land.” We try to honor it by growing or shrinking **existing coasts**. We do **not** sprinkle random new islands to hit the number (that looked like acne).

## Landmass styles (the dropdown)

This is `world.continentMass`:

- **Full continents** — keep 2–3 huge blobs. Tiny specks get drowned. Coasts grow/shrink as one piece.
- **Islands & archipelagos** — many blobs are allowed. We do not glue them into continents.
- **Mixed** — a few big ones plus leftovers.

If you pick Full continents and then paint a lonely rectangle in the ocean, **Refresh geography** (or a new world) will treat that rectangle as a speckle and may drown it. That is on purpose. Paint attached to a real coast if you want it to stay.

## The pipeline (order matters)

1. **Heightfield** — Python (or Local noise), or your paintbrush.
2. **Land / sea** — compare height to sea level.
3. **Reshape masses** — drown speckles or keep islands, depending on the dropdown.
4. **Fit land %** — nibble or grow **coasts only**.
5. **Chew coasts** — break ruler-straight edges so they look like shores.
6. **Meander** — optional extra wiggling on large worlds.
7. **Climate** — temperature from latitude + mountain height; rain from trade winds hitting slopes.
8. **Rivers** — every land cell flows downhill (moisture-weighted); closed bowls get outlets cut to the sea. Continents are never left riverless — if flux would stay invisible, the atlas scales trunks so streams show (Azgaar-style networks on a grid).
9. **Cities** — only on land that can feed people. Ocean cities get moved or deleted.
10. **Draw** — color pixels. Thin blue = tributaries; darker blue = main stems.

New world also raises **plate-edge mountains** and **inland uplands/plateaus** so land is not a flat green shelf.

While you paint, TypeScript updates climate in the browser so the brush feels instant. With Python selected, a fuller climate rebuild can run when you release the mouse or hit Refresh. Rivers are always re-derived from height so they do not vanish.

`harmonizeWorld` in `src/world/geography.ts` is the quiet repair pipeline on the TypeScript side. The UI does **not** pop an error. It just fixes the map.

We do **not** run heavy sculpt on every paint dab. Painting would feel like fighting the engine. Sculpt happens on New world, Add a continent, and Refresh geography.

## Files you actually care about

| File | What it is |
| --- | --- |
| `src/main.ts` | The editor page. Buttons, paint, autosave, engine choice. |
| `src/world/types.ts` | The shape of a World. Start here. |
| `src/world/worldengine.ts` | Talks to the Python API. |
| `server/worldengine_api.py` | Python science server. |
| `src/world/generate.ts` | Local (browser) brand-new planet — offline fallback. |
| `src/world/land.ts` | Land vs water helpers. Flood fill. Grow/erode coasts. |
| `src/world/mass.ts` | Continents vs islands. The “keep 2–3 blobs” logic. |
| `src/world/geography.ts` | The quiet repair pipeline. |
| `src/world/climate.ts` | Temperature, rain, rivers, biomes (browser preview). |
| `src/world/coasts.ts` | Make coasts look organic, not like a rectangle. |
| `src/world/expand.ts` | Zoom-out adds real cells around the map. |
| `src/world/persist.ts` | Save / load JSON. Repair on load unless critique says no. |
| `src/world/tools.ts` | What the brush does to height. |
| `src/world/history.ts` | Undo / redo. |
| `src/render/draw.ts` | Paints the canvas from the arrays. |
| `src/labs/` | Tiny demos. Same rules as the editor. |
| `src/critique/` | Drop a JSON, score it. Can repair or leave it broken. |
| `src/roadmap/` | What shipped vs what is still a wish. |

## Python science vs Local preview

| Mode | When | Who builds New world |
| --- | --- | --- |
| **Python science (WorldEngine)** | Default if `npm run dev:api` is running | Python on `:8765` |
| **Local preview (browser)** | Offline fallback, or you pick it in World menu | TypeScript `generate.ts` |

Painting is always TypeScript. Never waits on Python mid-stroke.

## Saving locally

- **In the app:** Export writes a JSON download.
- **The code:** this git branch. `git pull` on your machine.
- Autosave uses `localStorage` in **that** browser. Another machine will not see it unless you export a file.
