/**
 * Copy for the roadmap page.
 * SHIPPED = already in the editor (local atlas, full continents, silent repair).
 * STAGES / PHASES = future work. Do not confuse a wish with a feature.
 */
export type StageId =
  | 'ingest'
  | 'stage'
  | 'derive'
  | 'calibrate'
  | 'runtime'
  | 'explain'
  | 'endure'

export interface Stage {
  id: StageId
  num: string
  title: string
  oneLiner: string
  feel: string
  does: string[]
  avoids: string
}

export const SHIPPED = [
  {
    title: 'Local atlas',
    detail:
      'New world, paint, and zoom-out run in the browser. WorldEngine is optional. Climate, rivers, and biomes rebuild from the heightfield.',
  },
  {
    title: 'Full continents',
    detail:
      'Landmass mode keeps a few large masses even at 22% land. Island world is the speckle look — only if you ask for it.',
  },
  {
    title: 'Silent repair',
    detail:
      'The editor carves ocean, chews rectangular coasts, drowns pimples, drains rivers, and moves drowned cities. It does not nag.',
  },
  {
    title: 'Labs + critique',
    detail:
      'Labs teach one rule at a time, including continent clumping. Critique grades fixtures and Geoform JSON; Repair runs the same harmonize the editor uses.',
  },
]

export const STAGES: Stage[] = [
  {
    id: 'ingest',
    num: '01',
    title: 'Raw ingest',
    oneLiner: 'Collect Earth truth. Don’t invent it.',
    feel: 'You’re stocking a warehouse of measurements — elevation, rain, wind, rivers — each with a receipt (URL, license, checksum).',
    does: [
      'Download DEM, climate, hydro, land cover for one region (AOI)',
      'Write catalog rows: CRS, bbox, checksum, license',
      'Park files in immutable raw/ storage',
    ],
    avoids: 'Skipping checksums or mixing mystery files with no CRS.',
  },
  {
    id: 'stage',
    num: '02',
    title: 'Staging',
    oneLiner: 'Cut and align so every layer speaks the same language.',
    feel: 'Same map frame, same units, same nodata rules — so rain and mountains can be compared pixel-to-pixel.',
    does: [
      'Clip to AOI, reproject to a shared CRS',
      'Build Cloud Optimized GeoTIFFs',
      'QA: hillshade + precip map sanity check',
    ],
    avoids: 'Analyzing distances in Web Mercator without thinking.',
  },
  {
    id: 'derive',
    num: '03',
    title: 'Derivatives',
    oneLiner: 'Turn height into slope, wind lift, and river paths.',
    feel: 'The DEM stops being a picture and becomes physics ingredients.',
    does: [
      'Slope / aspect / hillshade',
      'Flow direction + accumulation (rivers)',
      'Upslope exposure: wind · terrain gradient',
    ],
    avoids: 'Pretty hillshade without hydrology that actually drains downhill.',
  },
  {
    id: 'calibrate',
    num: '04',
    title: 'Calibration',
    oneLiner: 'Fit “raise a ridge → lee side dries” to Earth data.',
    feel: 'This is the fine-tuning: teach the model how real mountains steal rain.',
    does: [
      'Fit precip ~ f(baseline, upslope lift, elevation, latitude)',
      'Hold out spatial blocks (no cheating with nearby pixels)',
      'Export coefficient cards the runtime can load',
    ],
    avoids: 'Random pixel train/test splits (spatial leakage).',
  },
  {
    id: 'runtime',
    num: '05',
    title: 'Runtime recompute',
    oneLiner: 'Your brush edits height; climate, rivers, and biomes rewrite in the browser.',
    feel: 'Geoform already does this locally. Calibration later swaps the toy lapse/orography for Earth-fitted coefficients.',
    does: [
      'Height edit → calibrated climate / hydro / biomes',
      'Settlement score from learned or explicit utility',
      'Versioned world revision saved',
    ],
    avoids: 'Letting an LLM invent precipitation numbers.',
  },
  {
    id: 'explain',
    num: '06',
    title: 'Explain (RAG)',
    oneLiner: 'Answers come with receipts from manuals and papers.',
    feel: 'The inspector doesn’t bluff — it cites WorldClim docs, DEM manuals, method papers.',
    does: [
      'Embed dataset manuals + method papers',
      'Return claim + source + quote + confidence',
      'Keep documents separate from numeric grids',
    ],
    avoids: 'Stuffing DEM pixels into the chat context.',
  },
  {
    id: 'endure',
    num: '07',
    title: 'Durability',
    oneLiner: 'If the laptop dies, the world still exists.',
    feel: 'Autosave in the browser is a sticky note. This stage is the vault.',
    does: [
      'Object store for raw/derived; Convex (or equiv) for worlds',
      '3-2-1 copies; checksums on readback',
      'Restore drill: wipe staging, restore, prove row counts',
    ],
    avoids: 'Trusting a backup you have never restored.',
  },
]

