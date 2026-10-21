import { footprintBounds } from './plan-geometry'
import type { FurnitureItem, SpatialPlan, Workstation } from './room-model'

export type PlanItem = Workstation | FurnitureItem

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
  plan: SpatialPlan, ids: readonly string[], anchorId: string, x: number, z: number, snap: boolean,
): SpatialPlan {
  if (![x, z, plan.width, plan.depth].every(Number.isFinite) || plan.width <= 0 || plan.depth <= 0) {
    throw new RangeError('Les coordonnées et les dimensions de la salle doivent être valides.')
  }
  const items = resolveSelection(plan, ids)
  const anchor = items.find((item) => item.id === anchorId)
  if (!anchor) return plan

  const boxes = items.map(footprintBounds)
  const minX = Math.min(...boxes.map((box) => box.minX)), maxX = Math.max(...boxes.map((box) => box.maxX))
  const minZ = Math.min(...boxes.map((box) => box.minZ)), maxZ = Math.max(...boxes.map((box) => box.maxZ))
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite)
    || maxX - minX > plan.width + 1e-7 || maxZ - minZ > plan.depth + 1e-7) {
    throw new RangeError('Cette sélection ne tient pas dans la salle.')
  }

  function target(coordinate: number) {
    const scaled = coordinate * 4
    return snap && Number.isFinite(scaled) ? Math.round(scaled) / 4 : coordinate
  }
  const dx = Math.max(-plan.width / 2 - minX, Math.min(plan.width / 2 - maxX, target(x) - anchor.position[0]))
  const dz = Math.max(-plan.depth / 2 - minZ, Math.min(plan.depth / 2 - maxZ, target(z) - anchor.position[2]))
  if (dx === 0 && dz === 0) return plan

  const selected = new Set(items.map((item) => item.id))
  function move<T extends PlanItem>(item: T): T {
    return selected.has(item.id)
      ? { ...item, position: [item.position[0] + dx, 0, item.position[2] + dz] }
      : item
  }
  return { ...plan, workstations: plan.workstations.map(move), furniture: plan.furniture.map(move) }
}
