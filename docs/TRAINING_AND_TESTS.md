# Training and tests corpus policy

**Status:** active policy for Geoform accuracy + map critique  
**Companion:** [ACCURACY_ROADMAP.md](./ACCURACY_ROADMAP.md)

## What “training” means

Geoform has two different loops. Do not mix them.

| Track | Goal | Allowed corpus | Forbidden corpus |
|-------|------|----------------|------------------|
| **A · Physics calibration** | Fit precip / lapse / hydro / settlement responses (T1) | Real Earth AOI grids (DEM, WorldClim/CHELSA, ERA5, HydroSHEDS) | Fantasy atlas art, Middle-earth, Westeros, style-reference PNGs |
| **B · Critique regression** | Prove the image critic catches known geography mistakes | Synthetic cursed maps, Earth-pattern composites you generate, maps you own | Copyrighted IP scans in the public repo; using fantasy maps as climate labels |

Fantasy continents are stories about land. Earth grids are measurements. Fitting climate on Tolkien encodes myth as physics.

```
Earth AOI grids ──► calibrate physics ──► Geoform recompute
Synthetic / owned map images ──► labeled issues ──► critique Vitest suite
```

## Track A (real Earth only)

Follow [ACCURACY_ROADMAP.md](./ACCURACY_ROADMAP.md) §6–8:

1. Pick 1–3 AOIs (Cascades, western Andes, NZ Alps, …).
2. Ingest DEM + climate + wind for that bbox only.
3. Fit orography / lapse / flow with **spatial-block** holdouts.
4. Acceptance: raise a ridge → lee dries like Earth residuals.

**Do not start an image neural net for climate** until Track A has a real AOI and fitted coefficients.

## Track B (critique fixtures)

Harness: Vitest + `tests/critique/fixtures/` (PNG + JSON sidecar).

```bash
npm run fixtures:critique   # regenerate procedural PNGs + sidecars
npm test                    # run regression suite
```

### Fixture schema (`*.json` beside each `*.png`)

- `corpus`: `synthetic` | `earth-pattern` | `fantasy-owned`
- `mustFind` / `mustNotFind`: match on `kind`, `titleIncludes`, optional `minSeverity`
- `score.min` / `score.max`: soft grade bounds

Current seed pack:

| Id | Corpus | Intent |
|----|--------|--------|
| `broken-desert-jungle` | synthetic | Desert glued to jungle |
| `broken-river-ridge` | synthetic | River cresting a ridge |
| `broken-stranded-rivers` | synthetic | Streams that never reach water |
| `cascades-rain-shadow` | earth-pattern | Wet west / crest / dry east (Cascades-like pattern, **not** a copyrighted basemap screenshot) |

Generators live in [`src/critique/sampleMaps.ts`](../src/critique/sampleMaps.ts). Analyzer entry for tests: `analyzeRawPixels`.

### Growing the pack (~12–20 images)

- More synthetic cursed maps (controlled ground truth).
- More Earth-pattern composites for known rain shadows (self-drawn / public-domain only).
- Fantasy-like maps **you own** or that are public domain.
- Famous IP (Middle-earth / Westeros): **local/private eval only** unless you have license rights — never commit those stills to the public repo.

## Copyright / ethics

- Do **not** ship Tolkien / GRRM map scans as a public training or test dataset.
- Prefer public-domain Earth knowledge patterns, your own drawings, and procedural samples.
- Private folders for copyrighted reference maps are fine for personal eval; keep them gitignored.

## Verdict

- **Calibrate** on real parts of the world.
- **Test** the critic on synthetic + owned / earth-pattern maps (and private fantasy refs if licensed).
- **Do not train** climate/generator weights on famous fantasy maps.
