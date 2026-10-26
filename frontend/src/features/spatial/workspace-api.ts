import { z } from 'zod'
import { ApiError, apiClient, type createApiClient } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import { parseSpatialDraft, sameSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { workspaceFileSizeLimit } from './workspace-document'

export interface WorkspaceSnapshot extends SpatialDraft {
  revision: number
  updatedAt: string
}

const snapshotSchema = z.object({
  revision: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  workspace: z.unknown(),
  locations: z.unknown(),
  updatedAt: z.iso.datetime({ offset: true }),
})
const requestSizeLimit = 2_100_000
const encoder = new TextEncoder()

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Server documents are complete; legacy defaults belong only to an explicit local import. */
function completeWorkspace(value: unknown): void {
  if (!object(value) || !Array.isArray(value.rooms)) throw new Error('Invalid workspace response.')
  for (const room of value.rooms) {
    if (!object(room) || !object(room.plan) || !Object.hasOwn(room.plan, 'display')
      || room.plan.display === undefined || !Object.hasOwn(room.plan, 'furniture')
      || room.plan.furniture === undefined) throw new Error('Incomplete workspace response.')
  }
}

function decodeSnapshot(payload: unknown): WorkspaceSnapshot {
  const snapshot = snapshotSchema.parse(payload)
  completeWorkspace(snapshot.workspace)
  const draft = parseSpatialDraft({ workspace: snapshot.workspace, locations: snapshot.locations })
  return { ...draft, revision: snapshot.revision, updatedAt: snapshot.updatedAt }
}

export async function getWorkspace(signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<WorkspaceSnapshot | null> {
  signal?.throwIfAborted()
  try {
    return await client.requestJson('/api/workspace', decodeSnapshot, signal ? { signal } : {})
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && error.kind === 'http'
      && error.status === 404 && error.code === 'WORKSPACE_NOT_INITIALIZED') return null
    throw error
  }
}

export async function saveWorkspace(expectedRevision: number, draft: SpatialDraft, signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<WorkspaceSnapshot> {
  signal?.throwIfAborted()
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) {
    throw new RangeError(t('Une révision entière comprise entre 0 et la limite autorisée est requise.'))
  }
  const validated = parseSpatialDraft(draft)
  if (encoder.encode(JSON.stringify(validated.workspace)).byteLength > workspaceFileSizeLimit) {
    throw new RangeError(t('Cet espace de travail est trop volumineux. La limite est de 2 Mo.'))
  }
  const payload = { expectedRevision, workspace: validated.workspace, locations: validated.locations }
  if (encoder.encode(JSON.stringify(payload)).byteLength > requestSizeLimit) {
    throw new RangeError(t('L’espace et ses associations sont trop volumineux. La limite est de 2,1 Mo.'))
  }
  try {
    return await client.requestJson('/api/workspace', (response) => {
      const snapshot = decodeSnapshot(response)
      if (snapshot.revision !== expectedRevision + 1
        || !sameSpatialDraft({ workspace: snapshot.workspace, locations: snapshot.locations }, validated)) {
        throw new Error('The server did not confirm the saved workspace snapshot.')
      }
      return snapshot
    }, { method: 'PUT', json: payload, ...(signal ? { signal } : {}) })
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
      throw new ApiError(error.kind,
        t('L’enregistrement de l’espace n’a pas pu être confirmé. Rechargez la version du serveur pour vérifier son état avant de réessayer.'),
        error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}
