import { footprintBounds, mixedOverlaps } from './plan-geometry'
import { resolveSelection, type PlanItem } from './plan-selection'
import type { FurnitureItem, Workstation } from './room-model'
import { parseWorkspace, type WorkspaceDocument } from './workspace-document'
import { t } from '@/lib/i18n'

function shifted<T extends PlanItem>(item: T, dx: number, dz: number): T {
  return { ...item, position: [item.position[0] + dx, 0, item.position[2] + dz] }
}

export function moveSelectionToRoom(
  workspace: WorkspaceDocument,
  sourceRoomId: string,
  targetRoomId: string,
  ids: readonly string[],
  placement: { x: number; z: number } = { x: 0, z: 0 },
): { workspace: WorkspaceDocument; selectedIds: string[] } {
  const selectedIds = [...new Set(ids)]
  if (!selectedIds.length) return { workspace, selectedIds }
  const source = workspace.rooms.find((room) => room.plan.id === sourceRoomId)
  const target = workspace.rooms.find((room) => room.plan.id === targetRoomId)
  if (!source || !target) throw new RangeError(t('La salle de départ ou la salle d’arrivée n’existe plus.'))
  const items = resolveSelection(source.plan, selectedIds)
  if (items.length !== selectedIds.length)
    throw new RangeError(t('La sélection a changé. Sélectionnez à nouveau les objets à déplacer.'))
  if (source === target) return { workspace, selectedIds }
  if (![placement.x, placement.z].every(Number.isFinite))
    throw new RangeError(t('La position d’arrivée doit contenir des coordonnées finies.'))
  const workstations = items.filter((item): item is Workstation => !('kind' in item))
  const furniture = items.filter((item): item is FurnitureItem => 'kind' in item)
  if (
    target.plan.workstations.length + workstations.length > 64 ||
    target.plan.furniture.length + furniture.length > 64
  ) {
    throw new RangeError(t('La salle d’arrivée dépasserait la limite de 64 postes ou 64 meubles.'))
  }

  const origins = items.map((item) => ({ item, bounds: footprintBounds(item) }))
  const minX = Math.min(...origins.map(({ bounds }) => bounds.minX)),
    maxX = Math.max(...origins.map(({ bounds }) => bounds.maxX))
  const minZ = Math.min(...origins.map(({ bounds }) => bounds.minZ)),
    maxZ = Math.max(...origins.map(({ bounds }) => bounds.maxZ))
  const width = maxX - minX,
    depth = maxZ - minZ
  if (
    ![minX, maxX, minZ, maxZ, target.plan.width, target.plan.depth].every(Number.isFinite) ||
    target.plan.width < 6 ||
    target.plan.width > 50 ||
    target.plan.depth < 6 ||
    target.plan.depth > 50 ||
    width > target.plan.width + 1e-7 ||
    depth > target.plan.depth + 1e-7
  ) {
    throw new RangeError(
      t('Toute la sélection ne tient pas dans la salle d’arrivée. Agrandissez la salle ou déplacez moins d’objets.'),
    )
  }

  const centerX = (minX + maxX) / 2,
    centerZ = (minZ + maxZ) / 2
  const lowX = -target.plan.width / 2 + width / 2,
    highX = target.plan.width / 2 - width / 2
  const lowZ = -target.plan.depth / 2 + depth / 2,
    highZ = target.plan.depth / 2 - depth / 2
  const desiredX = Math.max(lowX, Math.min(highX, placement.x)),
    desiredZ = Math.max(lowZ, Math.min(highZ, placement.z))
  const candidates = new Map<string, { x: number; z: number }>()
  function add(x: number, z: number) {
    x = Math.max(lowX, Math.min(highX, x))
    z = Math.max(lowZ, Math.min(highZ, z))
    candidates.set(`${x},${z}`, { x, z })
  }
  const xs = [desiredX, lowX, highX],
    zs = [desiredZ, lowZ, highZ]
  for (let x = Math.ceil(lowX * 2) / 2; x <= highX; x += 0.5) xs.push(x)
  for (let z = Math.ceil(lowZ * 2) / 2; z <= highZ; z += 0.5) zs.push(z)
  for (const x of xs) for (const z of zs) add(x, z)
  const occupants = [...target.plan.workstations, ...target.plan.furniture].map((item) => ({
    item,
    bounds: footprintBounds(item),
  }))
  const ordered = [...candidates.values()].sort(
    (a, b) => (a.x - desiredX) ** 2 + (a.z - desiredZ) ** 2 - (b.x - desiredX) ** 2 - (b.z - desiredZ) ** 2,
  )
  const destination = ordered.find(({ x, z }) => {
    const dx = x - centerX,
      dz = z - centerZ
    return origins.every(({ item, bounds }) => {
      const moved = shifted(item, dx, dz)
      return occupants.every(
        (other) =>
          bounds.maxX + dx <= other.bounds.minX + 1e-7 ||
          bounds.minX + dx >= other.bounds.maxX - 1e-7 ||
          bounds.maxZ + dz <= other.bounds.minZ + 1e-7 ||
          bounds.minZ + dz >= other.bounds.maxZ - 1e-7 ||
          !mixedOverlaps(moved, other.item),
      )
    })
  })
  if (!destination)
    throw new RangeError(
      t(
        'Le placement automatique n’a pas trouvé de zone libre pour toute la sélection. Réorganisez la salle ou réduisez la sélection. Aucun objet n’a été déplacé.',
      ),
    )

  const dx = destination.x - centerX,
    dz = destination.z - centerZ
  const removed = new Set(selectedIds)
  const showDecor = furniture.some((item) => item.kind === 'plant' || item.kind === 'cabinet')
  const next: WorkspaceDocument = {
    ...workspace,
    rooms: workspace.rooms.map((room) =>
      room === source
        ? {
            ...room,
            plan: {
              ...room.plan,
              workstations: room.plan.workstations.filter((item) => !removed.has(item.id)),
              furniture: room.plan.furniture.filter((item) => !removed.has(item.id)),
            },
          }
        : room === target
          ? {
              ...room,
              plan: {
                ...room.plan,
                workstations: [...room.plan.workstations, ...workstations.map((item) => shifted(item, dx, dz))],
                furniture: [...room.plan.furniture, ...furniture.map((item) => shifted(item, dx, dz))],
                display:
                  showDecor && !room.plan.display.decor ? { ...room.plan.display, decor: true } : room.plan.display,
              },
            }
          : room,
    ),
  }
  parseWorkspace(JSON.stringify(next))
  return { workspace: next, selectedIds }
}
