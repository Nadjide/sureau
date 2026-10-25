import { legacyStorageKeys, storageKeys } from '@/lib/browser-storage'
import { decodeLocations } from './local-locations'
import { parsePlan } from './plan-document'
import { parseSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { createWorkspaceFromPlan, parseWorkspace } from './workspace-document'

const recoveryKeys = [
  storageKeys.workspace, legacyStorageKeys.workspace,
  storageKeys.plan, legacyStorageKeys.plan,
  storageKeys.locations, legacyStorageKeys.locations,
] as const

export type LocalRecoveryKey = typeof recoveryKeys[number]
export type LocalRecoveryEntries = Readonly<Partial<Record<LocalRecoveryKey, string>>>

export interface RecoveryStorage {
  getItem: (key: string) => string | null
}

interface InspectionBase {
  rawEntries: LocalRecoveryEntries
  warning: string | null
  sourceKey: LocalRecoveryKey | null
}

export type LocalWorkspaceInspection =
  | InspectionBase & {
    phase: 'ready'
    draft: SpatialDraft
    sourceKey: LocalRecoveryKey
    hasLocations: boolean
    locationsValid: boolean
  }
  | InspectionBase & {
    phase: 'absent' | 'unavailable' | 'invalid'
    draft: null
    hasLocations: false
    locationsValid: false
  }

const unavailableWarning = 'Le stockage de ce navigateur n’a pas pu être lu entièrement. Aucune récupération n’a été préparée. Les valeurs déjà lues restent disponibles dans la copie brute.'
const invalidGeometryWarning = 'L’espace ou le plan local prioritaire est illisible ou incompatible. Il a été conservé sans utiliser une autre version à sa place. Exportez la copie brute pour le récupérer séparément.'
const invalidLocationsWarning = 'Les localisations locales sont illisibles ou incompatibles. Elles restent dans la copie brute. Vous pouvez récupérer uniquement l’implantation, sans importer ces liens.'

function incomplete(phase: 'absent' | 'unavailable' | 'invalid', rawEntries: LocalRecoveryEntries,
  warning: string | null, sourceKey: LocalRecoveryKey | null = null): LocalWorkspaceInspection {
  return { phase, draft: null, hasLocations: false, locationsValid: false, rawEntries, warning, sourceKey }
}

function firstPresent(entries: LocalRecoveryEntries, keys: readonly LocalRecoveryKey[]): LocalRecoveryKey | null {
  return keys.find((key) => Object.hasOwn(entries, key)) ?? null
}

/** Read only the historical spatial keys, and only when recovery is explicitly requested. */
export function inspectLocalWorkspace(storage: RecoveryStorage | null): LocalWorkspaceInspection {
  const collected: Partial<Record<LocalRecoveryKey, string>> = {}
  if (storage === null) return incomplete('unavailable', Object.freeze(collected), unavailableWarning)

  let unavailable = false
  for (const key of recoveryKeys) {
    try {
      const raw = storage.getItem(key)
      if (typeof raw === 'string') collected[key] = raw
      else if (raw !== null) unavailable = true
    } catch { unavailable = true }
  }
  const rawEntries: LocalRecoveryEntries = Object.freeze(collected)
  if (unavailable) return incomplete('unavailable', rawEntries, unavailableWarning)
  if (Object.keys(rawEntries).length === 0) return incomplete('absent', rawEntries, null)

  const workspaceKey = firstPresent(rawEntries, [storageKeys.workspace, legacyStorageKeys.workspace])
  const planKey = firstPresent(rawEntries, [storageKeys.plan, legacyStorageKeys.plan])
  const sourceKey = workspaceKey ?? planKey
  if (sourceKey === null) {
    return incomplete('invalid', rawEntries,
      'Des localisations locales sont présentes, mais aucun espace ni plan n’a été trouvé. Aucun exemple n’a été créé. Exportez la copie brute pour conserver ces données.')
  }

  let geometry: SpatialDraft
  try {
    const raw = rawEntries[sourceKey]!
    const workspace = workspaceKey !== null ? parseWorkspace(raw) : createWorkspaceFromPlan(parsePlan(raw))
    geometry = parseSpatialDraft({ workspace, locations: {} })
  } catch {
    return incomplete('invalid', rawEntries, invalidGeometryWarning, sourceKey)
  }

  const locationsKey = firstPresent(rawEntries, [storageKeys.locations, legacyStorageKeys.locations])
  if (locationsKey === null) {
    return { phase: 'ready', draft: geometry, hasLocations: false, locationsValid: true, warning: null, sourceKey, rawEntries }
  }

  try {
    const decoded = decodeLocations(rawEntries[locationsKey]!)
    if (!decoded.canPersist || decoded.warning !== null) throw new Error('Invalid local locations.')
    const draft = parseSpatialDraft({ workspace: geometry.workspace, locations: decoded.locations })
    return { phase: 'ready', draft, hasLocations: true, locationsValid: true, warning: null, sourceKey, rawEntries }
  } catch {
    return { phase: 'ready', draft: geometry, hasLocations: true, locationsValid: false,
      warning: invalidLocationsWarning, sourceKey, rawEntries }
  }
}

/** Preserve exact spatial strings for manual recovery, excluding theme, credentials and unrelated keys. */
export function serializeLocalRecovery(source: LocalWorkspaceInspection | Readonly<Record<string, unknown>>): string {
  const inspectionEntries = 'rawEntries' in source ? source.rawEntries : null
  const input = typeof inspectionEntries === 'object' && inspectionEntries !== null ? inspectionEntries : source
  const entries: Partial<Record<LocalRecoveryKey, string>> = {}
  for (const key of recoveryKeys) {
    const property = Object.getOwnPropertyDescriptor(input, key)
    if (!property) continue
    if (!Object.hasOwn(property, 'value') || typeof property.value !== 'string') {
      throw new Error('La copie brute ne peut pas être préparée : une valeur spatiale est invalide.')
    }
    entries[key] = property.value
  }
  return `${JSON.stringify({ format: 'sureau-local-recovery', version: 1, entries }, null, 2)}\n`
}
