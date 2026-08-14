# Training and tests corpus policy

**Status:** active — Track B harness running; Track A Phase 0 started (Cascades AOI catalog)  
**Companion:** [ACCURACY_ROADMAP.md](./ACCURACY_ROADMAP.md)

## What “training” means

| Track | Goal | Allowed corpus | Forbidden corpus |
|-------|------|----------------|------------------|
| **A · Physics calibration** | Fit precip / lapse / hydro / settlement (T1) | Real Earth AOI grids in `data/` | Fantasy atlas art, Middle-earth, Westeros |
| **B · Critique regression** | Prove the image critic catches geography mistakes | Synthetic, earth-pattern, owned fantasy fixtures | Copyrighted IP scans in the public repo; fantasy maps as climate labels |

```
Earth AOI grids ──► calibrate physics ──► Geoform recompute
Synthetic / owned map images ──► labeled issues ──► critique Vitest + /critique.html gallery
```

## Track A — started

- AOI #1: **Cascades rain-shadow strip** (`data/catalog.yaml`)
- Folder layout: `npm run aoi:init`
- Fetch checklist: `npm run aoi:fetch -- --dry-run`
- Skill: [`skills/geoform-geography/SKILL.md`](../skills/geoform-geography/SKILL.md)

Raw DEM/WorldClim/ERA5 downloads are **planned** (need account + storage). Do not start an image neural net for climate until those grids exist and a spatial-block fit lands.

## Track B — running

```bash
npm run fixtures:critique
npm test
```

Open [http://127.0.0.1:5173/critique.html](http://127.0.0.1:5173/critique.html) → **Geoform worlds** and **Fixture gallery**.

The editor silently repairs; critique still names the crime (rectangle, all-land slab, flipped shadow). Geoform JSON can be repaired with the same `harmonizeWorld` pass.

### Current pack

| Id | Corpus | Intent |
|----|--------|--------|
| `broken-desert-jungle` | synthetic | Desert glued to jungle |
| `broken-river-ridge` | synthetic | River cresting a ridge |
| `broken-stranded-rivers` | synthetic | Streams that never reach water |
| `broken-hot-peaks` | synthetic | Warm-painted highlands |
| `broken-pepper-peaks` | synthetic | Isolated pinnacles |
| `cascades-rain-shadow` | earth-pattern | Wet west / crest / dry east |
| `andes-rain-shadow` | earth-pattern | Dry west coast / crest / greener east |
| `fantasy-owned-coherent` | fantasy-owned | Self-drawn coherent continent |
| `fantasy-owned-broken` | fantasy-owned | Self-drawn flipped shadow + uphill stream |

Generators: [`src/critique/sampleMaps.ts`](../src/critique/sampleMaps.ts).

## Copyright

- No Tolkien/GRRM scans in the public repo.
- Prefer procedural / self-drawn / public-domain earth patterns.
- Private licensed refs stay gitignored.

## Verdict

- **Calibrate** on real Earth (Track A in progress).
- **Test** the critic on the fixture gallery (Track B live).
- **Do not** train climate weights on famous fantasy maps.