export interface DatasetCard {
  id: string
  domain: string
  name: string
  why: string
  priority: 'P0' | 'P1' | 'P2'
  when: string
}

export const DATASETS: DatasetCard[] = [
  {
    id: 'dem',
    domain: 'Height',
    name: 'Copernicus DEM',
    why: 'The ground truth for mountains and valleys your brush will edit against.',
    priority: 'P0',
    when: 'Week 1 — without this nothing else locks to Earth.',
  },
  {
    id: 'worldclim',
    domain: 'Climate',
    name: 'WorldClim normals',
    why: 'Long-term rain and heat maps used to train the rain-shadow response.',
    priority: 'P0',
    when: 'Week 1 with the DEM.',
  },
  {
    id: 'era5',
    domain: 'Wind',
    name: 'ERA5 wind climatology',
    why: 'Tells you which way the wind usually blows — windward vs leeward.',
    priority: 'P0',
    when: 'Right after WorldClim.',
  },
  {
    id: 'hydro',
    domain: 'Water',
    name: 'HydroSHEDS / MERIT',
    why: 'Real river networks to judge whether your flow model is sane.',
    priority: 'P0',
    when: 'Early ingest — settlement needs water access.',
  },
  {
    id: 'cover',
    domain: 'Cover',
    name: 'ESA WorldCover',
    why: 'Forests, deserts, ice — checks biome labels against reality.',
    priority: 'P1',
    when: 'After climate stack exists.',
  },
  {
    id: 'pop',
    domain: 'People',
    name: 'WorldPop / GHSL',
    why: 'Where humans actually built — ground truth for city rules.',
    priority: 'P2',
    when: 'When you train settlement scoring.',
  },
]

export const PHASES = [
  {
    id: 'p0',
    title: 'Foundations',
    weeks: '1–2 weeks',
    blurb: 'Done in the local atlas: continents, climate-from-height, silent repair. Catalog and storage next.',
  },
  {
    id: 'p1',
    title: 'Ingest MVP',
    weeks: '2–4 weeks',
    blurb: 'DEM + climate + wind + rivers for one region, with QA maps.',
  },
  {
    id: 'p2',
    title: 'Calibrated climate',
    weeks: '3–6 weeks',
    blurb: 'Fit orography; wire Geoform recompute to coefficients.',
  },
  {
    id: 'p3',
    title: 'Settlement + RAG',
    weeks: '2–4 weeks',
    blurb: 'Learn city scores; cite manuals; durable saves.',
  },
  {
    id: 'p4',
    title: 'Multi-region',
    weeks: 'ongoing',
    blurb: 'Transfer to AOI #2/#3; show uncertainty; license audit.',
  },
  {
    id: 'p5',
    title: 'Productize',
    weeks: 'later',
    blurb: 'Ops dashboard, UX pass, public dataset cards.',
  },
]

export const WEEK_TASKS = [
  { id: 'play', label: 'New world on Full continents; zoom out; paint a coast — confirm it stays a continent' },
  { id: 'labs', label: 'Walk Labs 01–06 (elevation → continents)' },
  { id: 'critique', label: 'Grade the Geoform worlds gallery; repair the stamped rectangle' },
  { id: 'aoi', label: 'Pick first AOI (Andes / Cascades / Hawaiʻi)' },
  { id: 'bucket', label: 'Create object-store bucket + data/catalog.yaml' },
  { id: 'dem', label: 'Download DEM + WorldClim for that AOI; checksum' },
  { id: 'skill', label: 'Keep skills/geoform-geography/SKILL.md in sync with the atlas' },
]
