import { numberedFurnitureLabel } from './furniture-catalog'
import { defaultPlan, parsePlan, planFileSizeLimit, type SpatialPlan } from './plan-document'
import { t } from '@/lib/i18n'

export function serializePlan(plan: SpatialPlan): string {
  const validated = parsePlan(JSON.stringify(plan))
  const serialized = `${JSON.stringify(validated, null, 2)}\n`
  if (new TextEncoder().encode(serialized).byteLength > planFileSizeLimit) {
    throw new Error(t('Ce fichier de plan est trop volumineux.'))
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

/** The example, its names written in the current language. */
export function createExamplePlan(): SpatialPlan {
  const plan = parsePlan(JSON.stringify(defaultPlan))
  const counts = new Map<string, number>()
  return {
    ...plan,
    name: t(plan.name),
    workstations: plan.workstations.map((station, index) => ({ ...station, label: workstationLabel(index + 1) })),
    furniture: plan.furniture.map((item) => {
      const number = (counts.get(item.kind) ?? 0) + 1
      counts.set(item.kind, number)
      return { ...item, label: numberedFurnitureLabel(item.kind, number) }
    }),
  }
}

/** «Poste 01», in the current language. */
export function workstationLabel(number: number): string {
  return t('Poste {number}', { number: String(number).padStart(2, '0') })
}
