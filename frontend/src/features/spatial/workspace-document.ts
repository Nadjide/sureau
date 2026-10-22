import { z } from 'zod'
import { defaultPlan, loadPlan, parsePlan, type PlanPersistence, type PlanStorage, type SpatialPlan } from './plan-document'

export interface WorkspaceFloor {
  id: string
  name: string
}

export interface WorkspaceRoom {
  floorId: string
  plan: SpatialPlan
}

export interface WorkspaceDocument {
  version: 1
  id: 'workspace-local'
  name: string
  floors: WorkspaceFloor[]
  rooms: WorkspaceRoom[]
}

export type WorkspaceStorage = PlanStorage
export type WorkspacePersistence = PlanPersistence

export interface LoadedWorkspace extends WorkspacePersistence {
  workspace: WorkspaceDocument
}

export interface WorkspaceHistory {
  readonly past: readonly WorkspaceDocument[]
  readonly present: WorkspaceDocument
  readonly future: readonly WorkspaceDocument[]
}

export const workspaceStorageKey = 'sentinel-workspace-v1'
export const workspaceFileSizeLimit = 2_000_000
export const workspaceFloorLimit = 8
export const workspaceRoomLimit = 32
export const workspaceHistoryLimit = 50

const name = z.string().trim().min(1).max(60)
const floorId = z.string().regex(/^floor-[a-z0-9-]{2,80}$/)
const roomPlanSchema = z.unknown().transform((value, context): SpatialPlan => {
  try {
    return parsePlan(JSON.stringify(value))
  } catch {
    context.addIssue({ code: 'custom', message: 'Le plan de cette salle est invalide.' })
    return z.NEVER
  }
})

const workspaceSchema = z.strictObject({
  version: z.literal(1),
  id: z.literal('workspace-local'),
  name,
  floors: z.array(z.strictObject({ id: floorId, name })).min(1).max(workspaceFloorLimit),
  rooms: z.array(z.strictObject({ floorId, plan: roomPlanSchema })).min(1).max(workspaceRoomLimit),
}).superRefine((workspace, context) => {
  const floors = new Set<string>()
  for (const [index, floor] of workspace.floors.entries()) {
    if (floors.has(floor.id)) context.addIssue({ code: 'custom', path: ['floors', index, 'id'], message: 'Identifiant d’étage dupliqué.' })
    floors.add(floor.id)
  }
  const rooms = new Set<string>()
  const items = new Set<string>()
  for (const [index, room] of workspace.rooms.entries()) {
    if (!floors.has(room.floorId)) context.addIssue({ code: 'custom', path: ['rooms', index, 'floorId'], message: 'Cet étage n’existe pas.' })
    if (rooms.has(room.plan.id)) context.addIssue({ code: 'custom', path: ['rooms', index, 'plan', 'id'], message: 'Identifiant de salle dupliqué.' })
    rooms.add(room.plan.id)
    for (const item of [...room.plan.workstations, ...room.plan.furniture]) {
      if (items.has(item.id)) context.addIssue({ code: 'custom', path: ['rooms', index, 'plan'], message: 'Un identifiant d’objet est utilisé dans plusieurs salles.' })
      items.add(item.id)
    }
  }
})

const invalidStorageWarning =
  'L’espace de travail enregistré est illisible ou incompatible. Il a été conservé. Vos modifications restent limitées à cette session.'
const unavailableStorageWarning =
  'Le stockage local est inaccessible. L’espace de travail reste disponible uniquement pendant cette session.'

export function createWorkspaceFromPlan(plan: SpatialPlan = defaultPlan): WorkspaceDocument {
  return {
    version: 1,
    id: 'workspace-local',
    name: 'Espace de travail',
    floors: [{ id: 'floor-01', name: 'Étage 1' }],
    rooms: [{ floorId: 'floor-01', plan: parsePlan(JSON.stringify(plan)) }],
  }
}

export function parseWorkspace(raw: string): WorkspaceDocument {
  if (new TextEncoder().encode(raw).byteLength > workspaceFileSizeLimit) {
    throw new Error('Cet espace de travail est trop volumineux. La limite est de 2 Mo.')
  }
  try {
    const payload: unknown = JSON.parse(raw)
    return workspaceSchema.parse(payload)
  } catch {
    throw new Error('Cet espace de travail est invalide ou utilise un format incompatible. Aucun changement n’a été appliqué.')
  }
}

