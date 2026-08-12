import type { City, World } from './types'
import { cloneCities, cloneElev } from './tools'

export interface HistoryEntry {
  elev: Float32Array
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

  undo(world: World): string | null {
    const entry = this.undoStack.pop()
    if (!entry) return null
    this.redoStack.push({
      elev: cloneElev(world.elev),
      cities: cloneCities(world.cities),
      label: entry.label,
    })
    world.elev.set(entry.elev)
    world.cities = cloneCities(entry.cities)
    return entry.label
  }

  redo(world: World): string | null {
    const entry = this.redoStack.pop()
    if (!entry) return null
    this.undoStack.push({
      elev: cloneElev(world.elev),
      cities: cloneCities(world.cities),
      label: entry.label,
    })
    world.elev.set(entry.elev)
    world.cities = cloneCities(entry.cities)
    return entry.label
  }
}
