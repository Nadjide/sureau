import { parseWorkspace, workspaceFileSizeLimit, type WorkspaceDocument } from './workspace-document'

export interface WorkspaceSummary {
  floorCount: number
  roomCount: number
  workstationCount: number
  furnitureCount: number
}

function validated(workspace: WorkspaceDocument): WorkspaceDocument {
  return parseWorkspace(JSON.stringify(workspace))
}

export function serializeWorkspace(workspace: WorkspaceDocument): string {
  const document = validated(workspace)
  const pretty = `${JSON.stringify(document, null, 2)}\n`
  const encoder = new TextEncoder()
  if (encoder.encode(pretty).byteLength <= workspaceFileSizeLimit) return pretty

  const compact = JSON.stringify(document)
  if (encoder.encode(compact).byteLength > workspaceFileSizeLimit) {
    throw new Error('Cet espace de travail est trop volumineux. La limite est de 2 Mo.')
  }
  return compact
}

export function isSameWorkspace(current: WorkspaceDocument, candidate: WorkspaceDocument): boolean {
  return JSON.stringify(validated(current)) === JSON.stringify(validated(candidate))
}

export function getWorkspaceSummary(workspace: WorkspaceDocument): WorkspaceSummary {
  const document = validated(workspace)
  return {
    floorCount: document.floors.length,
    roomCount: document.rooms.length,
    workstationCount: document.rooms.reduce((count, room) => count + room.plan.workstations.length, 0),
    furnitureCount: document.rooms.reduce((count, room) => count + room.plan.furniture.length, 0),
  }
}
