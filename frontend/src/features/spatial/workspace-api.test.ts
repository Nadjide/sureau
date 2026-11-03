import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createWorkspaceFromPlan } from './workspace-document'
import { parseSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { getWorkspace, saveWorkspace, type WorkspaceSnapshot } from './workspace-api'

function draft(): SpatialDraft {
  return parseSpatialDraft({
    workspace: createWorkspaceFromPlan(),
    locations: { 42: 'desk-01', 950: 'desk-removed' },
  })
}

function snapshot(revision = 1, value = draft()): WorkspaceSnapshot {
  return { ...value, revision, updatedAt: '2026-10-24T10:00:00+02:00' }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(): Response {
  return json({ token: 'workspace-csrf-token', headerName: 'X-CSRF-TOKEN' })
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, item]) => [key, reverseKeys(item)]),
  )
}

describe('lecture de l’espace partagé', () => {
  it('charge le document complet et garde les associations aux identifiants durables, y compris les orphelins', async () => {
    const expected = snapshot(Number.MAX_SAFE_INTEGER)
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(expected))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).resolves.toEqual(expected)

    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0]).toBe('/api/workspace')
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' })
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('X-CSRF-TOKEN')).toBe(false)
  })

  it('renvoie null uniquement lorsque le serveur confirme que l’espace n’est pas encore initialisé', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ code: 'WORKSPACE_NOT_INITIALIZED' }, 404))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).resolves.toBeNull()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([
    { status: 404, payload: {} },
    { status: 404, payload: { code: 'NOT_FOUND' } },
    { status: 404, payload: { code: 'workspace_not_initialized' } },
    { status: 500, payload: { code: 'WORKSPACE_NOT_INITIALIZED' } },
    { status: 403, payload: { code: 'WORKSPACE_NOT_INITIALIZED' } },
  ])('ne transforme pas $status/$payload en espace vide', async ({ status, payload }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(payload, status))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'http', status })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('ne transforme pas une page HTML 404 en espace absent', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<h1>Page absente</h1>', { status: 404 }))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 404,
      code: null,
    })
  })

  it.each([
    { label: 'une révision initiale nulle', value: () => ({ ...snapshot(), revision: 0 }) },
    { label: 'une révision négative', value: () => ({ ...snapshot(), revision: -1 }) },
    { label: 'une révision fractionnaire', value: () => ({ ...snapshot(), revision: 1.2 }) },
    { label: 'une révision non sûre', value: () => ({ ...snapshot(), revision: Number.MAX_SAFE_INTEGER + 1 }) },
    { label: 'une date sans fuseau', value: () => ({ ...snapshot(), updatedAt: '2026-10-24T10:00:00' }) },
    { label: 'une date impossible', value: () => ({ ...snapshot(), updatedAt: '2026-02-30T10:00:00Z' }) },
    { label: 'une association non canonique', value: () => ({ ...snapshot(), locations: { '042': 'desk-01' } }) },
    {
      label: 'un objet déplacé hors de la salle',
      value: () => {
        const value = snapshot()
        value.workspace.rooms[0]!.plan.workstations[0]!.position = [500, 0, 500]
        return value
      },
    },
    { label: 'un faux message d’initialisation en succès', value: () => ({ code: 'WORKSPACE_NOT_INITIALIZED' }) },
  ])('refuse $label sans fabriquer un plan de secours', async ({ value }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(value()))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'invalid-response' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each(['display', 'furniture'])(
    'refuse une réponse sans %s au lieu de migrer les données du serveur',
    async (field) => {
      const value = snapshot()
      Reflect.deleteProperty(value.workspace.rooms[0]!.plan, field)
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(value))

      await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      expect(fetcher).toHaveBeenCalledTimes(1)
    },
  )

  it('signale une page HTML servie avec un succès HTTP', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('<!doctype html><title>Sureau</title>'))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('conserve une erreur réseau sans créer un document', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Offline'))

    await expect(getWorkspace(undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'network',
      status: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it.each([401, 403])('notifie la session après un refus %i sans renvoyer le GET', async (status) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ code: 'AUTHENTICATION_REQUIRED' }, status))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(getWorkspace(undefined, client)).rejects.toMatchObject({ kind: 'http', status })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('respecte une annulation avant tout appel réseau', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()

    await expect(getWorkspace(controller.signal, createApiClient(fetcher))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })
})

