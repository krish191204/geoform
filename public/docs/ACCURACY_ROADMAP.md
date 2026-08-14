# Geoform Accuracy Requirements Report

**Status:** planning baseline for Earth-grounded geography  
**Audience:** you (builder) + future agents working on Geoform  
**Companion dashboard:** open the Cursor canvas `geoform-accuracy-roadmap.canvas.tsx` beside chat  

This document is the full technical requirements dump: data to ingest, mathematics, skills, storage durability, fine-tuning loops, agent/tooling stack (from the repos you named), and a phased execution plan. The current Geoform local atlas (continents, climate-from-height, silent repair) is **T0**. WorldEngine is an optional bridge, not the accuracy target.

---

## 0. What “accurate” means for this project

Three different accuracy targets get confused. Pick explicitly; they cost different orders of magnitude.

| Tier | Name | Definition | Relative cost |
|------|------|------------|---------------|
| **T0** | Coherent fantasy | Local atlas: continents clump, climate follows height, silent repair | 1× (**shipped**) |
| **T1** | Earth-calibrated fantasy | Brush/climate responses match statistical relationships fitted on Earth data | ~10–30× |
| **T2** | Regional Earth twin | Given lat/lon bbox, reproduce DEM/climate/hydro within measured error bars | ~100–300× |
| **T3** | Planetary digital twin | Global, multi-decadal, uncertainty-quantified, forecast-capable | research lab |

**Recommended product goal:** ship **T1** fully, support **T2** for 1–3 named regions (e.g. Andes rain shadow, Cascades, Tibetan Plateau), never promise T3.

Everything below is sized for **T1 → T2**.

---

## 1. System architecture required (target)

```
                    ┌─────────────────────────────┐
                    │  Geoform UI (Next/Vite)     │
                    │  map editor + inspector     │
                    │  shadcn components          │
                    └──────────────┬──────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              ▼                    ▼                    ▼
     ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐
     │ Convex backend │  │ Geo compute API  │  │ RAG / agents    │
     │ worlds, users  │  │ GDAL/xarray jobs │  │ citations       │
     │ saves, jobs    │  │ calibration      │  │ method docs     │
     └───────┬────────┘  └────────┬─────────┘  └────────┬────────┘
             │                    │                     │
             ▼                    ▼                     ▼
     ┌────────────────┐  ┌──────────────────┐  ┌─────────────────┐
     │ Object store   │  │ Data lake        │  │ Doc store       │
     │ world JSON     │  │ COG / Zarr /     │  │ papers, manuals │
     │ exports        │  │ GeoPackage       │  │ + embeddings    │
     └────────────────┘  └──────────────────┘  └─────────────────┘
```

**Hard rule:** LLMs never invent elevation/precip. They retrieve **citations** and **parameters**. Numbers come from grids + fitted models.

---

## 2. Data to ingest (exhaustive catalog)

### 2.1 Elevation & bathymetry (mandatory)

| Dataset | Resolution | Use | License notes |
|---------|------------|-----|---------------|
| Copernicus DEM GLO-30 / GLO-90 | 30–90 m | Primary land DEM | Check Copernicus terms; attribution |
| SRTM v3 / NASADEM | ~30 m | Backup / fill voids | NASA public |
| ASTER GDEM | ~30 m | Secondary fill | Mixed; prefer NASADEM |
| ETOPO 2022 / GEBCO | 15″–1′ | Ocean bathymetry | Public / attribution |
| FABDEM / MERIT DEM | ~30–90 m | Forest-bias corrected heights | Academic / specific terms |

**Ingest requirements:** download tiles → mosaic → set CRS (EPSG:4326 or projected UTM for analysis) → vertical unit meters → nodata mask → Cloud Optimized GeoTIFF (COG) → checksum → catalog entry.

### 2.2 Climate (mandatory for rain shadows)

| Dataset | Variables | Native res | Use |
|---------|-----------|------------|-----|
| WorldClim 2.1 | tmin/tmax/tavg, precip, bioclim | ~1 km | Long-term normals; easy baseline |
| CHELSA v2 | temp, precip | ~1 km | Alternative normals; often better orography |
| ERA5 / ERA5-Land | wind, humidity, precip, temp | 0.1°–0.25° | Wind direction for orographic models; hourly→monthly aggregates |
| CRU TS | temp, precip | 0.5° | Century-scale validation |
| PRISM (US only) | precip/temp | ~800 m | Gold-standard regional validation |
| Daymet (N America) | daily climate | 1 km | Regional fine-tune |

