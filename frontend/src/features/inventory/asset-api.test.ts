import { describe, expect, it, vi } from 'vitest'
import { AssetApiError, getAssets } from './asset-api'
import type { Asset } from './asset-schema'

const asset: Asset = {
  id: 42,
  revision: 0,
  assetTag: 'SEN-0042',
  serialNumber: null,
  name: 'Poste de travail',
  brand: null,
  model: null,
  category: 'COMPUTER',
  status: 'AVAILABLE',
  purchaseDate: '2026-03-29',
  createdAt: '2026-10-21T08:30:00Z',
  updatedAt: '2026-10-21T10:30:00.123456+02:00',
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('getAssets', () => {
  it('charge le contrat réel, conserve les valeurs nulles et la date civile', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([asset]))
    const { signal } = new AbortController()

    const result = await getAssets(signal, fetcher)

    expect(result).toEqual([asset])
    expect(fetcher).toHaveBeenCalledWith('/api/assets', {
      method: 'GET',
      credentials: 'same-origin',
      headers: new Headers({ Accept: 'application/json' }),
      signal,
    })
  })

  it('accepte une date d’achat inconnue et les champs supplémentaires du serveur', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(jsonResponse([{ ...asset, purchaseDate: null, futureField: 'compatible' }]))

    await expect(getAssets(new AbortController().signal, fetcher)).resolves.toEqual([
      { ...asset, purchaseDate: null },
    ])
  })

  it('distingue un inventaire vide valide d’une erreur', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse([]))

    await expect(getAssets(new AbortController().signal, fetcher)).resolves.toEqual([])
  })

  it.each([
    { label: 'une enveloppe non prévue', payload: { assets: [asset] } },
    { label: 'une catégorie inconnue', payload: [{ ...asset, category: 'PRINTER' }] },
    { label: 'un statut inconnu', payload: [{ ...asset, status: 'ACTIVE' }] },
    { label: 'un identifiant non sûr', payload: [{ ...asset, id: Number.MAX_SAFE_INTEGER + 1 }] },
    { label: 'un identifiant décimal', payload: [{ ...asset, id: 1.5 }] },
    { label: 'un identifiant dupliqué', payload: [asset, { ...asset, assetTag: 'SEN-0043' }] },
    { label: 'un champ nullable absent', payload: [{ ...asset, brand: undefined }] },
    { label: 'une date civile impossible', payload: [{ ...asset, purchaseDate: '2026-02-30' }] },
  ])('refuse $label sans fabriquer de matériel', async ({ payload }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse(payload))

    await expect(getAssets(new AbortController().signal, fetcher)).rejects.toMatchObject({
      name: 'AssetApiError',
      kind: 'invalid-response',
      status: null,
    })
  })

  it('refuse une page HTML reçue comme un succès', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('<!doctype html><title>Frontend</title>'))

    await expect(getAssets(new AbortController().signal, fetcher)).rejects.toMatchObject({
      kind: 'invalid-response',
    })
  })

  it.each([404, 502])('conserve le statut HTTP %i même sans réponse JSON', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('Service unavailable', { status }))

    await expect(getAssets(new AbortController().signal, fetcher)).rejects.toMatchObject({
      kind: 'http',
      status,
    })
  })

  it('signale une panne réseau au lieu de retourner un inventaire vide', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'))

    await expect(getAssets(new AbortController().signal, fetcher)).rejects.toBeInstanceOf(AssetApiError)
    await expect(getAssets(new AbortController().signal, fetcher)).rejects.toMatchObject({
      kind: 'network',
      status: null,
    })
  })

  it('ne démarre aucune requête déjà annulée', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>()
    controller.abort()

    await expect(getAssets(controller.signal, fetcher)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('transmet l’annulation au transport sans la transformer en erreur réseau', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation((_input, init) => {
      const signal = init?.signal
      if (!signal) return Promise.reject(new Error('Le signal est requis.'))

      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    })

    const request = getAssets(controller.signal, fetcher)
    controller.abort()

    await expect(request).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('ignore une réponse tardive si le transport ne respecte pas l’annulation', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => {
      controller.abort()
      return jsonResponse([asset])
    })

    await expect(getAssets(controller.signal, fetcher)).rejects.toMatchObject({ name: 'AbortError' })
  })
})
