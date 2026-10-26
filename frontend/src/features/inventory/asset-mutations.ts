import { ApiError, apiClient, type createApiClient } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import { assetInputSchema, type AssetInput } from './asset-input'
import { assetSchema, type Asset } from './asset-schema'
import { z } from 'zod'

const assetIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
const revisionSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

function matchingAsset(payload: unknown, id: number): Asset {
  const asset = assetSchema.parse(payload)
  if (asset.id !== id) throw new Error('The server returned a different asset.')
  return asset
}

export async function getAsset(id: number, signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<Asset> {
  assetIdSchema.parse(id)
  return client.requestJson(`/api/assets/${id}`, (payload) => matchingAsset(payload, id), signal ? { signal } : {})
}

export async function retireAsset(id: number, revision: number, signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<Asset> {
  assetIdSchema.parse(id)
  revisionSchema.parse(revision)
  try {
    return await client.requestJson(`/api/assets/${id}/retire`, (payload) => {
      const asset = matchingAsset(payload, id)
      if (asset.status !== 'RETIRED' || asset.revision <= revision) throw new Error('The server did not confirm the retirement.')
      return asset
    }, { method: 'PATCH', ifMatch: revision, ...(signal ? { signal } : {}) })
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
      throw new ApiError(error.kind, t('Le retrait n’a pas pu être confirmé. Actualisez la fiche du serveur pour vérifier son état avant de réessayer.'), error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}

export async function updateAsset(id: number, revision: number, input: AssetInput, signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<Asset> {
  assetIdSchema.parse(id)
  revisionSchema.parse(revision)
  const payload = assetInputSchema.parse(input)
  try {
    return await client.requestJson(`/api/assets/${id}`, (response) => matchingAsset(response, id), {
      method: 'PUT', ifMatch: revision, json: payload, ...(signal ? { signal } : {}),
    })
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
      throw new ApiError(error.kind, t('La modification n’a pas pu être confirmée. Rechargez la fiche du serveur pour vérifier son état avant de réessayer.'), error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}

export async function createAsset(input: AssetInput, signal?: AbortSignal,
  client: ReturnType<typeof createApiClient> = apiClient): Promise<Asset> {
  const payload = assetInputSchema.parse(input)
  try {
    return await client.requestJson('/api/assets', (response) => assetSchema.parse(response), {
      method: 'POST', json: payload, ...(signal ? { signal } : {}),
    })
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
      throw new ApiError(error.kind, t('L’enregistrement n’a pas pu être confirmé. Actualisez l’inventaire avant de réessayer pour vérifier si le matériel a été créé.'), error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}