**Derived products you must build yourself:**

- Mean annual precip (MAP), mean annual temp (MAT)
- Seasonality indices
- Predominant wind vector at 850 hPa / 10 m (from ERA5)
- Orographic lift proxy: `max(0, ū · ∇z)` on DEM
- Windward/leeward moisture residual fields for calibration

### 2.3 Hydrology (mandatory for rivers & settlement)

| Dataset | Use |
|---------|-----|
| HydroSHEDS / HydroBASINS | Basins, rivers at multiple Pfafstetter levels |
| MERIT Hydro | High-quality flow direction / accumulation |
| GRWL / SWOT river products | Wide-river validation |
| Global Lakes and Wetlands / HydroLAKES | Lakes |
| National products (NHD, EU-Hydro) | Region T2 validation |

### 2.4 Land cover, biomes, soils

| Dataset | Use |
|---------|-----|
| ESA WorldCover 10 m | Land cover classes |
| MODIS MCD12Q1 | Longer time series LC |
| Dynamic World | Near-real-time LC (optional) |
| SoilGrids 2.0 | Texture, organic carbon, water capacity |
| Holdridge / Whittaker literature maps | Biome taxonomy alignment with WorldEngine |
| Köppen–Geiger classifications (Beck et al.) | Climate zone validation |

### 2.5 Cryosphere & hazards (T2+)

- Randolph Glacier Inventory, NSIDC snow/ice
- Global Landslide catalogs, seismic hazard maps (for “don’t build city here” rules beyond climate)

### 2.6 Human geography (settlement suitability ground truth)

| Dataset | Use |
|---------|-----|
| WorldPop / GHS-POP | Population density as settlement prior |
| GHS-BUILT / GHSL | Built-up footprint |
| OpenStreetMap (planet extracts / Geofabrik) | Cities, roads, ports, farmland |
| Natural Earth + GeoNames | Place names, populated places |
| FAO / agricultural suitability maps | Cropland potential |

### 2.7 Coastlines, admin, base cartography

- GSHHG / OSM coastline
- Natural Earth 10m/50m physical + cultural
- WVS / GADM (careful with license) for admin boundaries if needed

### 2.8 Knowledge corpus for RAG (methods, not pixels)

Ingest as PDFs/HTML with strict provenance:

1. Dataset user manuals (WorldClim, ERA5, Copernicus DEM, HydroSHEDS)
2. Classic method papers: Holdridge life zones; Köppen; orographic precipitation reviews; Planchon–Darboux depression filling; D8/D∞ flow algorithms
3. Cartography standards: EPSG guidance, ISO 19115 metadata primer
4. Your own lab notebook: calibration experiments, failed fits, region notes

**RAG chunking rules:**

- Chunk by section, keep dataset name + DOI + year in metadata
- Never mix numeric grids into embedding store
- Every UI “why” answer must return `{claim, source_id, quote_or_section, confidence}`

### 2.9 Approximate storage footprint (planning)

| Layer set | Global rough size | One region (e.g. Andes AOI) |
|-----------|-------------------|-----------------------------|
| DEM 90 m COG | 50–150 GB | 1–5 GB |
| DEM 30 m COG | 0.5–2 TB | 5–40 GB |
| WorldClim stack | 50–200 GB | <5 GB |
| ERA5 monthly climatology subset | 20–100 GB | 2–20 GB |
| Hydro vectors | 5–50 GB | <2 GB |
| Land cover 10 m global | hundreds of GB–TB | 5–30 GB |
| RAG docs + embeddings | 1–20 GB | same |

**Start with regional AOIs**, not the planet.

---

## 3. Mathematics & algorithms required

### 3.1 Geodesy & projections (non-negotiable)

- Reference ellipsoid WGS84; geodetic (φ, λ, h) ↔ ECEF
- Map projections: conformal (Mercator/UTM/Lambert conformal) vs equal-area (Albers, Lambert azimuthal)
- Always store EPSG / PROJJSON with every asset
- Never analyze distances/areas in Web Mercator (EPSG:3857) without care
- Datum transforms via PROJ pipeline when mixing sources

**Libraries:** PROJ, GDAL/OGR, `pyproj`, `rasterio`, `geopandas`.

### 3.2 DEM processing

- Mosaicking, seam lines, void filling
- Resampling: nearest (classes), bilinear/cubic (continuous)
- Terrain derivatives: slope, aspect, curvature, TPI, hillshade
- Vertical datum awareness (EGM96/EGM2008 geoid vs ellipsoid heights)