describe('enregistrement atomique de l’espace et des associations', () => {
  it('envoie une seule révision attendue et un document canonique protégé par CSRF', async () => {
    const value = draft()
    value.workspace.name = '  Notre entreprise  '
    value.workspace.rooms[0]!.plan.name = '  Accueil  '
    const canonical = parseSpatialDraft(value)
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json(reverseKeys(snapshot(8, canonical))))

    await expect(saveWorkspace(7, value, undefined, createApiClient(fetcher))).resolves.toEqual(snapshot(8, canonical))

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/workspace'])
    const init = fetcher.mock.calls[1]![1]
    expect(init).toMatchObject({ method: 'PUT', credentials: 'same-origin' })
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('workspace-csrf-token')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(new Headers(init?.headers).has('If-Match')).toBe(false)
    expect(JSON.parse(String(init?.body))).toEqual({ expectedRevision: 7, ...canonical })
  })

  it('initialise explicitement avec la révision zéro et n’ajoute aucune association par défaut', async () => {
    const value = { ...draft(), locations: {} }
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json(snapshot(1, value)))

    await expect(saveWorkspace(0, value, undefined, createApiClient(fetcher))).resolves.toEqual(snapshot(1, value))
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toMatchObject({ expectedRevision: 0, locations: {} })
  })

  it('accepte la dernière révision sûre confirmée par le serveur', async () => {
    const value = draft()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json(snapshot(Number.MAX_SAFE_INTEGER, value)))

    await expect(
      saveWorkspace(Number.MAX_SAFE_INTEGER - 1, value, undefined, createApiClient(fetcher)),
    ).resolves.toMatchObject({ revision: Number.MAX_SAFE_INTEGER })
  })

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER + 1])(
    'rejette la révision attendue %s avant le réseau',
    async (revision) => {
      const fetcher = vi.fn<typeof fetch>()

      await expect(saveWorkspace(revision, draft(), undefined, createApiClient(fetcher))).rejects.toBeInstanceOf(
        RangeError,
      )
      expect(fetcher).not.toHaveBeenCalled()
    },
  )

  it('rejette un brouillon invalide avant même de demander un jeton CSRF', async () => {
    const value = { ...draft(), locations: { '0042': 'desk-01' } }
    const fetcher = vi.fn<typeof fetch>()

    await expect(saveWorkspace(1, value, undefined, createApiClient(fetcher))).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('borne l’espace à 2 Mo avant tout appel réseau', async () => {
    const value = draft()
    value.workspace.name = '桜'.repeat(700_000)
    const fetcher = vi.fn<typeof fetch>()

    await expect(saveWorkspace(1, value, undefined, createApiClient(fetcher))).rejects.toThrow('volumineux')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('borne aussi le corps complet en UTF-8 lorsque les associations dépassent 2,1 Mo', async () => {
    const locations = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, index) => [String(Number.MAX_SAFE_INTEGER - index), `desk-${'a'.repeat(80)}`]),
    )
    const value = { ...draft(), locations }
    const fetcher = vi.fn<typeof fetch>()

    await expect(saveWorkspace(1, value, undefined, createApiClient(fetcher))).rejects.toThrow('2,1 Mo')
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('capture un instantané avant l’attente CSRF sans inclure les modifications ultérieures du brouillon', async () => {
    const value = draft()
    const initial = structuredClone(value)
    let resolveCsrf!: (response: Response) => void
    const csrfPending = new Promise<Response>((resolve) => {
      resolveCsrf = resolve
    })
    const fetcher = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(csrfPending)
      .mockResolvedValueOnce(json(snapshot(2, initial)))
    const pending = saveWorkspace(1, value, undefined, createApiClient(fetcher))
    value.workspace.name = 'Modification pendant l’envoi'
    value.workspace.rooms[0]!.plan.workstations[0]!.label = 'Autre bureau'
    resolveCsrf(csrf())

    await expect(pending).resolves.toEqual(snapshot(2, initial))
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({ expectedRevision: 1, ...initial })
  })

  it.each([
    { status: 400, code: 'WORKSPACE_INVALID' },
    { status: 401, code: 'AUTHENTICATION_REQUIRED' },
    { status: 403, code: 'ACCESS_DENIED' },
    { status: 409, code: 'WORKSPACE_CONFLICT' },
    { status: 413, code: 'PAYLOAD_TOO_LARGE' },
  ])('conserve le refus $status/$code sans nouvel envoi', async ({ status, code }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json({ code }, status))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(saveWorkspace(1, draft(), undefined, client)).rejects.toMatchObject({ kind: 'http', status, code })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/workspace')).toHaveLength(1)
    expect(listener).toHaveBeenCalledTimes(status === 401 || status === 403 ? 1 : 0)
  })

  it('n’envoie rien si la récupération CSRF est refusée', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ code: 'ACCESS_DENIED' }, 403))

    await expect(saveWorkspace(1, draft(), undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 403,
      code: 'ACCESS_DENIED',
    })
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf'])
  })

  it.each([
    { label: 'une révision inchangée', response: () => json(snapshot(7)) },
    { label: 'une révision sautée', response: () => json(snapshot(9)) },
    { label: 'une révision invalide', response: () => json({ ...snapshot(8), revision: '8' }) },
    { label: 'une date invalide', response: () => json({ ...snapshot(8), updatedAt: 'hier' }) },
    { label: 'une association disparue', response: () => json({ ...snapshot(8), locations: { 42: 'desk-01' } }) },
    {
      label: 'une association modifiée',
      response: () => json({ ...snapshot(8), locations: { ...draft().locations, 42: 'desk-02' } }),
    },
    {
      label: 'un espace modifié',
      response: () => {
        const value = snapshot(8)
        value.workspace.name = 'Un autre espace'
        return json(value)
      },
    },
    {
      label: 'un plan incomplet',
      response: () => {
        const value = snapshot(8)
        Reflect.deleteProperty(value.workspace.rooms[0]!.plan, 'furniture')
        return json(value)
      },
    },
    { label: 'une réponse HTML', response: () => new Response('<!doctype html><title>Sureau</title>') },
  ])('demande de vérifier le serveur après $label sans réessayer automatiquement', async ({ response }) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(response())

    await expect(saveWorkspace(7, draft(), undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'invalid-response',
      status: null,
      message: expect.stringContaining('Rechargez la version du serveur pour vérifier son état avant de réessayer'),
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/workspace')).toHaveLength(1)
  })

  it('préserve le type réseau et demande de vérifier le résultat de l’enregistrement', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockRejectedValueOnce(new TypeError('Connection lost'))

    await expect(saveWorkspace(1, draft(), undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'network',
      status: null,
      code: null,
      message: expect.stringContaining('n’a pas pu être confirmé'),
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/workspace')).toHaveLength(1)
  })

  it('conserve le statut et le code d’une panne serveur dont le résultat est incertain', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(
        json({ code: 'PERSISTENCE_ERROR', errors: [{ field: 'workspace', message: 'invalid' }] }, 503),
      )

    await expect(saveWorkspace(1, draft(), undefined, createApiClient(fetcher))).rejects.toMatchObject({
      kind: 'http',
      status: 503,
      code: 'PERSISTENCE_ERROR',
      fieldErrors: { workspace: 'Vérifiez la valeur de ce champ.' },
      message: expect.stringContaining('n’a pas pu être confirmé'),
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/workspace')).toHaveLength(1)
  })

  it('respecte une annulation avant l’envoi', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()

    await expect(saveWorkspace(1, draft(), controller.signal, createApiClient(fetcher))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('laisse remonter une annulation pendant l’envoi sans la convertir ni rejouer la mutation', async () => {
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockImplementationOnce(async () => {
        controller.abort()
        return json(snapshot(2))
      })

    await expect(saveWorkspace(1, draft(), controller.signal, createApiClient(fetcher))).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/workspace')).toHaveLength(1)
  })
})
