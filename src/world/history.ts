import type { City, World } from './types'
import { cloneCities, cloneElev, clonePlateId } from './tools'

export interface HistoryEntry {
  elev: Float32Array
  plateId: Int16Array
  plateCount: number
  cities: City[]
  label: string
}

const MAX = 40

export class EditHistory {
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []

  clear(): void {
    this.undoStack = []
    this.redoStack = []
  }

  push(world: World, label: string): void {
    this.undoStack.push({
      elev: cloneElev(world.elev),
      plateId: clonePlateId(world.plateId),
      plateCount: world.plateCount,
      cities: cloneCities(world.cities),
      label,
    })
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
    this.redoStack.push({
      elev: cloneElev(world.elev),
      plateId: clonePlateId(world.plateId),
      plateCount: world.plateCount,
      cities: cloneCities(world.cities),
      label: entry.label,
    })
    world.elev.set(entry.elev)
    world.plateId.set(entry.plateId)
    world.plateCount = entry.plateCount
    world.cities = cloneCities(entry.cities)
    return entry.label
  }

  redo(world: World): string | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push({
      elev: cloneElev(world.elev),
      plateId: clonePlateId(world.plateId),
      plateCount: world.plateCount,
      cities: cloneCities(world.cities),
      label: entry.label,
    })
    world.elev.set(entry.elev)
    world.plateId.set(entry.plateId)
    world.plateCount = entry.plateCount
    world.cities = cloneCities(entry.cities)
    return entry.label
  }
}
