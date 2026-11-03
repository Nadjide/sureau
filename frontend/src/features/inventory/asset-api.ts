import { assetsSchema, type Asset } from './asset-schema'
import { ApiError, apiClient } from '@/lib/api-client'

export type AssetApiErrorKind = 'network' | 'http' | 'invalid-response'

export class AssetApiError extends Error {
  readonly kind: AssetApiErrorKind
  readonly status: number | null

  constructor(kind: AssetApiErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'AssetApiError'
    this.kind = kind
    this.status = status
  }
}

export async function getAssets(signal: AbortSignal, fetcher: typeof fetch = fetch): Promise<Asset[]> {
  try {
    return await apiClient.requestJson('/api/assets', (payload) => assetsSchema.parse(payload), { signal, fetcher })
  } catch (error) {
    signal.throwIfAborted()
    if (error instanceof ApiError) throw new AssetApiError(error.kind, error.message, error.status)
    throw error
  }
}
