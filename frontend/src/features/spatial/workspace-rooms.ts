import { defaultPlan, parsePlan } from './plan-document'
import type { SpatialPlan, Workstation } from './room-model'
import { parseWorkspace, workspaceRoomLimit, type WorkspaceDocument, type WorkspaceFloor, type WorkspaceRoom } from './workspace-document'

export type WorkspaceIdFactory = (type: 'room' | 'desk' | 'furniture') => string
const defaultId: WorkspaceIdFactory = (type) => `${type}-${crypto.randomUUID()}`

export interface WorkspaceStation {
  station: Workstation
  room: WorkspaceRoom
  floor: WorkspaceFloor
}

function roomIn(workspace: WorkspaceDocument, roomId: string): WorkspaceRoom {
  const room = workspace.rooms.find((candidate) => candidate.plan.id === roomId)
  if (!room) throw new RangeError('Cette salle n’existe plus dans l’espace de travail.')
  return room
}

function roomName(name: string): string {
  const normalized = name.trim()
  if (!normalized || normalized.length > 60) throw new RangeError('Donnez un nom de 1 à 60 caractères à la salle.')
  return normalized
}

function usedIds(workspace: WorkspaceDocument): Set<string> {
  return new Set([
    ...workspace.floors.map((floor) => floor.id),
    ...workspace.rooms.flatMap((room) => [room.plan.id, ...room.plan.workstations.map((item) => item.id), ...room.plan.furniture.map((item) => item.id)]),
  ])
}

function nextId(type: 'room' | 'desk' | 'furniture', used: Set<string>, createId: WorkspaceIdFactory): string {
  const id = createId(type)
  if (!new RegExp(`^${type}-[a-z0-9-]{2,80}$`).test(id) || used.has(id)) {
    throw new RangeError('Un identifiant de salle ou d’objet est invalide ou déjà utilisé. Aucun changement n’a été appliqué.')
  }
  used.add(id)
  return id
}

function validated(workspace: WorkspaceDocument): WorkspaceDocument {
  parseWorkspace(JSON.stringify(workspace))
  // Keep unchanged rooms by reference so edits in another room do not invalidate drafts.
  return workspace
}

function canAddRoom(workspace: WorkspaceDocument, floorId: string) {
  if (workspace.rooms.length >= workspaceRoomLimit) throw new RangeError(`Cet espace peut contenir jusqu’à ${workspaceRoomLimit} salles.`)
  if (!workspace.floors.some((floor) => floor.id === floorId)) throw new RangeError('Cet étage n’existe pas dans l’espace de travail.')
}

export function createRoom(
  workspace: WorkspaceDocument, floorId: string, name: string, template: SpatialPlan = defaultPlan, createId: WorkspaceIdFactory = defaultId,
): { workspace: WorkspaceDocument; roomId: string } {
  canAddRoom(workspace, floorId)
  const normalizedName = roomName(name)
  const source = parsePlan(JSON.stringify(template))
  const roomId = nextId('room', usedIds(workspace), createId)
  const plan: SpatialPlan = { ...source, id: roomId, name: normalizedName, workstations: [], furniture: [] }
  return { workspace: validated({ ...workspace, rooms: [...workspace.rooms, { floorId, plan }] }), roomId }
}

export function duplicateRoom(
  workspace: WorkspaceDocument, roomId: string, name?: string, createId: WorkspaceIdFactory = defaultId,
): { workspace: WorkspaceDocument; roomId: string } {
  const room = roomIn(workspace, roomId)
  canAddRoom(workspace, room.floorId)
  const normalizedName = roomName(name ?? `${room.plan.name.slice(0, 52)} (copie)`)
  const source = parsePlan(JSON.stringify(room.plan))
  const used = usedIds(workspace)
  const id = nextId('room', used, createId)
  const plan: SpatialPlan = {
    ...source, id, name: normalizedName,
    workstations: source.workstations.map((item) => ({ ...item, id: nextId('desk', used, createId) })),
    furniture: source.furniture.map((item) => ({ ...item, id: nextId('furniture', used, createId) })),
  }
  return { workspace: validated({ ...workspace, rooms: [...workspace.rooms, { floorId: room.floorId, plan }] }), roomId: id }
}

export function renameRoom(workspace: WorkspaceDocument, roomId: string, name: string): WorkspaceDocument {
  const room = roomIn(workspace, roomId)
  const normalizedName = roomName(name)
  if (room.plan.name === normalizedName) return workspace
  return validated({ ...workspace, rooms: workspace.rooms.map((item) => item === room ? { ...room, plan: { ...room.plan, name: normalizedName } } : item) })
}

export function deleteRoom(workspace: WorkspaceDocument, roomId: string): WorkspaceDocument {
  roomIn(workspace, roomId)
  if (workspace.rooms.length <= 1) throw new RangeError('Conservez au moins une salle dans votre espace de travail.')
  return validated({ ...workspace, rooms: workspace.rooms.filter((room) => room.plan.id !== roomId) })
}

export function findWorkspaceStation(workspace: WorkspaceDocument, stationId: string | null | undefined): WorkspaceStation | undefined {
  if (!stationId) return undefined
  for (const room of workspace.rooms) {
    const station = room.plan.workstations.find((item) => item.id === stationId)
    if (!station) continue
    const floor = workspace.floors.find((item) => item.id === room.floorId)
    if (floor) return { station, room, floor }
  }
  return undefined
}

export function prepareRoomReplacement(
  workspace: WorkspaceDocument, roomId: string, candidate: SpatialPlan, createId: WorkspaceIdFactory = defaultId,
): SpatialPlan {
  roomIn(workspace, roomId)
  const plan = parsePlan(JSON.stringify({ ...candidate, id: roomId }))
  const conflicting = new Set(workspace.rooms.filter((room) => room.plan.id !== roomId)
    .flatMap((room) => [...room.plan.workstations.map((item) => item.id), ...room.plan.furniture.map((item) => item.id)]))
  const used = usedIds(workspace)
  for (const item of [...plan.workstations, ...plan.furniture]) used.add(item.id)
  const prepared: SpatialPlan = {
    ...plan,
    workstations: plan.workstations.map((item) => conflicting.has(item.id) ? { ...item, id: nextId('desk', used, createId) } : item),
    furniture: plan.furniture.map((item) => conflicting.has(item.id) ? { ...item, id: nextId('furniture', used, createId) } : item),
  }
  validated({ ...workspace, rooms: workspace.rooms.map((room) => room.plan.id === roomId ? { ...room, plan: prepared } : room) })
  return prepared
}
