import { defaultPlan, parsePlan, planFileSizeLimit, type SpatialPlan } from './plan-document'

export function serializePlan(plan: SpatialPlan): string {
  const validated = parsePlan(JSON.stringify(plan))
  const serialized = `${JSON.stringify(validated, null, 2)}\n`
  if (new TextEncoder().encode(serialized).byteLength > planFileSizeLimit) {
    throw new Error('Ce fichier de plan est trop volumineux.')
  }
  return serialized
}

export function isSameRoomPlan(current: SpatialPlan, candidate: SpatialPlan): boolean {
  return serializePlan(current) === serializePlan({ ...candidate, id: current.id })
}

export function createEmptyPlan(source: SpatialPlan): SpatialPlan {
  const validated = parsePlan(JSON.stringify(source))
  return { ...validated, workstations: [], furniture: [] }
}

export function createExamplePlan(): SpatialPlan {
  return parsePlan(JSON.stringify(defaultPlan))
}
