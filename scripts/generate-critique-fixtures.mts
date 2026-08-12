import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  sampleBrokenDesertJungle,
  sampleBrokenRiverRidge,
  sampleBrokenStrandedRivers,
  sampleCascadesRainShadow,
  type SampleMap,
} from '../src/critique/sampleMaps.ts'
import type { CritiqueFixtureExpect } from '../tests/critique/fixtureSchema.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../tests/critique/fixtures')

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

/** Unfiltered RGBA → PNG */
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
  ihdr[9] = 6 // RGBA
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ])
}

function writeFixture(sample: SampleMap, expect: CritiqueFixtureExpect) {
  mkdirSync(outDir, { recursive: true })
  const png = encodePng(sample.width, sample.height, sample.data)
  writeFileSync(join(outDir, `${sample.id}.png`), png)
  writeFileSync(join(outDir, `${sample.id}.json`), JSON.stringify(expect, null, 2) + '\n')
  console.log(`wrote ${sample.id}.png (${sample.width}×${sample.height})`)
}

const fixtures: Array<{ sample: SampleMap; expect: CritiqueFixtureExpect }> = [
  {
    sample: sampleBrokenDesertJungle(),
    expect: {
      id: 'broken-desert-jungle',
      description: 'Synthetic: desert glued to jungle with no orographic barrier',
      corpus: 'synthetic',
      mode: 'painted',
      mustFind: [{ kind: 'orography', titleIncludes: 'Desert kisses' }],
      score: { max: 85 },
    },
  },
  {
    sample: sampleBrokenRiverRidge(),
    expect: {
      id: 'broken-river-ridge',
      description: 'Synthetic: river stroke cresting bright ridge peaks',
      corpus: 'synthetic',
      mode: 'painted',
      mustFind: [{ kind: 'hydro' }],
      score: { max: 90 },
    },
  },
  {
    sample: sampleBrokenStrandedRivers(),
    expect: {
      id: 'broken-stranded-rivers',
      description: 'Synthetic: inland streams that never reach water',
      corpus: 'synthetic',
      mode: 'painted',
      mustFind: [{ kind: 'hydro', titleIncludes: 'nowhere' }],
      score: { max: 90 },
    },
  },
  {
    sample: sampleCascadesRainShadow(),
    expect: {
      id: 'cascades-rain-shadow',
      description:
        'Earth-pattern (Cascades-like): wet Pacific west, N–S crest, dry inland east — not a copyrighted basemap screenshot',
      corpus: 'earth-pattern',
      mode: 'painted',
      mustFind: [],
      mustNotFind: [
        { titleIncludes: 'Rain shadow probably flipped' },
        { titleIncludes: 'Desert kisses jungle' },
      ],
      score: { min: 45 },
    },
  },
]

for (const f of fixtures) writeFixture(f.sample, f.expect)