### 3.3 Hydrological routing

- Depression filling / breaching (Planchon–Darboux, Priority-Flood)
- Flow direction: D8, D∞ (Tarboton), MFD
- Flow accumulation → stream thresholding
- Watershed delineation; Strahler order
- Optional: hydraulic geometry for river width aesthetics (not physics-complete)

### 3.4 Climate & orographic precipitation

Minimum viable physics-informed model for T1:

1. Baseline precip field `P0(x)` from WorldClim/CHELSA  
2. Wind unit vector `û` from ERA5 climatology  
3. Terrain gradient `∇z` from DEM  
4. Upslope exposure `U = max(0, û · ∇z)`  
5. Fit: `P ≈ f(P0, U, z, latitude)` via GLM/GAM/gradient boosting  
6. Rain-shadow residual: leeward cells get depleted moisture after orographic dump along wind trajectories (trajectory or upwind-search approximation)

Advanced (T2):

- Linear theory of orographic precip (Smith)  
- WRF / regional climate model nests (expensive; usually out of scope)  
- Lapse-rate temperature adjustment `T(z) = T0 − Γ·Δz`

### 3.5 Biome classification

- Holdridge: biotemperature + precip + potential evapotranspiration ratio  
- Köppen–Geiger decision trees on monthly T/P  
- Validate WorldEngine biome names against these grids (confusion matrices)

### 3.6 Settlement suitability (learnable)

Start with explicit utility:

```
score = w1*water_access + w2*flatness + w3*climate_comfort
      + w4*soil/ag + w5*coast_port − w6*hazard − w7*protected
```

Then calibrate weights by predicting WorldPop/GHSL presence (logistic regression / XGBoost). Report ROC-AUC / PR-AUC on held-out regions.

### 3.7 Uncertainty & validation math

- Train/val/test by **spatial blocks** (not random pixels — prevents leakage)
- Metrics: RMSE/MAE for precip/temp; CSI/F1 for river presence; Kappa for biomes
- Bootstrap or quantile regression for uncertainty bands in the inspector
- Sensitivity analysis: which inputs move city scores most?

### 3.8 Cartographic generalization (for pretty + truthful maps)

- Douglas–Peucker / Visvalingam line simplification
- Topology-preserving generalization
- Contour generation from DEM
- Multi-scale LODs for zoom levels

---

## 4. Skills required (human + agent)

### 4.1 Human skills

| Skill | Why |
|-------|-----|
| GIS (QGIS) | Visual QA, quick reprojection, digitizing AOIs |
| Geodesy literacy | Stop silent CRS bugs |
| Climate data literacy | Units, normals vs weather, biases |
| Hydrology basics | Rivers that don’t climb hills |
| Cartographic design | Legible maps, not rainbow noise |
| Data engineering | Pipelines, catalogs, checksums, licenses |
| Applied ML | Calibrate orography & settlement models |
| Software architecture | Separate UI / compute / store / RAG |
| Scientific communication | Provenance in the inspector |
| License compliance | Redistribution constraints |

### 4.2 Agent / tooling skills (from repos you named)

Cloned under `vendor-skills/`:

