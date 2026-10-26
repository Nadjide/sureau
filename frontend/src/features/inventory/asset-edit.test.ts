import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { getAsset, updateAsset } from './asset-mutations'
import type { AssetInput } from './asset-input'
import type { Asset } from './asset-schema'

const input: AssetInput = {
  assetTag: 'SUR-0042', serialNumber: null, name: 'Poste accueil', brand: null, model: null,
  category: 'COMPUTER', status: 'AVAILABLE', purchaseDate: null, assignee: null,
}
const asset: Asset = {
  ...input, id: 42, revision: 7, createdAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T11:00:00Z',
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(): Response {
  return json({ token: 'editor-token', headerName: 'X-CSRF-TOKEN' })
}

describe('chargement de la fiche à modifier', () => {
  it('charge explicitement la fiche et sa révision actuelles avec la session du même domaine', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...asset, compatibleFutureField: true }))

    await expect(getAsset(42, undefined, createApiClient(fetcher))).resolves.toEqual(asset)

    expect(fetcher).toHaveBeenCalledTimes(1)
    const [path, init] = fetcher.mock.calls[0]!
    expect(path).toBe('/api/assets/42')
    expect(init?.method).toBe('GET')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).has('X-CSRF-TOKEN')).toBe(false)
  })

  it('refuse un autre matériel au lieu d’ouvrir une mauvaise fiche sous la sélection courante', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...asset, id: 43 }))

    await expect(getAsset(42, undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it.each([undefined, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])('refuse une révision de réponse incompatible : %s', async (revision) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...asset, revision }))

    await expect(getAsset(42, undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('accepte les identifiants et révisions aux bornes des entiers sûrs', async () => {
    const maximum = { ...asset, id: Number.MAX_SAFE_INTEGER, revision: Number.MAX_SAFE_INTEGER }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(maximum))

    await expect(getAsset(Number.MAX_SAFE_INTEGER, undefined, createApiClient(fetcher))).resolves.toEqual(maximum)
    expect(fetcher.mock.calls[0]![0]).toBe(`/api/assets/${Number.MAX_SAFE_INTEGER}`)
  })

  it('conserve une fiche supprimée comme erreur 404 explicite', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ code: 'NOT_FOUND' }, 404))

    await expect(getAsset(42, undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'http', status: 404, code: 'NOT_FOUND' })
  })

  it('respecte une annulation tardive sans exposer la réponse du précédent chargement', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { controller.abort(); return json(asset) })

    await expect(getAsset(42, controller.signal, createApiClient(fetcher))).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('modification conditionnelle d’un matériel', () => {
  it.each([0, 7, Number.MAX_SAFE_INTEGER])('transmet la révision %s en If-Match avec CSRF et uniquement le DTO dans le corps', async (revision) => {
    const responseAsset = { ...asset, revision }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json(responseAsset))
    const values = { ...input, name: ' Poste accueil ', model: ' ' }

    await expect(updateAsset(42, revision, values, undefined, createApiClient(fetcher))).resolves.toEqual(responseAsset)

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/assets/42'])
    const init = fetcher.mock.calls[1]![1]
    expect(init?.method).toBe('PUT')
    expect(init?.credentials).toBe('same-origin')
    expect(new Headers(init?.headers).get('If-Match')).toBe(`"${revision}"`)
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('editor-token')
    expect(JSON.parse(String(init?.body))).toEqual(input)
    expect(values.model).toBe(' ')
  })

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('refuse un identifiant invalide %s avant lecture ou écriture réseau', async (id) => {
    const fetcher = vi.fn<typeof fetch>()
    const client = createApiClient(fetcher)

    await expect(getAsset(id, undefined, client)).rejects.toBeDefined()
    await expect(updateAsset(id, 0, input, undefined, client)).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])('refuse une révision invalide %s avant réseau', async (revision) => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(updateAsset(42, revision, input, undefined, createApiClient(fetcher))).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refuse une saisie invalide avant de demander un jeton ou d’envoyer la fiche', async () => {
    const fetcher = vi.fn<typeof fetch>()

    await expect(updateAsset(42, 7, { ...input, assetTag: ' ' }, undefined, createApiClient(fetcher))).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('conserve le conflit de révision sans transformer la saisie ni réessayer avec une révision plus récente', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({ code: 'ASSET_CONFLICT' }, 412))
    const draft = { ...input, name: 'Mon brouillon' }

    await expect(updateAsset(42, 7, draft, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 412, code: 'ASSET_CONFLICT',
    })
    expect(draft.name).toBe('Mon brouillon')
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/assets/42'])
  })

  it.each([
    { code: 'ASSET_STATUS_CONFLICT', message: /état|affecté|retrait/i },
    { code: 'DUPLICATE_RESOURCE', message: /identifiant|utilisé/i },
  ])('conserve le sens du conflit 409 $code', async ({ code, message }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({ code }, 409))

    await expect(updateAsset(42, 7, input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 409, code, message: expect.stringMatching(message),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('conserve les erreurs de champs retournées par le serveur', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({
      code: 'VALIDATION_ERROR', errors: [{ field: 'name', message: 'must not be blank' }],
    }, 400))

    await expect(updateAsset(42, 7, input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 400, code: 'VALIDATION_ERROR', fieldErrors: { name: 'Ce champ est obligatoire.' },
    })
  })

  it.each([401, 403])('signale le refus de session %s sans renvoyer la modification', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({
      code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED',
    }, status))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(updateAsset(42, 7, input, undefined, client)).rejects.toMatchObject({ kind: 'http', status })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('ne déclare pas la modification confirmée après une rupture réseau et ne la rejoue pas', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockRejectedValueOnce(new TypeError('Network lost'))

    await expect(updateAsset(42, 7, input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'network', status: null, message: expect.stringContaining('Rechargez la fiche du serveur'),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('demande de vérifier l’état du serveur après une panne 500 et conserve son statut', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({ code: 'PERSISTENCE_ERROR' }, 500))

    await expect(updateAsset(42, 7, input, undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http', status: 500, code: 'PERSISTENCE_ERROR', message: expect.stringContaining('Rechargez la fiche du serveur'),
    })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it.each([
    { label: 'une réponse HTML', response: () => new Response('<html>Sureau</html>') },
    { label: 'une fiche différente', response: () => json({ ...asset, id: 43 }) },
    { label: 'une fiche sans révision', response: () => json({ ...asset, revision: undefined }) },
  ])('refuse $label après enregistrement sans effectuer un second envoi', async ({ response }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response())

    await expect(updateAsset(42, 7, input, undefined, createApiClient(fetcher)))
      .rejects.toMatchObject({ kind: 'invalid-response', message: expect.stringContaining('Rechargez la fiche du serveur') })
    expect(fetcher.mock.calls.filter(([_path, init]) => init?.method === 'PUT')).toHaveLength(1)
  })

  it('respecte une annulation en cours d’envoi sans prétendre connaître son résultat', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockImplementationOnce(async () => {
      controller.abort()
      return json(asset)
    })

    await expect(updateAsset(42, 7, input, controller.signal, createApiClient(fetcher)))
      .rejects.toMatchObject({ name: 'AbortError' })
  })
})
