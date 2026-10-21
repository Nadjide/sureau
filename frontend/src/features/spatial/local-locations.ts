import { z } from 'zod'
import { room } from './room-model'

export type LocalLocations = Readonly<Record<number, string>>

export interface LocationStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
}

export interface LocationPersistence {
  warning: string | null
  persisted: boolean
  canPersist: boolean
}

export interface LoadedLocations extends LocationPersistence {
  locations: LocalLocations
}

export const locationStorageKey = 'sentinel-locations-v1'

const emptyLocations: LocalLocations = Object.freeze({})
const validWorkstationId = /^desk-[a-z0-9-]{2,80}$/
const invalidStorageWarning =
  'Les localisations enregistrées sont illisibles ou incompatibles. Elles ont été conservées. Vos modifications restent limitées à cette session.'
const unavailableStorageWarning =
  'Le stockage local est inaccessible. Les localisations restent disponibles uniquement pendant cette session.'

function isAssetId(assetId: number): boolean {
  return Number.isSafeInteger(assetId) && assetId > 0
}

function isAssetKey(key: string): boolean {
  const assetId = Number(key)
  return isAssetId(assetId) && String(assetId) === key
}

function isLocalLocations(value: unknown): value is LocalLocations {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false

  const prototype: unknown = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false

  return Object.entries(value).every(
    ([key, stationId]) => isAssetKey(key) && typeof stationId === 'string' && validWorkstationId.test(stationId),
  )
}

const storedLocationsSchema = z.object({
  version: z.literal(1),
  planId: z.literal(room.id),
  associations: z.custom<LocalLocations>(isLocalLocations),
})

export function decodeLocations(raw: string | null): LoadedLocations {
  if (raw === null) {
    return { locations: emptyLocations, warning: null, persisted: true, canPersist: true }
  }

  try {
    const payload: unknown = JSON.parse(raw)
    const result = storedLocationsSchema.safeParse(payload)

    if (result.success) {
      return {
        locations: Object.freeze({ ...result.data.associations }),
        warning: null,
        persisted: true,
        canPersist: true,
      }
    }
  } catch {
    // A malformed snapshot remains untouched so it can be recovered later.
  }

  return {
    locations: emptyLocations,
    warning: invalidStorageWarning,
    persisted: false,
    canPersist: false,
  }
}

export function loadLocations(storage: LocationStorage | null): LoadedLocations {
  try {
    if (storage !== null) return decodeLocations(storage.getItem(locationStorageKey))
  } catch {
    // Browser privacy settings can deny reads as well as writes.
  }

  return {
    locations: emptyLocations,
    warning: unavailableStorageWarning,
    persisted: false,
    canPersist: false,
  }
}

export function saveLocations(
  storage: LocationStorage | null,
  locations: LocalLocations,
): LocationPersistence {
  if (storage === null) {
    return { warning: unavailableStorageWarning, persisted: false, canPersist: false }
  }

  if (!isLocalLocations(locations)) {
    return {
      warning: 'Ces localisations sont invalides et n’ont pas été enregistrées.',
      persisted: false,
      canPersist: false,
    }
  }

  const current = loadLocations(storage)
  if (!current.canPersist) {
    return { warning: current.warning, persisted: false, canPersist: false }
  }

  try {
    storage.setItem(
      locationStorageKey,
      JSON.stringify({ version: 1, planId: room.id, associations: locations }),
    )
    return { warning: null, persisted: true, canPersist: true }
  } catch {
    return {
      warning: 'L’enregistrement local a échoué. Vos modifications restent disponibles pendant cette session.',
      persisted: false,
      canPersist: true,
    }
  }
}

export function updateLocation(
  locations: LocalLocations,
  assetId: number,
  workstationId: string | null,
): LocalLocations {
  if (!isAssetId(assetId) || !isLocalLocations(locations)) {
    throw new RangeError('L’identifiant du matériel ou les localisations sont invalides.')
  }

  if (workstationId !== null && !validWorkstationId.test(workstationId)) {
    throw new RangeError('Cet identifiant de poste est invalide.')
  }

  if (workstationId === null && !Object.hasOwn(locations, assetId)) return locations
  if (workstationId !== null && locations[assetId] === workstationId) return locations

  const next = { ...locations }

  if (workstationId === null) delete next[assetId]
  else next[assetId] = workstationId

  return Object.freeze(next)
}

export function getWorkstationAssetIds(locations: LocalLocations, workstationId: string): number[] {
  return Object.entries(locations)
    .filter(([, stationId]) => stationId === workstationId)
    .map(([assetId]) => Number(assetId))
    .sort((first, second) => first - second)
}
