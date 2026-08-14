/**
 * 3D globe view. Same World arrays, wrapped onto a sphere with Three.js.
 * Color, normal, bump, displacement, and roughness textures are baked from draw.ts.
 */
import * as THREE from 'three'
import {
  bakeBumpImageData,
  bakeDisplacementImageData,
  bakeNormalImageData,
  bakeRoughnessImageData,
  bakeWorldImageDataSmooth,
  type MapLook,
} from './draw'
import { globeBakeForWorld, QUALITY_PRESETS, type QualityPreset } from '../world/quality'
import type { World } from '../world/types'

function imageDataToTexture(
  image: ImageData,
  renderer: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')!
  ctx.putImageData(image, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.SRGBColorSpace
  const maxAniso = renderer.capabilities.getMaxAnisotropy()
  tex.anisotropy = Math.min(16, maxAniso)
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.generateMipmaps = true
  tex.needsUpdate = true
  return tex
}

export class PlanetView {
  readonly canvas: HTMLCanvasElement
  private renderer: THREE.WebGLRenderer
  private scene: THREE.Scene
  private camera: THREE.PerspectiveCamera
  private globe: THREE.Mesh
  private atmosphere: THREE.Mesh
  private sun: THREE.DirectionalLight
  private fill: THREE.DirectionalLight
  private colorTex: THREE.CanvasTexture | null = null
  private bumpTex: THREE.CanvasTexture | null = null
  private normalTex: THREE.CanvasTexture | null = null
  private dispTex: THREE.CanvasTexture | null = null
  private roughTex: THREE.CanvasTexture | null = null
  private qualityKey = ''
  private yaw = 0.85
  private pitch = 0.22
  private distance = 3.15
  private dragging = false
  private lastX = 0
  private lastY = 0
  private cacheKey = ''

  constructor(canvas: HTMLCanvasElement, preset = QUALITY_PRESETS.hd) {
    this.canvas = canvas
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
    })
    this.renderer.setClearColor(0x000000, 0)
    this.renderer.setPixelRatio(Math.min(2.5, window.devicePixelRatio || 1))
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(32, 1, 0.1, 40)

    this.globe = new THREE.Mesh(
      this.makeGlobeGeometry(preset),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.82,
        metalness: 0.03,
      }),
    )
    this.scene.add(this.globe)

    this.atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(1.045, 72, 54),
      new THREE.MeshBasicMaterial({
        color: 0x8ec8e8,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    )
    this.scene.add(this.atmosphere)

    const ambient = new THREE.AmbientLight(0x9ab0c8, 0.48)
    this.scene.add(ambient)
    this.sun = new THREE.DirectionalLight(0xfff6e8, 1.45)
    this.scene.add(this.sun)
    this.fill = new THREE.DirectionalLight(0x88a8d0, 0.35)
    this.fill.position.set(-2.2, 0.4, -1.6)
    this.scene.add(this.fill)

    const stars = this.makeStars()
    this.scene.add(stars)

    this.qualityKey = preset.id
    this.layout()
    this.applyCamera()
  }

  private makeGlobeGeometry(preset: QualityPreset): THREE.SphereGeometry {
    return new THREE.SphereGeometry(1, preset.globeWidthSegments, preset.globeHeightSegments)
  }

  setQuality(preset: QualityPreset): void {
    if (preset.id === this.qualityKey) return
    this.qualityKey = preset.id
    this.cacheKey = ''
    const oldGeo = this.globe.geometry
    this.globe.geometry = this.makeGlobeGeometry(preset)
    oldGeo.dispose()
  }

  private makeStars(): THREE.Points {
    const n = 600
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const u = Math.random() * 2 - 1
      const t = Math.random() * Math.PI * 2
      const r = 8 + Math.random() * 10
      const s = Math.sqrt(Math.max(0, 1 - u * u))
      pos[i * 3] = r * s * Math.cos(t)
      pos[i * 3 + 1] = r * u
      pos[i * 3 + 2] = r * s * Math.sin(t)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return new THREE.Points(
      g,
      new THREE.PointsMaterial({ color: 0xdde7f4, size: 0.035, sizeAttenuation: true }),
    )
  }

  layout(): void {
    const parent = this.canvas.parentElement
    const w = Math.max(1, parent?.clientWidth ?? this.canvas.clientWidth)
    const h = Math.max(1, parent?.clientHeight ?? this.canvas.clientHeight)
    this.renderer.setSize(w, h, false)
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
  }

  setLook(look: MapLook): void {
    this.cacheKey = `stale:${look}`
  }

  sync(world: World, look: MapLook, dirtyKey: string, preset = QUALITY_PRESETS.hd): void {
    this.setQuality(preset)
    const bake = globeBakeForWorld(world.width, preset)
    const texW = world.width * bake
    const texH = world.height * bake
    const key = `${dirtyKey}|${look}|${world.width}x${world.height}|${preset.id}|${bake}|${texW}x${texH}`
    if (key === this.cacheKey && this.colorTex) return
    this.cacheKey = key
    this.colorTex?.dispose()
    this.bumpTex?.dispose()
    this.normalTex?.dispose()
    this.dispTex?.dispose()
    this.roughTex?.dispose()

    this.colorTex = imageDataToTexture(
      bakeWorldImageDataSmooth(world, look, texW, texH),
      this.renderer,
    )
    this.bumpTex = imageDataToTexture(bakeBumpImageData(world, bake), this.renderer)
    this.normalTex = imageDataToTexture(bakeNormalImageData(world, bake), this.renderer)
    this.dispTex = imageDataToTexture(bakeDisplacementImageData(world, bake), this.renderer)
    this.roughTex = imageDataToTexture(bakeRoughnessImageData(world, bake), this.renderer)

    const night = look === 'night'
    const mat = this.globe.material as THREE.MeshStandardMaterial
    mat.map = this.colorTex
    mat.bumpMap = night ? null : this.bumpTex
    mat.bumpScale = night ? 0.02 : 0.055
    mat.normalMap = night ? null : this.normalTex
    mat.normalScale = new THREE.Vector2(1.2, 1.2)
    mat.displacementMap = night ? null : this.dispTex
    mat.displacementScale = night ? preset.displacementScale * 0.45 : preset.displacementScale
    mat.roughnessMap = night ? null : this.roughTex
    mat.roughness = night ? 0.95 : 1
    mat.metalness = night ? 0 : 0.04
    mat.emissive = new THREE.Color(night ? 0x1a1408 : 0x000000)
    mat.emissiveMap = night ? this.colorTex : null
    mat.emissiveIntensity = night ? 1.25 : 0
    mat.needsUpdate = true
    this.atmosphere.visible = true
    ;(this.atmosphere.material as THREE.MeshBasicMaterial).opacity = night ? 0.08 : 0.16
    this.sun.intensity = night ? 0.28 : 1.45
    this.fill.intensity = night ? 0.12 : 0.35
  }

  orbit(dx: number, dy: number): void {
    this.yaw -= dx * 0.0055
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch + dy * 0.0045))
    this.applyCamera()
  }

  dolly(factor: number): void {
    this.distance = Math.max(1.45, Math.min(6.2, this.distance * factor))
    this.applyCamera()
  }

  reset(): void {
    this.yaw = 0.85
    this.pitch = 0.22
    this.distance = 3.15
    this.applyCamera()
  }

  private applyCamera(): void {
    const cp = Math.cos(this.pitch)
    this.camera.position.set(
      this.distance * cp * Math.sin(this.yaw),
      this.distance * Math.sin(this.pitch),
      this.distance * cp * Math.cos(this.yaw),
    )
    this.camera.lookAt(0, 0, 0)
    this.sun.position.copy(this.camera.position).add(new THREE.Vector3(1.4, 0.8, 0.6))
  }

  pick(clientX: number, clientY: number, world: World): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect()
    if (rect.width < 1 || rect.height < 1) return null
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    )
    const ray = new THREE.Raycaster()
    ray.setFromCamera(ndc, this.camera)
    const hits = ray.intersectObject(this.globe)
    const hit = hits[0]
    if (!hit?.uv) return null
    const x = Math.min(world.width - 1, Math.max(0, Math.floor(hit.uv.x * world.width)))
    const y = Math.min(world.height - 1, Math.max(0, Math.floor((1 - hit.uv.y) * world.height)))
    return { x, y }
  }

  onPointerDown(clientX: number, clientY: number): void {
    this.dragging = true
    this.lastX = clientX
    this.lastY = clientY
  }

  onPointerMove(clientX: number, clientY: number): boolean {
    if (!this.dragging) return false
    this.orbit(clientX - this.lastX, clientY - this.lastY)
    this.lastX = clientX
    this.lastY = clientY
    return true
  }

  onPointerUp(): void {
    this.dragging = false
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  dispose(): void {
    this.colorTex?.dispose()
    this.bumpTex?.dispose()
    this.normalTex?.dispose()
    this.dispTex?.dispose()
    this.roughTex?.dispose()
    this.renderer.dispose()
  }
}
