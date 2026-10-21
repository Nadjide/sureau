import { z } from 'zod'
import { room, workstations, type SpatialPlan } from './room-model'
import { clampWorkstation } from './plan-geometry'

export type { SpatialPlan } from './room-model'

export interface PlanStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface PlanPersistence {
  warning: string | null
  persisted: boolean
  canPersist: boolean
}

export interface LoadedPlan extends PlanPersistence {
  plan: SpatialPlan
}

export const planStorageKey = 'sentinel-plan-v1'
export const planFileSizeLimit = 256_000

export const defaultPlan: SpatialPlan = {
  version: 1,
  ...room,
  colors: {
    floor: '#e6e7e5',
    wall: '#e4e8ed',
    desk: '#d4b38c',
    accent: '#447cde',
  },
  display: { walls: true, decor: true },
  workstations: workstations.map((station) => ({ ...station, position: [...station.position] })),
}

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/)
const name = z.string().trim().min(1).max(60)
const finite = z.number().finite()

const workstationSchema = z.strictObject({
  id: z.string().regex(/^desk-[a-z0-9-]{2,80}$/),
  label: name,
  position: z.tuple([finite, z.literal(0), finite]),
  rotation: finite.min(0).max(Math.PI * 2),
  width: finite.min(0.8).max(3),
  depth: finite.min(0.5).max(1.5),
  color: color.nullable(),
})

const planSchema = z.strictObject({
  version: z.literal(1),
  id: z.literal(room.id),
  name,
  width: finite.min(6).max(50),
  depth: finite.min(6).max(50),
  colors: z.strictObject({ floor: color, wall: color, desk: color, accent: color }),
  display: z.strictObject({ walls: z.boolean(), decor: z.boolean() }).default({ walls: true, decor: true }),
  workstations: z.array(workstationSchema).max(64),
}).superRefine((plan, context) => {
  const ids = new Set<string>()
  for (const [index, station] of plan.workstations.entries()) {
    if (ids.has(station.id)) {
      context.addIssue({ code: 'custom', path: ['workstations', index, 'id'], message: 'Identifiant de poste dupliqué.' })
    }
    ids.add(station.id)

    try {
      const bounded = clampWorkstation(plan, station)
      if (Math.abs(bounded.position[0] - station.position[0]) > 1e-6
        || Math.abs(bounded.position[2] - station.position[2]) > 1e-6) {
        context.addIssue({ code: 'custom', path: ['workstations', index, 'position'], message: 'Le poste ou son fauteuil dépasse les limites du plateau.' })
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['workstations', index, 'position'], message: 'Les dimensions ou la position du poste sont invalides.' })
    }
  }
})

const invalidStorageWarning =
  'Le plan enregistré est illisible ou incompatible. Il a été conservé. Vos modifications restent limitées à cette session.'
const unavailableStorageWarning =
  'Le stockage local est inaccessible. Le plan reste disponible uniquement pendant cette session.'

function freshDefaultPlan(): SpatialPlan {
  return {
    ...defaultPlan,
    colors: { ...defaultPlan.colors },
    display: { ...defaultPlan.display },
    workstations: defaultPlan.workstations.map((station) => ({ ...station, position: [...station.position] })),
  }
}

export function parsePlan(raw: string): SpatialPlan {
  if (new TextEncoder().encode(raw).byteLength > planFileSizeLimit) throw new Error('Ce fichier de plan est trop volumineux.')
  try {
    const payload: unknown = JSON.parse(raw)
    return planSchema.parse(payload)
  } catch {
    throw new Error('Ce plan est invalide ou utilise un format incompatible. Aucun changement n’a été appliqué.')
  }
}

export function loadPlan(storage: PlanStorage | null): LoadedPlan {
  let raw: string | null
  try {
    if (storage === null) throw new Error('Storage unavailable')
    raw = storage.getItem(planStorageKey)
  } catch {
    return { plan: freshDefaultPlan(), warning: unavailableStorageWarning, persisted: false, canPersist: false }
  }

  if (raw === null) {
    return { plan: freshDefaultPlan(), warning: null, persisted: true, canPersist: true }
  }
  try {
    return { plan: parsePlan(raw), warning: null, persisted: true, canPersist: true }
  } catch {
    return { plan: freshDefaultPlan(), warning: invalidStorageWarning, persisted: false, canPersist: false }
  }
}

export function savePlan(storage: PlanStorage | null, plan: SpatialPlan): PlanPersistence {
  if (storage === null) {
    return { warning: unavailableStorageWarning, persisted: false, canPersist: false }
  }

  let serialized: string
  try {
    serialized = JSON.stringify(parsePlan(JSON.stringify(plan)))
  } catch {
    return { warning: 'Ce plan est invalide et n’a pas été enregistré.', persisted: false, canPersist: false }
  }

  const current = loadPlan(storage)
  if (!current.canPersist) return { warning: current.warning, persisted: false, canPersist: false }

  try {
    storage.setItem(planStorageKey, serialized)
    return { warning: null, persisted: true, canPersist: true }
  } catch {
    return {
      warning: 'L’enregistrement local du plan a échoué. Vos modifications restent disponibles pendant cette session.',
      persisted: false,
      canPersist: true,
    }
  }
}
