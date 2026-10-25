import { describe, expect, it, vi } from 'vitest'
import { ApiError, createApiClient } from './api-client'

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(token = 'masked-token'): Response {
  return json({ token, headerName: 'X-CSRF-TOKEN' })
}

const decodeList = (payload: unknown): number[] => {
  if (!Array.isArray(payload) || payload.some((item) => typeof item !== 'number')) throw new Error('Invalid list')
  return payload as number[]
}

describe('client HTTP commun', () => {
  it('charge les données avec la session du même domaine sans demander de jeton pour une lecture', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json([]))
    const client = createApiClient(fetcher)

    await expect(client.requestJson('/api/assets', decodeList)).resolves.toEqual([])

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [path, init] = fetcher.mock.calls[0]!
    expect(path).toBe('/api/assets')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('Accept')).toBe('application/json')
    expect(new Headers(init?.headers).has('X-CSRF-TOKEN')).toBe(false)
  })

  it.each(['https://elsewhere.test/api/assets', '//elsewhere.test/api/assets', '/assets'])('refuse la destination %s avant tout envoi', async (path) => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createApiClient(fetcher)

    await expect(client.requestJson(path, decodeList)).rejects.toThrow('current origin')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('protège une mutation JSON avec le jeton CSRF obtenu de la session', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ revision: 2 }))
    const client = createApiClient(fetcher)

    await expect(client.requestJson('/api/workspace', (payload) => payload, {
      method: 'PUT', json: { expectedRevision: 1 },
    })).resolves.toEqual({ revision: 2 })

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/workspace'])
    const init = fetcher.mock.calls[1]![1]
    expect(init?.method).toBe('PUT')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('masked-token')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual({ expectedRevision: 1 })
  })

  it.each([401, 403])('signale un refus %i une seule fois sans rejouer la mutation', async (status) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED' }, status))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(client.requestVoid('/api/assets/42/retire', { method: 'PATCH' }))
      .rejects.toMatchObject({ kind: 'http', status })

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ status }))
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets/42/retire')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('permet de traiter un échec de connexion sans déclencher une expiration globale', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'INVALID_CREDENTIALS' }, 401))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(client.requestJson('/api/auth/me', (value) => value, { notifyAuthFailure: false }))
      .rejects.toMatchObject({ status: 401 })
    expect(listener).not.toHaveBeenCalled()
  })

  it('traduit les erreurs de champs sans exposer les messages techniques du serveur', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({
      code: 'VALIDATION_ERROR',
      detail: 'Internal validation details',
      errors: [
        { field: 'name', message: 'must not be blank' },
        { field: 'assetTag', message: 'size must be between 0 and 50' },
        { field: 'username', message: 'must match "[a-z]+"' },
        { field: 'purchaseDate', message: 'Unexpected server internals' },
      ],
    }, 400))
    const client = createApiClient(fetcher)

    await expect(client.requestJson('/api/assets', decodeList)).rejects.toMatchObject({
      kind: 'http', status: 400, code: 'VALIDATION_ERROR',
      message: 'Vérifiez les champs indiqués avant de réessayer.',
      fieldErrors: {
        name: 'Ce champ est obligatoire.', assetTag: 'Utilisez entre 0 et 50 caractères.',
        username: 'Utilisez le format demandé.', purchaseDate: 'Vérifiez la valeur de ce champ.',
      },
    })
  })

  it('conserve une panne HTTP même lorsque le proxy répond en HTML', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('<h1>Bad gateway</h1>', { status: 502 }))

    await expect(createApiClient(fetcher).requestJson('/api/assets', decodeList)).rejects.toMatchObject({
      kind: 'http', status: 502, code: null,
      message: 'Le service est momentanément indisponible. Réessayez dans un instant.',
    })
  })

  it.each([
    { label: 'HTML', response: () => new Response('<!doctype html><title>Sureau</title>') },
    { label: 'un contrat incompatible', response: () => json({ assets: [] }) },
  ])('refuse $label reçu comme succès', async ({ response }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())

    await expect(createApiClient(fetcher).requestJson('/api/assets', decodeList)).rejects.toMatchObject({
      kind: 'invalid-response', status: null,
    })
  })

  it('distingue une panne réseau d’un inventaire vide', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(createApiClient(fetcher).requestJson('/api/assets', decodeList)).rejects.toBeInstanceOf(ApiError)
    await expect(createApiClient(fetcher).requestJson('/api/assets', decodeList)).rejects.toMatchObject({ kind: 'network', status: null })
  })

  it('ne démarre aucune requête déjà annulée', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()

    await expect(createApiClient(fetcher).requestVoid('/api/auth/logout', { method: 'POST', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('transmet l’annulation en cours sans la transformer en panne réseau', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_path, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true })
    }))
    const pending = createApiClient(fetcher).requestJson('/api/assets', decodeList, { signal: controller.signal })
    controller.abort()

    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('ignore un refus tardif d’un transport annulé sans expirer une autre session', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort()
      return json({ code: 'AUTHENTICATION_REQUIRED' }, 401)
    })
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(client.requestJson('/api/assets', decodeList, { signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(listener).not.toHaveBeenCalled()
  })

  it('n’envoie pas la mutation si son chargement CSRF a été annulé', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort()
      return csrf()
    })

    await expect(createApiClient(fetcher).requestVoid('/api/auth/logout', { method: 'POST', signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf'])
  })

  it('exige une confirmation 204 pour une action sans réponse', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ok: true }))

    await expect(createApiClient(fetcher).requestVoid('/api/auth/me')).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('refuse un jeton CSRF incompatible avant de transmettre les données saisies', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ token: 'token', headerName: 'Authorization' }))

    await expect(createApiClient(fetcher).requestVoid('/api/auth/logout', { method: 'POST' }))
      .rejects.toMatchObject({ kind: 'invalid-response' })
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf'])
  })

  it('empêche une ancienne réponse CSRF de remplacer le jeton de la nouvelle session', async () => {
    let resolveOldToken!: (response: Response) => void
    const oldToken = new Promise<Response>((resolve) => { resolveOldToken = resolve })
    const fetcher = vi.fn<typeof fetch>()
      .mockReturnValueOnce(oldToken)
      .mockResolvedValueOnce(csrf('new-session'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = createApiClient(fetcher)
    const staleRefresh = client.refreshCsrf()
    client.clearCsrf()
    await client.refreshCsrf()
    resolveOldToken(csrf('expired-session'))
    await staleRefresh

    await client.requestVoid('/api/assets/42/retire', { method: 'PATCH' })

    expect(new Headers(fetcher.mock.calls[2]![1]?.headers).get('X-CSRF-TOKEN')).toBe('new-session')
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
})
