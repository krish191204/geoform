import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAllSamples, type SampleMap } from '../src/critique/sampleMaps.ts'
import type { CritiqueFixtureExpect } from '../tests/critique/fixtureSchema.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../tests/critique/fixtures')
const publicDir = join(__dirname, '../public/critique-fixtures')

function crc32(buf: Uint8Array): number {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
  }
  return ~c >>> 0
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([typeBuf, Buffer.from(data)])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([len, body, crc])
}

export function encodePng(width: number, height: number, rgba: Uint8ClampedArray): Buffer {
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (stride + 1) + 1)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', new Uint8Array(0))])
}

const EXPECT: Record<string, CritiqueFixtureExpect> = {
  'broken-desert-jungle': {
    id: 'broken-desert-jungle',
    description: 'Synthetic: desert glued to jungle with no orographic barrier',
    corpus: 'synthetic',
    mode: 'painted',
    mustFind: [{ kind: 'orography', titleIncludes: 'Desert kisses' }],
    score: { max: 85 },
  },
  'broken-river-ridge': {
    id: 'broken-river-ridge',
    description: 'Synthetic: river stroke cresting bright ridge peaks',
    corpus: 'synthetic',
    mode: 'painted',
    mustFind: [{ kind: 'hydro' }],
    score: { max: 90 },
  },
  'broken-stranded-rivers': {
    id: 'broken-stranded-rivers',
    description: 'Synthetic: inland streams that never reach water',
    corpus: 'synthetic',
    mode: 'painted',
    mustFind: [{ kind: 'hydro', titleIncludes: 'nowhere' }],
    score: { max: 95 },
  },
  'broken-hot-peaks': {
    id: 'broken-hot-peaks',
    description: 'Synthetic: warm-colored highlands (lapse-looking wrong in paint)',
    corpus: 'synthetic',
    mode: 'painted',
    mustFind: [],
    score: { max: 100 },
  },
  'broken-pepper-peaks': {
    id: 'broken-pepper-peaks',
    description: 'Synthetic: isolated pinnacles instead of mountain belts',
    corpus: 'synthetic',
    mode: 'painted',
    mustFind: [{ kind: 'tectonic', titleIncludes: 'Pepper' }],
    score: { max: 95 },
  },
  'cascades-rain-shadow': {
    id: 'cascades-rain-shadow',
    description: 'Earth-pattern Cascades-like wet west / dry east',
    corpus: 'earth-pattern',
    mode: 'painted',
    mustFind: [],
    mustNotFind: [
      { titleIncludes: 'Rain shadow probably flipped' },
      { titleIncludes: 'Desert kisses jungle' },
    ],
    score: { min: 45 },
  },
  'andes-rain-shadow': {
    id: 'andes-rain-shadow',
    description: 'Earth-pattern Andes-like dry west coast / high crest / greener east',
    corpus: 'earth-pattern',
    mode: 'painted',
    mustFind: [],
    mustNotFind: [{ titleIncludes: 'Desert kisses jungle' }],
    score: { min: 40 },
  },
  'fantasy-owned-coherent': {
    id: 'fantasy-owned-coherent',
    description: 'Self-drawn coherent fantasy continent',
    corpus: 'fantasy-owned',
    mode: 'painted',
    mustFind: [],
    mustNotFind: [{ titleIncludes: 'Desert kisses jungle' }],
    score: { min: 40 },
  },
  'fantasy-owned-broken': {
    id: 'fantasy-owned-broken',
    description: 'Self-drawn broken fantasy with flipped shadow / uphill stream',
    corpus: 'fantasy-owned',
    mode: 'painted',
    mustFind: [{ kind: 'orography' }],
    score: { max: 95 },
  },
}

function writeFixture(sample: SampleMap) {
  const expect = EXPECT[sample.id]
  if (!expect) throw new Error(`No expect sidecar for ${sample.id}`)
  mkdirSync(outDir, { recursive: true })
  mkdirSync(publicDir, { recursive: true })
  const png = encodePng(sample.width, sample.height, sample.data)
  writeFileSync(join(outDir, `${sample.id}.png`), png)
  writeFileSync(join(outDir, `${sample.id}.json`), JSON.stringify(expect, null, 2) + '\n')
  writeFileSync(join(publicDir, `${sample.id}.png`), png)
  writeFileSync(
    join(publicDir, `${sample.id}.json`),
    JSON.stringify(
      {
        ...expect,
        title: sample.title,
        blurb: sample.blurb,
      },
      null,
      2,
    ) + '\n',
  )
  console.log(`wrote ${sample.id}.png (${sample.width}×${sample.height})`)
}

const index = getAllSamples().map((s) => {
  writeFixture(s)
  return { id: s.id, title: s.title, blurb: s.blurb, corpus: s.corpus }
})
writeFileSync(join(publicDir, 'index.json'), JSON.stringify(index, null, 2) + '\n')
console.log(`index: ${index.length} fixtures`)
