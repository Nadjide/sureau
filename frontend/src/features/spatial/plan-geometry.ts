import type { SpatialPlan, Workstation } from './room-model'

type Point = readonly [number, number]

interface Envelope {
  center: Point
  axes: readonly [Point, Point]
  halfWidth: number
  halfDepth: number
}

const epsilon = 1e-7
const fullTurn = Math.PI * 2

export function normalizeRotation(radians: number): number {
  if (!Number.isFinite(radians)) throw new RangeError('La rotation doit être un nombre fini.')
  const rotation = radians % fullTurn
  const positive = rotation < 0 ? rotation + fullTurn : rotation
  return positive === 0 || positive >= fullTurn ? 0 : positive
}

function envelope(station: Workstation): Envelope {
  if (![...station.position, station.width, station.depth].every(Number.isFinite)
    || station.width <= 0 || station.depth <= 0) {
    throw new RangeError('Les dimensions et coordonnées du poste sont invalides.')
  }
  const rotation = normalizeRotation(station.rotation)
  const cosine = Math.cos(rotation)
  const sine = Math.sin(rotation)
  // The chair extends the local footprint from -0.5 to +1.3 times desk depth.
  return {
    center: [station.position[0] + sine * 0.4 * station.depth, station.position[2] + cosine * 0.4 * station.depth],
    axes: [[cosine, -sine], [sine, cosine]],
    halfWidth: station.width / 2,
    halfDepth: station.depth * 0.9,
  }
}

function dot(first: Point, second: Point): number {
  return first[0] * second[0] + first[1] * second[1]
}

function projectedRadius(box: Envelope, axis: Point): number {
  return Math.abs(dot(box.axes[0], axis)) * box.halfWidth
    + Math.abs(dot(box.axes[1], axis)) * box.halfDepth
}

export function clampWorkstation(plan: SpatialPlan, station: Workstation): Workstation {
  if (![plan.width, plan.depth].every(Number.isFinite) || plan.width <= 0 || plan.depth <= 0) {
    throw new RangeError('Les dimensions du plateau sont invalides.')
  }
  const box = envelope(station)
  const xRadius = projectedRadius(box, [1, 0])
  const zRadius = projectedRadius(box, [0, 1])
  if (xRadius * 2 > plan.width + epsilon || zRadius * 2 > plan.depth + epsilon) {
    throw new RangeError('Le poste et son fauteuil ne tiennent pas dans le plateau.')
  }
  const boundedX = Math.max(-plan.width / 2 + xRadius, Math.min(plan.width / 2 - xRadius, box.center[0]))
  const boundedZ = Math.max(-plan.depth / 2 + zRadius, Math.min(plan.depth / 2 - zRadius, box.center[1]))
  // Preserve unchanged coordinates exactly, and avoid cancellation for far-away inputs.
  const x = boundedX === box.center[0] ? station.position[0] : boundedX - box.axes[1][0] * 0.4 * station.depth
  const z = boundedZ === box.center[1] ? station.position[2] : boundedZ - box.axes[1][1] * 0.4 * station.depth
  const rotation = normalizeRotation(station.rotation)
  if (x === station.position[0] && z === station.position[2] && station.position[1] === 0 && rotation === station.rotation) return station
  return { ...station, position: [x, 0, z], rotation }
}

export function snapWorkstation(plan: SpatialPlan, station: Workstation, enabled = true): Workstation {
  const candidate: Workstation = enabled
    ? { ...station, position: [Math.round(station.position[0] * 4) / 4, 0, Math.round(station.position[2] * 4) / 4] }
    : station
  return clampWorkstation(plan, candidate)
}

export function overlaps(first: Workstation, second: Workstation): boolean {
  const a = envelope(first)
  const b = envelope(second)
  const difference: Point = [b.center[0] - a.center[0], b.center[1] - a.center[1]]
  for (const axis of [...a.axes, ...b.axes]) {
    if (Math.abs(dot(difference, axis)) >= projectedRadius(a, axis) + projectedRadius(b, axis) - epsilon) return false
  }
  return true
}

export function findFreePlacement(plan: SpatialPlan, template: Workstation): Workstation | null {
  const candidates = new Map<string, Workstation>()
  function add(x: number, z: number) {
    const candidate = clampWorkstation(plan, { ...template, position: [x, 0, z] })
    candidates.set(`${candidate.position[0]},${candidate.position[2]}`, candidate)
  }
  // Include the desired point, then explore the room on a half-metre grid.
  add(Math.round(template.position[0] * 2) / 2, Math.round(template.position[2] * 2) / 2)
  for (let x = Math.ceil(-plan.width) / 2; x <= plan.width / 2 + epsilon; x += 0.5) {
    for (let z = Math.ceil(-plan.depth) / 2; z <= plan.depth / 2 + epsilon; z += 0.5) add(x, z)
  }
  const distance = (station: Workstation) => (station.position[0] - template.position[0]) ** 2
    + (station.position[2] - template.position[2]) ** 2
  const ordered = [...candidates.values()].sort((a, b) => distance(a) - distance(b))
  return ordered.find((candidate) => !plan.workstations.some((station) => overlaps(candidate, station))) ?? null
}
