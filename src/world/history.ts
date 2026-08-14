/**
 * Undo / redo.
 *
 * Before a brush stroke we push a snapshot (copy of height, plates, cities,
 * size, land settings). Undo restores that snapshot. Redo is the opposite stack.
 *
 * Size is in the snapshot because zoom-out changes width/height. Restoring
 * an old stroke must put the old arrays back, not write into the new size.
 *
 * MAX = 40 strokes. Older ones fall off the front.
 */
import type { City, TradeRoute, World } from './types'
import { cloneCities, cloneElev, clonePlateId, ensureDerived } from './tools'

export interface HistoryEntry {
  elev: Float32Array
  plateId: Int16Array
  plateCount: number
  plateVx: Float32Array
  plateVy: Float32Array
  cities: City[]
  tradeRoutes: TradeRoute[]
  width: number
  height: number
  originX: number
  originY: number
  latRows: number
  seaLevel: number
  landRatio: number
  continentMass: World['continentMass']
  rawSeaThreshold: number
  label: string
}

const MAX = 40

/** Photograph the world as it is now. */
function snapshot(world: World, label: string): HistoryEntry {
  return {
    elev: cloneElev(world.elev),
    plateId: clonePlateId(world.plateId),
    plateCount: world.plateCount,
    plateVx: new Float32Array(world.plateVx),
    plateVy: new Float32Array(world.plateVy),
    cities: cloneCities(world.cities),
    tradeRoutes: (world.tradeRoutes ?? []).map((r) => ({
      ...r,
      waypoints: r.waypoints.map((p) => ({ ...p })),
    })),
    width: world.width,
    height: world.height,
    originX: world.originX,
    originY: world.originY,
    latRows: world.latRows,
    seaLevel: world.seaLevel,
    landRatio: world.landRatio,
    continentMass: world.continentMass,
    rawSeaThreshold: world.rawSeaThreshold,
    label,
  }
}

/** Copy a snapshot back onto the live world. */
function restore(world: World, entry: HistoryEntry): void {
  world.width = entry.width
  world.height = entry.height
  world.originX = entry.originX
  world.originY = entry.originY
  world.latRows = entry.latRows
  world.seaLevel = entry.seaLevel
  world.landRatio = entry.landRatio
  world.continentMass = entry.continentMass
  world.rawSeaThreshold = entry.rawSeaThreshold
  world.elev = cloneElev(entry.elev)
  world.plateId = clonePlateId(entry.plateId)
  world.plateCount = entry.plateCount
  world.plateVx = new Float32Array(entry.plateVx)
  world.plateVy = new Float32Array(entry.plateVy)
  world.cities = cloneCities(entry.cities)
  world.tradeRoutes = (entry.tradeRoutes ?? []).map((r) => ({
    ...r,
    waypoints: r.waypoints.map((p) => ({ ...p })),
  }))
  ensureDerived(world)
}

export class EditHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  /** Call this BEFORE you change the world. label is what the UI shows ("Raise", etc). */
  push(world: World, label: string): void {
    this.undoStack.push(snapshot(world, label))
    if (this.undoStack.length > MAX) this.undoStack.shift()
    this.redoStack = []
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Drop the last push without restoring — used when an edit failed. */
  cancelLast(): void {
    this.undoStack.pop()
  }

  undo(world: World): string | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push(snapshot(world, entry.label))
    restore(world, entry)
    return entry.label
  }

  redo(world: World): string | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push(snapshot(world, entry.label))
    restore(world, entry)
    return entry.label
  }
}
