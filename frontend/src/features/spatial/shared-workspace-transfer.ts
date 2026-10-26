import { defaultPlan } from './plan-document'
import { createEmptyPlan, createExamplePlan } from './plan-transfer'
import { parseSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { createWorkspaceFromPlan } from './workspace-document'
import { msg, t } from '@/lib/i18n'

export type InitialWorkspaceKind = 'empty' | 'example'

export interface SpatialTransferResult {
  draft: SpatialDraft
  hasLocations: boolean
  kind: 'snapshot' | 'workspace'
}

export const spatialTransferFileSizeLimit = 8_000_000

const encoder = new TextEncoder()
const invalidTransferMessage = msg('Ce fichier spatial est invalide ou utilise un format incompatible. Aucun changement n’a été appliqué.')

function checkFileSize(raw: string): void {
  if (encoder.encode(raw).byteLength > spatialTransferFileSizeLimit) {
    throw new Error(t('Ce fichier spatial est trop volumineux. La limite est de 8 Mo.'))
  }
}

function requireCompleteSnapshot(workspace: unknown): void {
  if (typeof workspace !== 'object' || workspace === null || !('rooms' in workspace) || !Array.isArray(workspace.rooms)) {
    throw new Error(t(invalidTransferMessage))
  }
  for (const room of workspace.rooms) {
    if (typeof room !== 'object' || room === null || !('plan' in room)
      || typeof room.plan !== 'object' || room.plan === null
      || !Object.hasOwn(room.plan, 'display') || !Object.hasOwn(room.plan, 'furniture')) {
      throw new Error(t(invalidTransferMessage))
    }
  }
}

/** Read an explicit user import; a legacy layout never fabricates inventory associations. */
export function parseSpatialTransfer(raw: string): SpatialTransferResult {
  if (typeof raw !== 'string') throw new Error(t(invalidTransferMessage))
  checkFileSize(raw)
  let payload: unknown
  try { payload = JSON.parse(raw) } catch { throw new Error(t(invalidTransferMessage)) }
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) throw new Error(t(invalidTransferMessage))

  if (Object.hasOwn(payload, 'format')) {
    const snapshot = payload as Record<string, unknown>
    if (Object.keys(snapshot).length !== 4 || snapshot.format !== 'sureau-spatial' || !Object.hasOwn(snapshot, 'version') || snapshot.version !== 1
      || !Object.hasOwn(snapshot, 'workspace') || !Object.hasOwn(snapshot, 'locations')) {
      throw new Error(t(invalidTransferMessage))
    }
    requireCompleteSnapshot(snapshot.workspace)
    return {
      draft: parseSpatialDraft({ workspace: snapshot.workspace, locations: snapshot.locations }),
      hasLocations: true,
      kind: 'snapshot',
    }
  }

  return { draft: parseSpatialDraft({ workspace: payload, locations: {} }), hasLocations: false, kind: 'workspace' }
}

/** Choosing to restore links is separate from importing a layout, since asset IDs belong to an instance. */
export function applySpatialTransfer(current: SpatialDraft, incoming: SpatialTransferResult, includeLocations: boolean): SpatialDraft {
  if (typeof includeLocations !== 'boolean'
    || (incoming.kind !== 'snapshot' && incoming.kind !== 'workspace')
    || incoming.hasLocations !== (incoming.kind === 'snapshot')) {
    throw new Error(t(invalidTransferMessage))
  }
  if (includeLocations && !incoming.hasLocations) {
    throw new Error(t('Cet ancien fichier d’espace ne contient aucune localisation à restaurer.'))
  }
  const imported = parseSpatialDraft(incoming.draft)
  if (includeLocations) return imported
  const preserved = parseSpatialDraft(current)
  return { workspace: imported.workspace, locations: preserved.locations }
}

export function createInitialSpatialDraft(kind: InitialWorkspaceKind): SpatialDraft {
  const plan = kind === 'empty'
    ? { ...createEmptyPlan(defaultPlan), id: 'room-01', name: t('Salle 01') }
    : createExamplePlan()
  const workspace = createWorkspaceFromPlan(plan)
  workspace.name = t('Notre espace')
  return parseSpatialDraft({ workspace, locations: {} })
}

/** A portable spatial draft, including unresolved links. Inventory and accounts remain in the database. */
export function serializeSpatialDraft(draft: SpatialDraft): string {
  const validated = parseSpatialDraft(draft)
  const snapshot = { format: 'sureau-spatial', version: 1, ...validated }
  const pretty = `${JSON.stringify(snapshot, null, 2)}\n`
  if (encoder.encode(pretty).byteLength <= spatialTransferFileSizeLimit) return pretty
  const compact = JSON.stringify(snapshot)
  checkFileSize(compact)
  return compact
}
