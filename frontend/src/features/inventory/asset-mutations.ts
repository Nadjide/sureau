import { ApiError, apiClient, type createApiClient } from '@/lib/api-client'
import { assetInputSchema, type AssetInput } from './asset-input'
import { assetSchema, type Asset } from './asset-schema'

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
      throw new ApiError(error.kind, 'L’enregistrement n’a pas pu être confirmé. Actualisez l’inventaire avant de réessayer pour vérifier si le matériel a été créé.', error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}
