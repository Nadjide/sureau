import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { retireAsset } from './asset-mutations'
import type { Asset } from './asset-schema'

const retired: Asset = {
  id: 42,
  revision: 8,
  assetTag: 'SUR-0042',
  serialNumber: null,
  name: 'Poste accueil',
  brand: null,
  model: null,
  category: 'COMPUTER',
  status: 'RETIRED',
  purchaseDate: null,
  createdAt: '2026-10-23T10:00:00Z',
  updatedAt: '2026-10-23T12:00:00Z',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(): Response {
  return json({ token: 'editor-token', headerName: 'X-CSRF-TOKEN' })
}

describe('retrait conditionnel d’un matériel', () => {
  it.each([0, 7])(
    'retire la fiche avec sa révision %s et CSRF sans envoyer de données de localisation',
    async (revision) => {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json(retired))

      await expect(retireAsset(42, revision, undefined, createApiClient(fetcher))).resolves.toEqual(retired)

      expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/assets/42/retire'])
      const init = fetcher.mock.calls[1]![1]
      expect(init?.method).toBe('PATCH')
      expect(init?.credentials).toBe('same-origin')
      expect(new Headers(init?.headers).get('If-Match')).toBe(`"${revision}"`)
      expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('editor-token')
      expect(init?.body).toBeUndefined()
    },
  )

  it('transmet une révision maximale sûre au serveur sans la convertir ou la tronquer', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'ASSET_CONFLICT' }, 412))

    await expect(retireAsset(42, Number.MAX_SAFE_INTEGER, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 412,
    })
    expect(new Headers(fetcher.mock.calls[1]![1]?.headers).get('If-Match')).toBe(`"${Number.MAX_SAFE_INTEGER}"`)
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuse l’identifiant invalide %s avant réseau',
    async (id) => {
      const fetcher = vi.fn<typeof fetch>()

      await expect(retireAsset(id, 7, undefined, createApiClient(fetcher))).rejects.toBeDefined()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'refuse la révision invalide %s avant réseau',
    async (revision) => {
      const fetcher = vi.fn<typeof fetch>()

      await expect(retireAsset(42, revision, undefined, createApiClient(fetcher))).rejects.toBeDefined()
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('conserve le conflit de révision sans réessayer le retrait avec une version plus récente', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'ASSET_CONFLICT' }, 412))

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 412,
      code: 'ASSET_CONFLICT',
    })
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/assets/42/retire'])
  })

  it('conserve le refus métier lorsqu’un matériel est affecté ou déjà retiré', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'ASSET_STATUS_CONFLICT' }, 409))

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'ASSET_STATUS_CONFLICT',
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })

  it.each([401, 403])('notifie le refus de session %s sans rejouer le retrait', async (status) => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(
        json(
          {
            code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
          },
          status,
        ),
      )
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(retireAsset(42, 7, undefined, client)).rejects.toMatchObject({ kind: 'http', status })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })

  it('conserve le statut 404 si le matériel n’existe plus', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'NOT_FOUND' }, 404))

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 404,
      code: 'NOT_FOUND',
    })
  })

  it('ne prétend pas confirmer un retrait après une rupture réseau et ne le renvoie pas', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockRejectedValueOnce(new TypeError('Network lost'))

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'network',
      status: null,
      message: expect.stringContaining('Actualisez la fiche du serveur'),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })

  it('conserve une panne serveur comme résultat incertain sans renvoyer le retrait', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'PERSISTENCE_ERROR' }, 500))

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 500,
      code: 'PERSISTENCE_ERROR',
      message: expect.stringContaining('Actualisez la fiche du serveur'),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })

  it.each([
    { label: 'une page HTML', response: () => new Response('<!doctype html><title>Sureau</title>') },
    { label: 'un autre matériel', response: () => json({ ...retired, id: 43 }) },
    { label: 'une fiche sans révision', response: () => json({ ...retired, revision: undefined }) },
    { label: 'une révision non sûre', response: () => json({ ...retired, revision: Number.MAX_SAFE_INTEGER + 1 }) },
    { label: 'un état toujours disponible', response: () => json({ ...retired, status: 'AVAILABLE' }) },
    { label: 'une révision non avancée', response: () => json({ ...retired, revision: 7 }) },
    { label: 'une révision antérieure', response: () => json({ ...retired, revision: 6 }) },
  ])('refuse $label sans afficher un retrait confirmé ni effectuer de second envoi', async ({ response }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response())

    await expect(retireAsset(42, 7, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'invalid-response',
      message: expect.stringContaining('Actualisez la fiche du serveur'),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })

  it('n’envoie aucun retrait déjà annulé', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()

    await expect(retireAsset(42, 7, controller.signal, createApiClient(fetcher))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ignore une réponse tardive après annulation sans inventer le résultat du retrait', async () => {
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockImplementationOnce(async () => {
        controller.abort()
        return json(retired)
      })

    await expect(retireAsset(42, 7, controller.signal, createApiClient(fetcher))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PATCH')).toHaveLength(1)
  })
})
