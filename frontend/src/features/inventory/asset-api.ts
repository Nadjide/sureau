import { assetsSchema, type Asset } from './asset-schema'

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

export async function getAssets(
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<Asset[]> {
  signal.throwIfAborted()

  let response: Response

  try {
    response = await fetcher('/api/assets', {
      headers: { Accept: 'application/json' },
      signal,
    })
  } catch {
    signal.throwIfAborted()
    throw new AssetApiError(
      'network',
      'Impossible de joindre l’inventaire. Vérifiez la connexion puis réessayez.',
    )
  }

  signal.throwIfAborted()

  if (!response.ok) {
    throw new AssetApiError(
      'http',
      response.status >= 500
        ? 'Le service d’inventaire est momentanément indisponible. Réessayez dans un instant.'
        : 'Le service n’a pas pu charger l’inventaire. Réessayez dans un instant.',
      response.status,
    )
  }

  let payload: unknown

  try {
    payload = await response.json()
  } catch {
    signal.throwIfAborted()
    throw new AssetApiError(
      'invalid-response',
      'L’inventaire a renvoyé une réponse illisible. Réessayez dans un instant.',
    )
  }

  signal.throwIfAborted()
  const result = assetsSchema.safeParse(payload)

  if (!result.success) {
    throw new AssetApiError(
      'invalid-response',
      'Les données reçues ne correspondent pas à un inventaire valide.',
    )
  }

  return result.data
}