| Repo | Role in Geoform |
|------|-----------------|
| [Jpisnice/shadcn-ui-mcp-server](https://github.com/Jpisnice/shadcn-ui-mcp-server) | MCP server for shadcn/ui v4 components/blocks when building ops dashboards & map chrome |
| [anthropics/skills](https://github.com/anthropics/skills) | Skill standard + `skill-creator`, `frontend-design`, `mcp-builder`, `docx/pdf/xlsx` for reports |
| [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Design-system generation & UX anti-pattern checks for the editor UI |
| [get-convex/agent-skills](https://github.com/get-convex/agent-skills) | Convex backend: schema, auth, backups/restore drills, agents, migrations |

**How to use them operationally:**

1. Install Convex skills when you add durable multi-device saves (`npx skills add get-convex/agent-skills`).  
2. Use `convex-backup` restore drills — a backup never restored is hope.  
3. Use `convex-design` / `convex-agent` for job queues (“ingest DEM”, “fit orography”).  
4. Point Cursor MCP at shadcn-ui-mcp-server when building dashboard UI.  
5. Use ui-ux-pro-max when redesigning the map editor (avoid AI purple slop; keep cartographic clarity).  
6. Use anthropic `skill-creator` to write a **custom Geoform skill** that encodes this report’s pipelines so agents don’t freestyle geography.

### 4.3 Custom Geoform skill you should create

Path suggestion: `.cursor/skills/geoform-geography/SKILL.md`

Must encode:

- Never invent climate numbers  
- Always require CRS + checksum in catalog  
- T1 vs T2 acceptance tests  
- Allowed datasets list + license notes  
- Recompute path: height edit → derived climate → suitability → persist

---

## 5. Storage & durability (“ensure it is there”)

### 5.1 Three data planes

| Plane | Contents | Store |
|-------|----------|-------|
| **A. Raw scientific** | Immutable downloads | Object storage (S3/R2/GCS/Backblaze) + local NAS |
| **B. Derived/analysis** | COGs, Zarr, model coeffs | Object storage + optional PostGIS |
| **C. Product state** | User worlds, cities, calibrations | Convex (recommended) + export JSON |

`localStorage` (current) is **only** a browser cache. It is not durability.

### 5.2 Canonical formats

- Rasters: **COG** (Cloud Optimized GeoTIFF) or **Zarr** for large ND arrays  
- Vectors: **GeoPackage** or GeoParquet  
- Tables: Parquet  
- Models: joblib/ONNX + JSON coefficient cards  
- Worlds: versioned JSON/MessagePack + schema version field  
- Docs: PDF/Markdown + embedding index (LanceDB/Chroma/pgvector)

### 5.3 Catalog schema (minimum)

Every asset row:

```yaml
id: copernicus-dem-glo90-andes-v1
title: Copernicus DEM GLO-90 Andes AOI
source_url: https://...
license: ...
downloaded_at: 2026-08-12
crs: EPSG:4326
bbox: [-82, -30, -65, 5]
resolution_m: 90
checksum_sha256: ...
bytes: ...
path: s3://geoform-raw/...
variables: [elevation]
vertical_datum: EGM2008
processing: raw
```

### 5.4 Durability policy (3-2-1)

- **3** copies  
- **2** different media/providers  
- **1** offsite  

Plus:

- Immutable `raw/` prefix (object-lock or write-once discipline)  
- Derived rebuildable from `raw + code + catalog revision`  
- Quarterly restore drill (see Convex backup skill pattern applied to object store too)  
- Checksums verified on download and before training  
- License ledger so you don’t ship illegal redistributions  

### 5.5 Convex-specific product storage

When you add Convex:

- Tables: `worlds`, `worldRevisions`, `cities`, `calibrationRuns`, `ingestJobs`, `users`  
- File storage for large world blobs if needed  
- Cron for export snapshots to user-owned S3  
- Run `convex-backup` restore drill before trusting anything  

### 5.6 What “saved” means in SLOs

| Object | RPO (max loss) | RTO (time to restore) |
|--------|----------------|------------------------|
| User world edit | ≤ 1 minute | ≤ 5 minutes |
| Calibration coeffs | ≤ 24 hours | ≤ 1 hour |
| Raw DEM archive | ≤ 1 week (re-downloadable) | ≤ 1 day |
| Catalog DB | ≤ 24 hours | ≤ 1 hour |

---

## 6. Fine-tuning & calibration loops (the real work)

### Loop A — Orographic precip

1. Pick AOI with known rain shadow (Andes, Cascades, Hawaii, New Zealand Alps)  
2. Ingest DEM + WorldClim/CHELSA precip + ERA5 wind  
3. Compute upslope exposure  
4. Fit model; hold out spatial blocks  
5. Export coefficients into Geoform recompute path  
6. UI test: raise ridge → leeward dries similarly to Earth residual patterns  
7. Log run in `calibrationRuns` with metrics  

### Loop B — Settlement

1. Build feature stack (water, slope, climate, LC, soils)  
2. Label with GHSL/WorldPop > threshold  
3. Train classifier; calibrate probability  
4. Replace hard-coded suitability weights  
5. Report false positive cities in deserts/peaks  

### Loop C — Biome agreement

1. Map WorldEngine biome strings ↔ Holdridge/Köppen  
2. Confusion matrix vs Earth classification  
3. Either relabel WE outputs or replace biome step with your classifier  

### Loop D — Hydrology aesthetics + truth

1. Compare extracted streams to HydroSHEDS  
2. Tune accumulation threshold / depression fill  
3. Ensure brush edits re-route rivers downhill only  

---

## 7. Engineering workstreams & sequencing

### Phase 0 — Foundations (1–2 weeks)

- [ ] Define AOI #1 and success metrics  
- [ ] Create `data/catalog.yaml` + folder layout  
- [ ] Object storage bucket + checksum tooling  
- [ ] Custom Geoform agent skill  
- [ ] Install Convex skills; decide auth model  

### Phase 1 — Ingest MVP (2–4 weeks)

- [ ] DEM COG for AOI  
- [ ] WorldClim precip/temp  
- [ ] ERA5 wind climatology  
- [ ] HydroSHEDS clip  
- [ ] WorldCover clip  
- [ ] QA notebook: hillshade, precip map, wind quiver  

### Phase 2 — Replace fantasy climate path (3–6 weeks)

- [ ] Fit orographic model  
- [ ] Swap `/api/recompute` climate step to calibrated model (keep WE plates optional)  
- [ ] Inspector shows residual error vs Earth normals when in “Earth compare” mode  
- [ ] Unit/regression tests on locked AOI fixtures  

### Phase 3 — Settlement & RAG (2–4 weeks)

- [ ] Train suitability model  
- [ ] Ingest manuals/papers into vector DB  
- [ ] Inspector citations  
- [ ] Convex persistence + export + restore drill  

### Phase 4 — Multi-region generalization (ongoing)

- [ ] AOI #2/#3 without refitting from scratch (transfer + fine-tune)  
- [ ] Uncertainty UI  
- [ ] License compliance audit  
- [ ] Performance: COG range reads, tiling, WebGL relief (optional)  

### Phase 5 — Productization

- [ ] shadcn ops dashboard (ingest jobs, calibration metrics) via shadcn MCP  
- [ ] ui-ux-pro-max pass on editor  
- [ ] Public docs; dataset cards; reproducibility script  

---

## 8. Acceptance tests (do not skip)

1. **CRS integrity:** every raster/vector has CRS; reprojection goldens  
2. **Hydrology:** no uphill rivers on fixtures  
3. **Rain shadow:** leeward precip decreases after synthetic ridge in calibrated regime  
4. **Settlement:** AUC ≥ agreed threshold on held-out Earth tiles  
5. **Provenance:** every inspector claim has source id  
6. **Restore drill:** wipe staging DB, restore, row counts match  
7. **License:** automated scan that redistributed assets are allowed  

---

## 9. Risks & traps

- **Spatial leakage** in ML (random pixel splits) → fake accuracy  
- **Web Mercator analysis** → distorted models  
- **Mixing ellipsoidal vs geoid heights** → wrong lapse/orography  
- **License violations** shipping Copernicus/OSM extracts incorrectly  
- **Global 30 m DEM** before you can pay for storage/compute  
- **Letting the LLM set precip** → scientific garbage  
- **Autosave-only** → user data loss  
- **One AOI overfit** → breaks on next continent  

---

## 10. Immediate next actions (this week)

1. Choose AOI #1 (recommend: western Andes strip or Cascades).  
2. Create cloud bucket + `data/catalog.yaml`.  
3. Download DEM + WorldClim for that AOI only.  
4. Add Convex (or defer Convex but start S3 + checksums now).  
5. Write `.cursor/skills/geoform-geography/SKILL.md` from this report.  
6. Use the canvas dashboard to track phase completion.  

---

## 11. Tooling install notes (repos you specified)

```bash
# Convex agent skills (when ready for backend)
npx skills add get-convex/agent-skills --all

# shadcn MCP (Cursor MCP settings)
npx @jpisnice/shadcn-ui-mcp-server --github-api-key <token>

# UI/UX Pro Max skill — follow vendor-skills/ui-ux-pro-max-skill README installer

# Anthropic skills marketplace / skill-creator for custom Geoform skill
# See vendor-skills/skills/README.md
```

Vendored clones live at `vendor-skills/` for offline reference (gitignored if you prefer; currently local only).

---

## 12. Bottom line

WorldEngine got you a **playable prior**. Accuracy requires:

1. **Terabytes-class discipline** even for regions (catalog, checksums, CRS).  
2. **Real math**: projections, DEM hydro, orographic fitting, spatial ML validation.  
3. **Real skills**: GIS + climate literacy + data eng + cartography.  
4. **Real storage**: object store + Convex (or equivalent) + restore drills — not `localStorage`.  
5. **Agent stack**: shadcn MCP + ui-ux skill + Convex skills + a custom geography skill so future you doesn’t undo the science.

The canvas dashboard visualizes phases, effort, datasets, and the do-next queue.
