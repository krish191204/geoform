#!/usr/bin/env node
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const root = process.cwd()
const aoi = 'cascades-rain-shadow'
const dirs = [
  `data/raw/${aoi}/dem`,
  `data/raw/${aoi}/worldclim`,
  `data/raw/${aoi}/era5`,
  `data/raw/${aoi}/hydro`,
  `data/staging/${aoi}`,
  `data/derived/${aoi}`,
  `data/qa/${aoi}`,
]

for (const d of dirs) {
  const p = join(root, d)
  mkdirSync(p, { recursive: true })
  const keep = join(p, '.gitkeep')
  if (!existsSync(keep)) writeFileSync(keep, '')
}

console.log(`AOI folders ready for ${aoi}`)
console.log('Next:')
console.log('  1. Open data/catalog.yaml — Cascades bbox is defined')
console.log('  2. Download Copernicus DEM GLO-90 + WorldClim for that bbox into data/raw/…')
console.log('  3. npm run aoi:fetch -- --dry-run  (prints exact fetch checklist)')
console.log('  4. Keep fantasy map art out of data/raw — that is Track B only')
