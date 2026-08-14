# How Geoform works (for humans)

You are not supposed to already know this. This file is the tour.

## What you are looking at

Geoform is a **browser app**. There is no secret cloud computer drawing the map.

- The map lives in RAM as a bunch of arrays of numbers.
- The canvas in the page is just a picture of those numbers.
- When you paint, you change the numbers. Then we redraw the picture.
- When you click Save, those numbers become a JSON file on **your** computer.

The GitHub branch with this code is the source. Pull it, run `npm install` then `npm run dev`, open the local URL. That is “saved locally.”

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

`world.seaLevel` is usually `0.34`.

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

1. **Heightfield** — noise, or your paintbrush.
2. **Land / sea** — compare height to sea level.
3. **Reshape masses** — drown speckles or keep islands, depending on the dropdown.
4. **Fit land %** — nibble or grow **coasts only**.
5. **Chew coasts** — break ruler-straight edges so they look like shores.
6. **Meander** — optional extra wiggling on large worlds.
7. **Climate** — temperature from latitude + mountain height; rain from trade winds hitting slopes.
8. **Rivers** — every land cell flows downhill; water that cannot reach the sea gets a canyon cut to the sea.
9. **Cities** — only on land that can feed people. Ocean cities get moved or deleted.
10. **Draw** — color pixels.

`harmonizeWorld` in `src/world/geography.ts` is the function that runs this quietly. The UI does **not** pop an error. It just fixes the map.

We do **not** run the heavy sculpt on every paint dab. Painting would feel like fighting the engine. Sculpt happens on New world, Add a continent, and Refresh geography.

## Files you actually care about

| File | What it is |
| --- | --- |
| `src/main.ts` | The editor page. Buttons, paint, autosave. |
| `src/world/types.ts` | The shape of a World. Start here. |
| `src/world/generate.ts` | Brand new planet from a seed. |
| `src/world/land.ts` | Land vs water helpers. Flood fill. Grow/erode coasts. |
| `src/world/mass.ts` | Continents vs islands. The “keep 2–3 blobs” logic. |
| `src/world/geography.ts` | The quiet repair pipeline. |
| `src/world/climate.ts` | Temperature, rain, rivers, biomes. |
| `src/world/coasts.ts` | Make coasts look organic, not like a rectangle. |
| `src/world/expand.ts` | Zoom-out adds real cells around the map. |
| `src/world/persist.ts` | Save / load JSON. Repair on load unless critique says no. |
| `src/world/tools.ts` | What the brush does to height. |
| `src/world/history.ts` | Undo / redo. |
| `src/render/draw.ts` | Paints the canvas from the arrays. |
| `src/labs/` | Tiny demos. Same rules as the editor. |
| `src/critique/` | Drop a JSON, score it. Can repair or leave it broken. |
| `src/roadmap/` | What shipped vs what is still a wish. |

## WorldEngine (the other engine)

There is a second backend behind a dropdown: a WASM port of WorldEngine. It is **optional**. Default is Local. If WASM is missing, we stay on Local. Do not chase WorldEngine files until Local makes sense.

## Saving locally

- **In the app:** Save writes `geoform-world.json` through the browser download.
- **The code:** this git branch. `git pull` on your machine.
- Autosave uses `localStorage` in **that** browser. Another machine will not see it unless you save a file.
