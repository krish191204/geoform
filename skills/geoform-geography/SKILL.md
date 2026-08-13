---
name: geoform-geography
description: Geography accuracy rules for Geoform — Earth calibration vs critique benchmarks, rain shadows, hydro, lapse, settlement.
---

# Geoform geography skill

If you are reading the code for the first time, start at the repo root: `HOW_IT_WORKS.md`, then `src/world/types.ts`.

## Hard rules

1. **Numbers come from grids + fitted models**, never from an LLM inventing precip/temp.
2. **Track A (calibration)** uses real Earth AOIs only (`data/catalog.yaml`).
3. **Track B (critique)** uses synthetic / earth-pattern / owned fantasy images under `tests/critique/fixtures/`.
4. **Do not train climate coefficients on Middle-earth / Westeros** or other copyrighted atlases.
5. Famous IP maps: private eval only if licensed — never commit to the public repo.

6. **The editor repairs; it does not nag.** `harmonizeWorld` carves ocean, clumps continents, chews rectangular coasts, drains rivers, and relocates drowned cities.
7. **Full continents means clumping, not land fraction.** A wet mix still has 2–3 masses. Island world is the speckle look on purpose.
8. Labs, critique, and the atlas share this generator. Critique may grade a broken save; the editor will not leave it broken.

## AOI #1

`cascades-rain-shadow` — see `data/catalog.yaml`.

Wet west (Pacific / Cascades windward) → crest → dry east (Columbia interior).

## When editing climate / hydro

- Lapse ≈ 6.5 °C/km unless a fitted regional lapse is loaded.
- Rivers follow steepest descent / flow accumulation — never paint uphill.
- Rain shadows assume documented prevailing wind (Cascades: westerlies).
- Settlement prefers water access + gentle slope + mild temperature.

## Tests

```bash
npm run fixtures:critique
npm test
npm run aoi:init
npm run aoi:fetch -- --dry-run
```

Policy doc: `docs/TRAINING_AND_TESTS.md`.
