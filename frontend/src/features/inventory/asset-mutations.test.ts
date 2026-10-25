import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createAsset } from './asset-mutations'
import type { AssetInput } from './asset-input'
import type { Asset } from './asset-schema'

const input: AssetInput = {
  assetTag: 'SUR-0042', serialNumber: null, name: 'Poste de travail', brand: null, model: null,
  category: 'COMPUTER', status: 'AVAILABLE', purchaseDate: null,
}
const asset: Asset = {
  ...input, id: 42, createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T10:00:00Z',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(): Response {
  return json({ token: 'session-token', headerName: 'X-CSRF-TOKEN' })
}

describe('création d’un matériel sur le serveur', () => {
  it('envoie le DTO normalisé avec CSRF et conserve l’identifiant durable attribué par le serveur', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ ...asset, futureField: true }, 201))
    const client = createApiClient(fetcher)

    await expect(createAsset({ ...input, assetTag: ' SUR-0042 ', brand: ' ' }, undefined, client)).resolves.toEqual(asset)

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/assets'])
    const init = fetcher.mock.calls[1]![1]
    expect(init?.method).toBe('POST')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('session-token')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual(input)
  })

  it('rejette une saisie invalide avant tout appel réseau', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(createAsset({ ...input, name: ' ' }, undefined, createApiClient(fetcher))).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('conserve le conflit d’un identifiant déjà utilisé et ne recrée pas le matériel', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'DUPLICATE_RESOURCE' }, 409))

    await expect(createAsset(input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 409, code: 'DUPLICATE_RESOURCE',
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it('conserve les erreurs de champs du serveur pour corriger le formulaire', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'VALIDATION_ERROR', errors: [{ field: 'name', message: 'must not be blank' }] }, 400))

    await expect(createAsset(input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 400, code: 'VALIDATION_ERROR', fieldErrors: { name: 'Ce champ est obligatoire.' },
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it.each([401, 403])('ne rejoue pas une création refusée avec le statut %i', async (status) => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED' }, status))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(createAsset(input, undefined, client)).rejects.toMatchObject({ kind: 'http', status })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it('ne réessaie pas automatiquement après une rupture réseau dont le résultat est inconnu', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockRejectedValueOnce(new TypeError('Connection lost after sending the request'))

    await expect(createAsset(input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'network', status: null, message: expect.stringContaining('Actualisez l’inventaire avant de réessayer'),
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it('invite à vérifier l’inventaire après une panne serveur au lieu de renvoyer la création', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'PERSISTENCE_ERROR' }, 500))

    await expect(createAsset(input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 500, code: 'PERSISTENCE_ERROR',
      message: expect.stringContaining('Actualisez l’inventaire avant de réessayer'),
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it.each([
    { label: 'une réponse HTML', response: () => new Response('<!doctype html><title>Sureau</title>') },
    { label: 'un identifiant non sûr', response: () => json({ ...asset, id: Number.MAX_SAFE_INTEGER + 1 }, 201) },
    { label: 'un matériel incomplet', response: () => json({ id: 42, name: input.name }, 201) },
    { label: 'une date incompatible', response: () => json({ ...asset, purchaseDate: '2026-02-30' }, 201) },
  ])('signale $label sans fabriquer de résultat ni renvoyer le POST', async ({ response }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response())

    await expect(createAsset(input, undefined, createApiClient(fetcher)))
      .rejects.toMatchObject({
        kind: 'invalid-response', status: null, message: expect.stringContaining('Actualisez l’inventaire avant de réessayer'),
      })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })

  it('respecte une annulation sans la convertir en échec de création', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockImplementationOnce(async () => { controller.abort(); return json(asset, 201) })

    await expect(createAsset(input, controller.signal, createApiClient(fetcher)))
      .rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/assets')).toHaveLength(1)
  })
})
