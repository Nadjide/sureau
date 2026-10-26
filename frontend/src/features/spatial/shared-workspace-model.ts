import type { LocalLocations } from './local-locations'
import { parseWorkspace, workspaceHistoryLimit, type WorkspaceDocument } from './workspace-document'
import { msg, t } from '@/lib/i18n'

export interface SpatialDraft {
  readonly workspace: WorkspaceDocument
  readonly locations: LocalLocations
}

export interface SpatialHistory {
  readonly past: readonly SpatialDraft[]
  readonly present: SpatialDraft
  readonly future: readonly SpatialDraft[]
}

export const spatialLocationLimit = 20_000
export const spatialHistoryLimit = workspaceHistoryLimit

const workstationId = /^desk-[a-z0-9-]{2,80}$/
const invalidDraftMessage = msg('Cet espace de travail ou ses localisations sont invalides. Aucun changement n’a été appliqué.')

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function parseLocations(value: unknown): LocalLocations {
  if (!isRecord(value)) throw new Error(t(invalidDraftMessage))
  const keys = Reflect.ownKeys(value)
  if (keys.length > spatialLocationLimit) throw new Error(t('La limite de 20 000 localisations est dépassée.'))

  const entries: [number, string][] = []
  for (const key of keys) {
    if (typeof key !== 'string') throw new Error(t(invalidDraftMessage))
    const assetId = Number(key)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!Number.isSafeInteger(assetId) || assetId <= 0 || String(assetId) !== key
      || !descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')
      || typeof descriptor.value !== 'string' || !workstationId.test(descriptor.value)) {
      throw new Error(t(invalidDraftMessage))
    }
    entries.push([assetId, descriptor.value])
  }

  // PostgreSQL JSONB does not retain the insertion order of object properties.
  entries.sort(([first], [second]) => first - second)
  return Object.freeze(Object.fromEntries(entries))
}

function isDatabaseText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code === 0) return false
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false
      index++
    } else if (code >= 0xdc00 && code <= 0xdfff) return false
  }
  return true
}

function validateNames(workspace: WorkspaceDocument): void {
  const names = [workspace.name, ...workspace.floors.map((floor) => floor.name)]
  for (const room of workspace.rooms) {
    names.push(room.plan.name, ...room.plan.workstations.map((station) => station.label),
      ...room.plan.furniture.map((item) => item.label))
  }
  if (!names.every(isDatabaseText)) throw new Error(t('Un nom contient un caractère incompatible avec la base de données.'))
}

/** Validate and detach a complete atomic snapshot, preserving unresolved associations. */
export function parseSpatialDraft(value: unknown): SpatialDraft {
  if (!isRecord(value) || Reflect.ownKeys(value).length !== 2
    || !Object.hasOwn(value, 'workspace') || !Object.hasOwn(value, 'locations')) {
    throw new Error(t(invalidDraftMessage))
  }
  const workspace = parseWorkspace(JSON.stringify(value.workspace))
  validateNames(workspace)
  return { workspace, locations: parseLocations(value.locations) }
}

function sameValue(first: unknown, second: unknown): boolean {
  if (first === second) return true
  if (typeof first !== 'object' || first === null || typeof second !== 'object' || second === null) return false
  if (Array.isArray(first) || Array.isArray(second)) {
    return Array.isArray(first) && Array.isArray(second) && first.length === second.length
      && first.every((value, index) => sameValue(value, second[index]))
  }
  const firstRecord = first as Record<string, unknown>
  const secondRecord = second as Record<string, unknown>
  const keys = Object.keys(firstRecord)
  return keys.length === Object.keys(secondRecord).length
    && keys.every((key) => Object.hasOwn(secondRecord, key) && sameValue(firstRecord[key], secondRecord[key]))
}

/** Object property order is immaterial; floor, room and object array order remains meaningful. */
export function sameSpatialDraft(first: SpatialDraft, second: SpatialDraft): boolean {
  return sameValue(first.workspace, second.workspace) && sameValue(first.locations, second.locations)
}

function shareWorkspace(previous: WorkspaceDocument, next: WorkspaceDocument): WorkspaceDocument {
  if (sameValue(previous, next)) return previous
  const previousFloors = new Map(previous.floors.map((floor) => [floor.id, floor]))
  const previousRooms = new Map(previous.rooms.map((room) => [room.plan.id, room]))
  return {
    ...next,
    floors: next.floors.map((floor) => {
      const existing = previousFloors.get(floor.id)
      return existing && sameValue(existing, floor) ? existing : floor
    }),
    rooms: next.rooms.map((room) => {
      const existing = previousRooms.get(room.plan.id)
      if (!existing || !sameValue(existing.plan, room.plan)) return room
      return existing.floorId === room.floorId ? existing : { ...room, plan: existing.plan }
    }),
  }
}

export function createSpatialHistory(initial: SpatialDraft): SpatialHistory {
  return { past: [], present: parseSpatialDraft(initial), future: [] }
}

export function pushSpatialChange(history: SpatialHistory, candidate: SpatialDraft): SpatialHistory {
  const validated = parseSpatialDraft(candidate)
  if (sameSpatialDraft(history.present, validated)) return history
  return {
    past: [...history.past, history.present].slice(-spatialHistoryLimit),
    present: {
      workspace: shareWorkspace(history.present.workspace, validated.workspace),
      locations: sameValue(history.present.locations, validated.locations) ? history.present.locations : validated.locations,
    },
    future: [],
  }
}

export function undoSpatial(history: SpatialHistory): SpatialHistory {
  const present = history.past.at(-1)
  if (!present) return history
  return {
    past: history.past.slice(0, -1), present,
    future: [history.present, ...history.future].slice(0, spatialHistoryLimit),
  }
}

export function redoSpatial(history: SpatialHistory): SpatialHistory {
  const present = history.future[0]
  if (!present) return history
  return {
    past: [...history.past, history.present].slice(-spatialHistoryLimit), present,
    future: history.future.slice(1),
  }
}
