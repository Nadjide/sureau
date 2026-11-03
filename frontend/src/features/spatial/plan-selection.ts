import { footprintBounds, mixedOverlaps, normalizeRotation } from './plan-geometry'
import type { FurnitureItem, SpatialPlan, Workstation } from './room-model'
import { t } from '@/lib/i18n'

export type PlanItem = Workstation | FurnitureItem

function selectionBounds(items: readonly PlanItem[]) {
  const boxes = items.map(footprintBounds)
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    minZ: Math.min(...boxes.map((box) => box.minZ)),
    maxZ: Math.max(...boxes.map((box) => box.maxZ)),
  }
}

function allowedDeltas(plan: SpatialPlan, items: readonly PlanItem[]) {
  const { minX, maxX, minZ, maxZ } = selectionBounds(items)
  if (
    ![plan.width, plan.depth, minX, maxX, minZ, maxZ].every(Number.isFinite) ||
    plan.width <= 0 ||
    plan.depth <= 0 ||
    maxX - minX > plan.width + 1e-7 ||
    maxZ - minZ > plan.depth + 1e-7
  ) {
    throw new RangeError(t('Cette sélection ne tient pas dans la salle.'))
  }
  return {
    minX: -plan.width / 2 - minX,
    maxX: plan.width / 2 - maxX,
    minZ: -plan.depth / 2 - minZ,
    maxZ: plan.depth / 2 - maxZ,
  }
}

function replaceItems(plan: SpatialPlan, items: readonly PlanItem[]): SpatialPlan {
  const replacements = new Map(items.map((item) => [item.id, item]))
  return {
    ...plan,
    workstations: plan.workstations.map((item) => (replacements.get(item.id) as Workstation | undefined) ?? item),
    furniture: plan.furniture.map((item) => (replacements.get(item.id) as FurnitureItem | undefined) ?? item),
  }
}

function movedItem<T extends PlanItem>(item: T, dx: number, dz: number): T {
  return { ...item, position: [item.position[0] + dx, 0, item.position[2] + dz] }
}

export function resolveSelection(plan: SpatialPlan, ids: readonly string[]): PlanItem[] {
  const selected = new Set(ids)
  return [...plan.workstations, ...plan.furniture].filter((item) => selected.has(item.id))
}

export function selectIds(current: readonly string[], id: string, additive = false, preserve = false): string[] {
  const unique = [...new Set(current)]
  if (preserve && unique.includes(id)) return unique
  if (!additive) return [id]
  return unique.includes(id) ? unique.filter((candidate) => candidate !== id) : [...unique, id]
}

export function translateSelection(
  plan: SpatialPlan,
  ids: readonly string[],
  anchorId: string,
  x: number,
  z: number,
  snap: boolean,
): SpatialPlan {
  if (![x, z, plan.width, plan.depth].every(Number.isFinite) || plan.width <= 0 || plan.depth <= 0) {
    throw new RangeError(t('Les coordonnées et les dimensions de la salle doivent être valides.'))
  }
  const items = resolveSelection(plan, ids)
  const anchor = items.find((item) => item.id === anchorId)
  if (!anchor) return plan

  const limits = allowedDeltas(plan, items)

  function target(coordinate: number) {
    const scaled = coordinate * 4
    return snap && Number.isFinite(scaled) ? Math.round(scaled) / 4 : coordinate
  }
  const dx = Math.max(limits.minX, Math.min(limits.maxX, target(x) - anchor.position[0]))
  const dz = Math.max(limits.minZ, Math.min(limits.maxZ, target(z) - anchor.position[2]))
  if (dx === 0 && dz === 0) return plan

  return replaceItems(
    plan,
    items.map((item) => movedItem(item, dx, dz)),
  )
}

export function rotateSelection(plan: SpatialPlan, ids: readonly string[], angle: number): SpatialPlan {
  const rotation = normalizeRotation(angle)
  const items = resolveSelection(plan, ids)
  if (!items.length || rotation === 0) return plan
  const bounds = selectionBounds(items)
  const pivotX = (bounds.minX + bounds.maxX) / 2,
    pivotZ = (bounds.minZ + bounds.maxZ) / 2
  const cosine = Math.cos(rotation),
    sine = Math.sin(rotation)
  const rotated = items.map((item): PlanItem => {
    const x = item.position[0] - pivotX,
      z = item.position[2] - pivotZ
    return {
      ...item,
      rotation: normalizeRotation(item.rotation + rotation),
      position: [pivotX + cosine * x + sine * z, 0, pivotZ - sine * x + cosine * z],
    }
  })
  const limits = allowedDeltas(plan, rotated)
  const dx = Math.max(limits.minX, Math.min(limits.maxX, 0))
  const dz = Math.max(limits.minZ, Math.min(limits.maxZ, 0))
  return replaceItems(
    plan,
    rotated.map((item) => movedItem(item, dx, dz)),
  )
}

