#!/usr/bin/env node
/**
 * Track A fetch checklist / dry-run.
 * Real bulk DEM/climate downloads need account tokens + large storage;
 * this script documents and verifies the AOI layout instead of silently failing mid-mirror.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const dry = process.argv.includes('--dry-run') || !process.argv.includes('--fetch')
const root = process.cwd()
const catalogPath = join(root, 'data/catalog.yaml')

if (!existsSync(catalogPath)) {
  console.error('Missing data/catalog.yaml — run npm run aoi:init first')
  process.exit(1)
}

const catalog = readFileSync(catalogPath, 'utf8')
const aoi = 'cascades-rain-shadow'
const bbox = {
  west: -125.0,
  south: 43.5,
  east: -118.0,
  north: 49.0,
}

console.log(`AOI ${aoi}`)
console.log(`bbox ${bbox.west},${bbox.south} → ${bbox.east},${bbox.north}`)
console.log(dry ? 'mode: dry-run (no network downloads)' : 'mode: fetch')

const checklist = [
  {
    id: 'dem',
    path: `data/raw/${aoi}/dem`,
    how: 'Copernicus DEM GLO-90 via CDS / OpenTopography — clip to bbox, write Cloud Optimized GeoTIFF',
  },
  {
    id: 'worldclim',
    path: `data/raw/${aoi}/worldclim`,
    how: 'WorldClim 2.1 precip + tavg GeoTIFFs — clip to bbox',
  },
  {
    id: 'era5',
    path: `data/raw/${aoi}/era5`,
    how: 'ERA5 monthly u/v wind climatology — aggregate prevailing direction over AOI',
  },
  {
    id: 'hydro',
    path: `data/raw/${aoi}/hydro`,
    how: 'HydroSHEDS/MERIT rivers vector or raster clipped to bbox',
  },
]

let missing = 0
for (const item of checklist) {
  const abs = join(root, item.path)
  const files = existsSync(abs) ? readdirSync(abs).filter((f) => f !== '.gitkeep') : []
  const ok = files.length > 0
  if (!ok) missing++
  console.log(`${ok ? '✓' : '○'} ${item.id.padEnd(10)} ${item.path}`)
  console.log(`    ${item.how}`)
  if (!dry && !ok) {
    console.log('    (live fetch not configured in this environment — add credentials + URL mirror next)')
  }
}

console.log(`\ncatalog bytes: ${catalog.length}`)
console.log(missing === 0 ? 'All raw slots have files.' : `${missing} raw slots still empty — expected for Phase 0.`)
process.exit(0)
