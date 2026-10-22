import { readStoredValue, storageKeys } from '@/lib/browser-storage'
import { z } from 'zod'
import { room, workstations, type SpatialPlan } from './room-model'
import { clampFurniture, clampWorkstation } from './plan-geometry'
import { initialFurniture } from './furniture-catalog'

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

export const planStorageKey = storageKeys.plan
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
  furniture: initialFurniture(room.width, room.depth),
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

const furnitureSchema = z.strictObject({
  id: z.string().regex(/^furniture-[a-z0-9-]{2,80}$/),
  kind: z.enum(['table', 'cabinet', 'plant', 'partition', 'sofa']),
  label: name,
  position: z.tuple([finite, z.literal(0), finite]),
  rotation: finite.min(0).max(Math.PI * 2),
  width: finite.min(0.2).max(6),
  depth: finite.min(0.08).max(4),
  height: finite.min(0.15).max(3.5),
  color,
})

const planSchema = z.strictObject({
  version: z.literal(1),
  id: z.union([z.literal(room.id), z.string().regex(/^room-[a-z0-9-]{2,80}$/)]),
  name,
  width: finite.min(6).max(50),
  depth: finite.min(6).max(50),
  colors: z.strictObject({ floor: color, wall: color, desk: color, accent: color }),
  display: z.strictObject({ walls: z.boolean(), decor: z.boolean() }).default({ walls: true, decor: true }),
  workstations: z.array(workstationSchema).max(64),
  furniture: z.array(furnitureSchema).max(64).default([]),
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
  for (const [index, item] of plan.furniture.entries()) {
    if (ids.has(item.id)) {
      context.addIssue({ code: 'custom', path: ['furniture', index, 'id'], message: 'Identifiant de mobilier dupliqué.' })
    }
    ids.add(item.id)
    try {
      const bounded = clampFurniture(plan, item)
      if (Math.abs(bounded.position[0] - item.position[0]) > 1e-6
        || Math.abs(bounded.position[2] - item.position[2]) > 1e-6) {
        context.addIssue({ code: 'custom', path: ['furniture', index, 'position'], message: 'Le mobilier dépasse les limites du plateau.' })
      }
    } catch {
      context.addIssue({ code: 'custom', path: ['furniture', index, 'position'], message: 'Les dimensions ou la position du mobilier sont invalides.' })
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
    furniture: defaultPlan.furniture.map((item) => ({ ...item, position: [...item.position] })),
  }
}

export function parsePlan(raw: string): SpatialPlan {
  if (new TextEncoder().encode(raw).byteLength > planFileSizeLimit) throw new Error('Ce fichier de plan est trop volumineux.')
  try {
    let payload: unknown = JSON.parse(raw)
    if (typeof payload === 'object' && payload !== null && !Array.isArray(payload) && !Object.hasOwn(payload, 'furniture')) {
      const legacy = payload as Record<string, unknown>
      if (typeof legacy.width === 'number' && typeof legacy.depth === 'number'
        && legacy.width >= 6 && legacy.width <= 50 && legacy.depth >= 6 && legacy.depth <= 50) {
        payload = { ...legacy, furniture: initialFurniture(legacy.width, legacy.depth) }
      }
    }
    return planSchema.parse(payload)
  } catch {
    throw new Error('Ce plan est invalide ou utilise un format incompatible. Aucun changement n’a été appliqué.')
  }
}

export function loadPlan(storage: PlanStorage | null): LoadedPlan {
  let raw: string | null
  try {
    if (storage === null) throw new Error('Storage unavailable')
    raw = readStoredValue(storage, 'plan')
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