export function duplicateSelection(
  plan: SpatialPlan,
  ids: readonly string[],
  createId: (type: 'desk' | 'furniture') => string = (type) => `${type}-${crypto.randomUUID()}`,
): { plan: SpatialPlan; selectedIds: string[] } {
  const items = resolveSelection(plan, ids)
  if (!items.length) return { plan, selectedIds: [] }
  const workstationCount = items.filter((item) => !('kind' in item)).length
  if (
    plan.workstations.length + workstationCount > 64 ||
    plan.furniture.length + items.length - workstationCount > 64
  ) {
    throw new RangeError(t('Cette copie dépasse la limite de 64 postes ou 64 meubles par salle.'))
  }
  const limits = allowedDeltas(plan, items)
  const candidates = new Map<string, { dx: number; dz: number }>()
  function add(dx: number, dz: number) {
    dx = Math.max(limits.minX, Math.min(limits.maxX, dx))
    dz = Math.max(limits.minZ, Math.min(limits.maxZ, dz))
    candidates.set(`${dx},${dz}`, { dx, dz })
  }
  add(0.5, 0.5)
  const xs = [limits.minX, limits.maxX],
    zs = [limits.minZ, limits.maxZ]
  for (let x = Math.ceil(limits.minX * 2) / 2; x <= limits.maxX; x += 0.5) xs.push(x)
  for (let z = Math.ceil(limits.minZ * 2) / 2; z <= limits.maxZ; z += 0.5) zs.push(z)
  for (const x of xs) for (const z of zs) add(x, z)

  const occupants = [...plan.workstations, ...plan.furniture].map((item) => ({ item, bounds: footprintBounds(item) }))
  const source = items.map((item) => ({ item, bounds: footprintBounds(item) }))
  const ordered = [...candidates.values()].sort(
    (a, b) => (a.dx - 0.5) ** 2 + (a.dz - 0.5) ** 2 - (b.dx - 0.5) ** 2 - (b.dz - 0.5) ** 2,
  )
  const placement = ordered.find(({ dx, dz }) =>
    source.every(({ item, bounds }) => {
      const moved = movedItem(item, dx, dz)
      return occupants.every(
        (other) =>
          bounds.maxX + dx <= other.bounds.minX + 1e-7 ||
          bounds.minX + dx >= other.bounds.maxX - 1e-7 ||
          bounds.maxZ + dz <= other.bounds.minZ + 1e-7 ||
          bounds.minZ + dz >= other.bounds.maxZ - 1e-7 ||
          !mixedOverlaps(moved, other.item),
      )
    }),
  )
  if (!placement)
    throw new RangeError(
      t('Il manque une zone libre pour copier toute la sélection. Réorganisez ou agrandissez la salle.'),
    )

  const usedIds = new Set(occupants.map(({ item }) => item.id))
  const workstations: Workstation[] = [],
    furniture: FurnitureItem[] = [],
    selectedIds: string[] = []
  for (const item of items) {
    const type = 'kind' in item ? 'furniture' : 'desk'
    const id = createId(type)
    if (!new RegExp(`^${type}-[a-z0-9-]{2,80}$`).test(id) || usedIds.has(id)) {
      throw new RangeError(t('La copie a généré un identifiant invalide ou déjà utilisé. Aucun objet n’a été ajouté.'))
    }
    usedIds.add(id)
    const copy = { ...movedItem(item, placement.dx, placement.dz), id, label: `${item.label.slice(0, 52)} (copie)` }
    if ('kind' in copy) furniture.push(copy)
    else workstations.push(copy)
    selectedIds.push(id)
  }
  return {
    plan: {
      ...plan,
      workstations: [...plan.workstations, ...workstations],
      furniture: [...plan.furniture, ...furniture],
    },
    selectedIds,
  }
}

export function removeSelection(plan: SpatialPlan, ids: readonly string[]): SpatialPlan {
  const items = resolveSelection(plan, ids)
  if (!items.length) return plan
  const removed = new Set(items.map((item) => item.id))
  return {
    ...plan,
    workstations: plan.workstations.filter((item) => !removed.has(item.id)),
    furniture: plan.furniture.filter((item) => !removed.has(item.id)),
  }
}
