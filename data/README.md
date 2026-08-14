# Geoform data lake (Track A)

Earth grids for **physics calibration** live here — not fantasy map art.

## Layout

```
data/
  catalog.yaml          # AOI + dataset registry
  raw/                  # immutable downloads (checksummed)
  staging/              # clipped/reprojected COGs
  derived/              # slope, flow, orographic fits
  qa/                   # hillshade / precip sanity maps
```

## AOI #1 — Cascades rain shadow strip

See `catalog.yaml`. Success metric (Phase 2): after fitting, raising a synthetic ridge in Geoform dries the lee in the same sense as WorldClim residuals east of the Cascades.

## Commands

```bash
# Create folders + print next download steps
npm run aoi:init

# (Later) fetch DEM/climate once credentials/URLs are configured
npm run aoi:fetch -- --dry-run
```

Do **not** put Tolkien/Westeros images in `raw/`. Those belong only in private critique eval folders if licensed.
