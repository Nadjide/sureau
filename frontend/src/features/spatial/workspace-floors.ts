import { parseWorkspace, workspaceFloorLimit, type WorkspaceDocument, type WorkspaceFloor } from './workspace-document'

function floorIn(workspace: WorkspaceDocument, floorId: string): WorkspaceFloor {
  const floor = workspace.floors.find((item) => item.id === floorId)
  if (!floor) throw new RangeError('Cet étage n’existe plus dans l’espace de travail.')
  return floor
}

function normalizedName(name: string, target: 'floor' | 'workspace'): string {
  const normalized = name.trim()
  if (!normalized || normalized.length > 60) {
    throw new RangeError(target === 'floor'
      ? 'Donnez un nom de 1 à 60 caractères à cet étage.'
      : 'Donnez un nom de 1 à 60 caractères à l’espace de travail.')
  }
  return normalized
}

function validated(workspace: WorkspaceDocument): WorkspaceDocument {
  parseWorkspace(JSON.stringify(workspace))
  return workspace
}

export function createFloor(
  workspace: WorkspaceDocument, name: string, createId: () => string = () => `floor-${crypto.randomUUID()}`,
): { workspace: WorkspaceDocument; floorId: string } {
  if (workspace.floors.length >= workspaceFloorLimit) {
    throw new RangeError(`Cet espace peut contenir jusqu’à ${workspaceFloorLimit} étages.`)
  }
  const normalized = normalizedName(name, 'floor')
  const floorId = createId()
  if (!/^floor-[a-z0-9-]{2,80}$/.test(floorId) || workspace.floors.some((floor) => floor.id === floorId)) {
    throw new RangeError('Un identifiant d’étage est invalide ou déjà utilisé. Aucun changement n’a été appliqué.')
  }
  return {
    workspace: validated({ ...workspace, floors: [...workspace.floors, { id: floorId, name: normalized }] }),
    floorId,
  }
}

export function renameFloor(workspace: WorkspaceDocument, floorId: string, name: string): WorkspaceDocument {
  const floor = floorIn(workspace, floorId)
  const normalized = normalizedName(name, 'floor')
  if (floor.name === normalized) return validated(workspace)
  return validated({
    ...workspace,
    floors: workspace.floors.map((item) => item === floor ? { ...floor, name: normalized } : item),
  })
}

export function moveRoomToFloor(workspace: WorkspaceDocument, roomId: string, floorId: string): WorkspaceDocument {
  const room = workspace.rooms.find((item) => item.plan.id === roomId)
  if (!room) throw new RangeError('Cette salle n’existe plus dans l’espace de travail.')
  floorIn(workspace, floorId)
  if (room.floorId === floorId) return validated(workspace)
  return validated({
    ...workspace,
    rooms: workspace.rooms.map((item) => item === room ? { ...room, floorId } : item),
  })
}

export function reorderFloor(workspace: WorkspaceDocument, floorId: string, direction: -1 | 1): WorkspaceDocument {
  const floor = floorIn(workspace, floorId)
  if (direction !== -1 && direction !== 1) throw new RangeError('Le déplacement d’un étage doit suivre un seul rang.')
  const index = workspace.floors.indexOf(floor)
  const destination = index + direction
  if (destination < 0 || destination >= workspace.floors.length) return validated(workspace)
  const floors = [...workspace.floors]
  floors[index] = floors[destination]!
  floors[destination] = floor
  return validated({ ...workspace, floors })
}

export function removeFloor(workspace: WorkspaceDocument, floorId: string, destinationFloorId?: string): WorkspaceDocument {
  floorIn(workspace, floorId)
  if (workspace.floors.length <= 1) throw new RangeError('Conservez au moins un étage dans votre espace de travail.')
  const occupied = workspace.rooms.some((room) => room.floorId === floorId)
  if (occupied && !destinationFloorId) {
    throw new RangeError('Choisissez un autre étage où déplacer les salles avant cette suppression.')
  }
  if (destinationFloorId !== undefined) {
    if (destinationFloorId === floorId) throw new RangeError('La destination doit être un autre étage.')
    floorIn(workspace, destinationFloorId)
  }
  return validated({
    ...workspace,
    floors: workspace.floors.filter((floor) => floor.id !== floorId),
    rooms: occupied
      ? workspace.rooms.map((room) => room.floorId === floorId ? { ...room, floorId: destinationFloorId! } : room)
      : workspace.rooms,
  })
}

export function renameWorkspace(workspace: WorkspaceDocument, name: string): WorkspaceDocument {
  const normalized = normalizedName(name, 'workspace')
  if (workspace.name === normalized) return validated(workspace)
  return validated({ ...workspace, name: normalized })
}