export function loadWorkspace(storage: WorkspaceStorage | null): LoadedWorkspace {
  let raw: string | null
  try {
    if (storage === null) throw new Error('Storage unavailable')
    raw = storage.getItem(workspaceStorageKey)
  } catch {
    return { workspace: createWorkspaceFromPlan(), warning: unavailableStorageWarning, persisted: false, canPersist: false }
  }

  if (raw !== null) {
    try {
      return { workspace: parseWorkspace(raw), warning: null, persisted: true, canPersist: true }
    } catch {
      return { workspace: createWorkspaceFromPlan(), warning: invalidStorageWarning, persisted: false, canPersist: false }
    }
  }

  const { plan, ...persistence } = loadPlan(storage)
  return { workspace: createWorkspaceFromPlan(plan), ...persistence }
}

export function saveWorkspace(storage: WorkspaceStorage | null, workspace: WorkspaceDocument): WorkspacePersistence {
  if (storage === null) return { warning: unavailableStorageWarning, persisted: false, canPersist: false }
  let raw: string
  try {
    raw = JSON.stringify(parseWorkspace(JSON.stringify(workspace)))
  } catch {
    return { warning: 'Cet espace de travail est invalide et n’a pas été enregistré.', persisted: false, canPersist: false }
  }
  const current = loadWorkspace(storage)
  if (!current.canPersist) return { warning: current.warning, persisted: false, canPersist: false }
  try {
    storage.setItem(workspaceStorageKey, raw)
    return { warning: null, persisted: true, canPersist: true }
  } catch {
    return {
      warning: 'L’enregistrement local de l’espace de travail a échoué. Vos modifications restent disponibles pendant cette session.',
      persisted: false,
      canPersist: true,
    }
  }
}

function shareUnchangedRooms(previous: WorkspaceDocument, next: WorkspaceDocument): WorkspaceDocument {
  const previousRooms = new Map(previous.rooms.map((room) => [room.plan.id, room]))
  return {
    ...next,
    rooms: next.rooms.map((room) => {
      const existing = previousRooms.get(room.plan.id)
      if (!existing || JSON.stringify(existing.plan) !== JSON.stringify(room.plan)) return room
      return existing.floorId === room.floorId ? existing : { ...room, plan: existing.plan }
    }),
  }
}

export function replaceWorkspaceRoom(workspace: WorkspaceDocument, roomId: string, nextPlan: SpatialPlan): WorkspaceDocument {
  if (nextPlan.id !== roomId) throw new RangeError('Le plan ne correspond pas à la salle à modifier.')
  if (!workspace.rooms.some((room) => room.plan.id === roomId)) throw new RangeError('Cette salle n’existe pas dans l’espace de travail.')
  const candidate = {
    ...workspace,
    rooms: workspace.rooms.map((room) => room.plan.id === roomId ? { ...room, plan: nextPlan } : room),
  }
  const next = parseWorkspace(JSON.stringify(candidate))
  if (JSON.stringify(next) === JSON.stringify(workspace)) return workspace
  return shareUnchangedRooms(workspace, next)
}

export function createWorkspaceHistory(initial: WorkspaceDocument): WorkspaceHistory {
  return { past: [], present: parseWorkspace(JSON.stringify(initial)), future: [] }
}

export function pushWorkspaceChange(history: WorkspaceHistory, candidate: WorkspaceDocument): WorkspaceHistory {
  const validated = parseWorkspace(JSON.stringify(candidate))
  if (JSON.stringify(validated) === JSON.stringify(history.present)) return history
  return {
    past: [...history.past, history.present].slice(-workspaceHistoryLimit),
    present: shareUnchangedRooms(history.present, validated),
    future: [],
  }
}

export function undoWorkspace(history: WorkspaceHistory): WorkspaceHistory {
  const present = history.past.at(-1)
  if (!present) return history
  return { past: history.past.slice(0, -1), present, future: [history.present, ...history.future].slice(0, workspaceHistoryLimit) }
}

export function redoWorkspace(history: WorkspaceHistory): WorkspaceHistory {
  const present = history.future[0]
  if (!present) return history
  return { past: [...history.past, history.present].slice(-workspaceHistoryLimit), present, future: history.future.slice(1) }
}
