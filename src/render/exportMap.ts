import { bakeWorldImageDataSmooth, type MapLook } from './draw'
import { exportDimensions, type ExportResolution } from '../world/quality'
import type { World } from '../world/types'

function imageDataToBlob(image: ImageData): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return Promise.reject(new Error('Canvas unavailable'))
  ctx.putImageData(image, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('PNG export failed'))
    }, 'image/png')
  })
}

/** Bake and download a high-resolution map PNG (2K or 4K). */
export async function downloadMapPng(
  world: World,
  look: MapLook,
  resolution: ExportResolution,
  filename?: string,
): Promise<void> {
  const { width, height } = exportDimensions(world.width, world.height, resolution)
  const image = bakeWorldImageDataSmooth(world, look, width, height)
  const blob = await imageDataToBlob(image)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download =
    filename ??
    `geoform-${world.seed}-${look}-${resolution}-${world.width}x${world.height}.png`
  a.click()
  URL.revokeObjectURL(url)
}
