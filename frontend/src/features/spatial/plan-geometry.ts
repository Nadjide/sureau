import type { FurnitureItem, SpatialPlan, Workstation } from './room-model'

type Point = readonly [number, number]
type PlanItem = Workstation | FurnitureItem
type PlanBounds = Pick<SpatialPlan, 'width' | 'depth'>

interface Envelope {
  center: Point
  axes: readonly [Point, Point]
  halfWidth: number
  halfDepth: number
  localOffset: number
}

const epsilon = 1e-7
const fullTurn = Math.PI * 2

export function normalizeRotation(radians: number): number {
  if (!Number.isFinite(radians)) throw new RangeError('La rotation doit être un nombre fini.')
  const rotation = radians % fullTurn
  const positive = rotation < 0 ? rotation + fullTurn : rotation
  return positive === 0 || positive >= fullTurn ? 0 : positive
}

function envelope(station: PlanItem): Envelope {
  if (![...station.position, station.width, station.depth].every(Number.isFinite)
    || station.width <= 0 || station.depth <= 0) {
    throw new RangeError('Les dimensions et coordonnées du mobilier sont invalides.')
  }
  const rotation = normalizeRotation(station.rotation)
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  // Workstations include the chair; catalogue furniture uses a centred rectangle.
  const furniture = 'kind' in station
  const localOffset = furniture ? 0 : 0.4 * station.depth
  return {
    center: [station.position[0] + sine * localOffset, station.position[2] + cosine * localOffset],
    axes: [[cosine, -sine], [sine, cosine]],
    halfWidth: station.width / 2,
    halfDepth: station.depth * (furniture ? 0.5 : 0.9),
    localOffset,
  }
}

function dot(first: Point, second: Point): number {
  return first[0] * second[0] + first[1] * second[1]
}

function projectedRadius(box: Envelope, axis: Point): number {
  return Math.abs(dot(box.axes[0], axis)) * box.halfWidth
    + Math.abs(dot(box.axes[1], axis)) * box.halfDepth
}

export function footprintBounds(item: PlanItem): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const box = envelope(item)
  const xRadius = projectedRadius(box, [1, 0])
  const zRadius = projectedRadius(box, [0, 1])
  return {
    minX: box.center[0] - xRadius, maxX: box.center[0] + xRadius,
    minZ: box.center[1] - zRadius, maxZ: box.center[1] + zRadius,
  }
}

function clampItem<T extends PlanItem>(plan: PlanBounds, station: T): T {
  if (![plan.width, plan.depth].every(Number.isFinite) || plan.width <= 0 || plan.depth <= 0) {
    throw new RangeError('Les dimensions du plateau sont invalides.')
  }
  const box = envelope(station)
  const xRadius = projectedRadius(box, [1, 0])
  const zRadius = projectedRadius(box, [0, 1])
  if (xRadius * 2 > plan.width + epsilon || zRadius * 2 > plan.depth + epsilon) {
    throw new RangeError('Ce mobilier ne tient pas dans le plateau.')
  }
  const boundedX = Math.max(-plan.width / 2 + xRadius, Math.min(plan.width / 2 - xRadius, box.center[0]))
  const boundedZ = Math.max(-plan.depth / 2 + zRadius, Math.min(plan.depth / 2 - zRadius, box.center[1]))
  // Preserve unchanged coordinates exactly, and avoid cancellation for far-away inputs.
  const x = boundedX === box.center[0] ? station.position[0] : boundedX - box.axes[1][0] * box.localOffset
  const z = boundedZ === box.center[1] ? station.position[2] : boundedZ - box.axes[1][1] * box.localOffset
  const rotation = normalizeRotation(station.rotation)
  if (x === station.position[0] && z === station.position[2] && station.position[1] === 0 && rotation === station.rotation) return station
  return { ...station, position: [x, 0, z], rotation }
}

export function clampWorkstation(plan: PlanBounds, station: Workstation): Workstation {
  return clampItem(plan, station)
}

export function clampFurniture(plan: PlanBounds, item: FurnitureItem): FurnitureItem {
  return clampItem(plan, item)
}

function roundToGrid(coordinate: number, stepsPerMetre: number): number {
  const scaled = coordinate * stepsPerMetre
  return Number.isFinite(scaled) ? Math.round(scaled) / stepsPerMetre : coordinate
}

function snapItem<T extends PlanItem>(plan: PlanBounds, station: T, enabled: boolean): T {
  const candidate: T = enabled
    ? { ...station, position: [roundToGrid(station.position[0], 4), 0, roundToGrid(station.position[2], 4)] }
    : station
  return clampItem(plan, candidate)
}

export function snapWorkstation(plan: PlanBounds, station: Workstation, enabled = true): Workstation {
  return snapItem(plan, station, enabled)
}

export function snapFurniture(plan: PlanBounds, item: FurnitureItem, enabled = true): FurnitureItem {
  return snapItem(plan, item, enabled)
}

export function mixedOverlaps(first: PlanItem, second: PlanItem): boolean {
  const a = envelope(first)
  const b = envelope(second)
  const difference: Point = [b.center[0] - a.center[0], b.center[1] - a.center[1]]
  for (const axis of [...a.axes, ...b.axes]) {
    if (Math.abs(dot(difference, axis)) >= projectedRadius(a, axis) + projectedRadius(b, axis) - epsilon) return false
  }
  return true
}

export function overlaps(first: Workstation, second: Workstation): boolean {
  return mixedOverlaps(first, second)
}

function freePlacement<T extends PlanItem>(plan: SpatialPlan, template: T): T | null {
  const candidates = new Map<string, T>()
  function add(x: number, z: number) {
    const candidate = clampItem(plan, { ...template, position: [x, 0, z] })
    candidates.set(`${candidate.position[0]},${candidate.position[2]}`, candidate)
  }
  // Include the desired point, then explore the room on a half-metre grid.
  add(roundToGrid(template.position[0], 2), roundToGrid(template.position[2], 2))
  for (let x = Math.ceil(-plan.width) / 2; x <= plan.width / 2 + epsilon; x += 0.5) {
    for (let z = Math.ceil(-plan.depth) / 2; z <= plan.depth / 2 + epsilon; z += 0.5) add(x, z)
  }
  const distance = (station: T) => (station.position[0] - template.position[0]) ** 2
    + (station.position[2] - template.position[2]) ** 2
  const ordered = [...candidates.values()].sort((a, b) => distance(a) - distance(b))
  const occupants: PlanItem[] = [...plan.workstations, ...plan.furniture]
  return ordered.find((candidate) => !occupants.some((item) => mixedOverlaps(candidate, item))) ?? null
}

export function findFreePlacement(plan: SpatialPlan, template: Workstation): Workstation | null {
  return freePlacement(plan, template)
}

export function findFreeFurniturePlacement(plan: SpatialPlan, template: FurnitureItem): FurnitureItem | null {
  return freePlacement(plan, template)
}
