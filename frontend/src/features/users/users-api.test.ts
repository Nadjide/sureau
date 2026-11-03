import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createUsersApi } from './users-api'
import type { AdminUser, ChangeOwnPasswordInput, CreateUserInput, UpdateUserInput } from './user-schema'

const creation: CreateUserInput = {
  username: 'member.test',
  displayName: 'Inès Moreau',
  password: '  Initial-password-42!  ',
  role: 'EDITOR',
  email: null,
}
const account: AdminUser = {
  id: 42,
  username: 'member.test',
  displayName: 'Inès Moreau',
  role: 'EDITOR',
  enabled: true,
  email: null,
}
const change: UpdateUserInput = { displayName: 'Élise équipe', role: 'VIEWER', enabled: false, email: null }
const ownPassword: ChangeOwnPasswordInput = {
  currentPassword: 'Current-password-42!',
  newPassword: '  New-password-84!  ',
}
const resetPassword = { password: '  Reset-password-84!  ' }

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
}
function csrf(token = 'users-csrf'): Response {
  return json({ token, headerName: 'X-CSRF-TOKEN' })
}
function empty(): Response {
  return new Response(null, { status: 204 })
}
type UsersApi = ReturnType<typeof createUsersApi>
const writes: ReadonlyArray<{
  name: string
  run: (api: UsersApi, signal?: AbortSignal) => Promise<unknown>
  response: () => Response
}> = [
  { name: 'create', run: (api, signal) => api.create(creation, signal), response: () => json(account, 201) },
  {
    name: 'update',
    run: (api, signal) => api.update(42, change, signal),
    response: () => json({ ...account, ...change }),
  },
  { name: 'reset', run: (api, signal) => api.resetPassword(42, resetPassword, signal), response: empty },
  { name: 'own-password', run: (api, signal) => api.changeOwnPassword(ownPassword, signal), response: empty },
]

describe('lecture des comptes de cette instance', () => {
  it('lit les comptes réels par GET même origine sans exposer les champs étrangers ou secrets', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json([{ ...account, passwordHash: 'not-for-the-ui', authVersion: 7, future: true }]))
    await expect(createUsersApi(createApiClient(fetcher)).list()).resolves.toEqual([account])
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]![0]).toBe('/api/users')
    expect(fetcher.mock.calls[0]![1]).toMatchObject({ method: 'GET', credentials: 'same-origin' })
    expect(new Headers(fetcher.mock.calls[0]![1]?.headers).has('X-CSRF-TOKEN')).toBe(false)
  })

  it('accepte une liste explicitement vide sans y ajouter un compte de démonstration', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json([]))
    await expect(createUsersApi(createApiClient(fetcher)).list()).resolves.toEqual([])
  })

  it('refuse une liste incompatible entière au lieu de filtrer les comptes invalides', async () => {
    for (const payload of [
      {},
      account,
      [account, { ...account, id: Number.MAX_SAFE_INTEGER + 1 }],
      [{ ...account, enabled: 'true' }],
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(payload))
      await expect(createUsersApi(createApiClient(fetcher)).list()).rejects.toMatchObject({ kind: 'invalid-response' })
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
  })

  it('laisse les erreurs réseau, serveur, ressource absente et page HTML visibles sans produire de liste vide', async () => {
    const failures = [
      { response: json({ code: 'PERSISTENCE_ERROR' }, 500), expected: { kind: 'http', status: 500 } },
      { response: json({ code: 'NOT_FOUND' }, 404), expected: { kind: 'http', status: 404 } },
      { response: new Response('<html>Proxy</html>'), expected: { kind: 'invalid-response', status: null } },
    ]
    for (const failure of failures) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(failure.response)
      await expect(createUsersApi(createApiClient(fetcher)).list()).rejects.toMatchObject(failure.expected)
      expect(fetcher).toHaveBeenCalledTimes(1)
    }
    const fetcher = vi.fn<typeof fetch>().mockRejectedValueOnce(new TypeError('Offline'))
    await expect(createUsersApi(createApiClient(fetcher)).list()).rejects.toMatchObject({
      kind: 'network',
      status: null,
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('écritures des comptes et normalisation des DTO', () => {
  it('crée avec CSRF, identité normalisée, mot de passe exact et identifiant attribué par le serveur', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ ...account, future: true }, 201))
    const api = createUsersApi(createApiClient(fetcher))
    await expect(
      api.create({ ...creation, username: '  MEMBER.Test  ', displayName: '  Inès Moreau  ' }),
    ).resolves.toEqual(account)
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/users'])
    const init = fetcher.mock.calls[1]![1]
    expect(init).toMatchObject({ method: 'POST', credentials: 'same-origin' })
    expect(new Headers(init?.headers).get('X-CSRF-TOKEN')).toBe('users-csrf')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toEqual(creation)
  })

  it('modifie la cible durable par PUT et confirme les champs normalisés demandés', async () => {
    const expected = { ...account, ...change }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json(expected))
    await expect(
      createUsersApi(createApiClient(fetcher)).update(42, { ...change, displayName: '  Élise équipe  ' }),
    ).resolves.toEqual(expected)
    expect(fetcher.mock.calls[1]![0]).toBe('/api/users/42')
    expect(fetcher.mock.calls[1]![1]).toMatchObject({ method: 'PUT', credentials: 'same-origin' })
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(change)
  })

  it('refuse les identifiants invalides avant même de demander CSRF', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const api = createUsersApi(createApiClient(fetcher))
    for (const id of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(api.update(id, change)).rejects.toBeDefined()
      await expect(api.resetPassword(id, resetPassword)).rejects.toBeDefined()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('valide toutes les saisies et la limite UTF-8 des nouveaux mots de passe avant le réseau', async () => {
    const fetcher = vi.fn<typeof fetch>()
    const api = createUsersApi(createApiClient(fetcher))
    await expect(api.create({ ...creation, username: 'ab' })).rejects.toBeDefined()
    await expect(api.update(42, { ...change, displayName: ' ' })).rejects.toBeDefined()
    for (const password of ['short', ' '.repeat(12), 'a'.repeat(65), 'é'.repeat(37)]) {
      await expect(api.create({ ...creation, password })).rejects.toBeDefined()
      await expect(api.resetPassword(42, { password })).rejects.toBeDefined()
      await expect(api.changeOwnPassword({ ...ownPassword, newPassword: password })).rejects.toBeDefined()
    }
    await expect(api.changeOwnPassword({ ...ownPassword, currentPassword: '' })).rejects.toBeDefined()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('capture le DTO avant l’attente CSRF pour conserver le compte réellement demandé', async () => {
    let release!: (response: Response) => void
    const csrfPending = new Promise<Response>((resolve) => {
      release = resolve
    })
    const fetcher = vi.fn<typeof fetch>().mockReturnValueOnce(csrfPending).mockResolvedValueOnce(json(account, 201))
    const input = { ...creation }
    const request = createUsersApi(createApiClient(fetcher)).create(input)
    input.username = 'another-member'
    input.password = 'Changed-after-submit-42!'
    release(csrf())
    await expect(request).resolves.toEqual(account)
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(creation)
  })

  it('ne confirme pas une création dont le nom, rôle, statut ou identité diffèrent de la demande', async () => {
    for (const response of [
      { ...account, username: 'another' },
      { ...account, role: 'ADMIN' },
      { ...account, enabled: false },
      { ...account, displayName: 'Autre personne' },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json(response, 201))
      await expect(createUsersApi(createApiClient(fetcher)).create(creation)).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      expect(fetcher.mock.calls.filter(([path]) => path === '/api/users')).toHaveLength(1)
    }
  })

  it('ne confirme pas un PUT répondant avec une autre cible ou une autre modification', async () => {
    for (const response of [
      { ...account, ...change, id: 99 },
      { ...account, ...change, role: 'ADMIN' },
      { ...account, ...change, enabled: true },
      { ...account, ...change, displayName: 'Autre nom' },
    ]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(json(response))
      await expect(createUsersApi(createApiClient(fetcher)).update(42, change)).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      expect(fetcher.mock.calls.filter(([path]) => path === '/api/users/42')).toHaveLength(1)
    }
  })

  it('garde les conflits de doublon et de dernier administrateur sans nouvel envoi', async () => {
    const duplicateFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'DUPLICATE_RESOURCE' }, 409))
    await expect(createUsersApi(createApiClient(duplicateFetcher)).create(creation)).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'DUPLICATE_RESOURCE',
    })
    const lastAdminFetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(json({ code: 'LAST_ADMIN_REQUIRED' }, 409))
    await expect(createUsersApi(createApiClient(lastAdminFetcher)).update(42, change)).rejects.toMatchObject({
      kind: 'http',
      status: 409,
      code: 'LAST_ADMIN_REQUIRED',
      message: expect.stringMatching(/administrateur/i),
    })
    expect(duplicateFetcher).toHaveBeenCalledTimes(2)
    expect(lastAdminFetcher).toHaveBeenCalledTimes(2)
  })

  it('conserve les erreurs de champs pour permettre une correction explicite', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(
        json({ code: 'VALIDATION_ERROR', errors: [{ field: 'username', message: 'must not be blank' }] }, 400),
      )
    await expect(createUsersApi(createApiClient(fetcher)).create(creation)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      code: 'VALIDATION_ERROR',
      fieldErrors: { username: 'Ce champ est obligatoire.' },
    })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe('mots de passe et cache CSRF', () => {
  it('envoie le reset exact et conserve le jeton de la session administrateur', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(json({ ...account, ...change }))
    const api = createUsersApi(createApiClient(fetcher))
    await expect(api.resetPassword(42, resetPassword)).resolves.toBeUndefined()
    await api.update(42, change)
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/users/42/password',
      '/api/users/42',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(resetPassword)
  })

  it('préserve les espaces et renouvelle CSRF après le changement personnel confirmé', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('first-token'))
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(csrf('new-token'))
      .mockResolvedValueOnce(empty())
    const api = createUsersApi(createApiClient(fetcher))
    await expect(api.changeOwnPassword(ownPassword)).resolves.toBeUndefined()
    await api.resetPassword(42, resetPassword)
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/auth/password',
      '/api/auth/csrf',
      '/api/users/42/password',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(ownPassword)
    expect(new Headers(fetcher.mock.calls[3]![1]?.headers).get('X-CSRF-TOKEN')).toBe('new-token')
  })

  it('un ancien mot de passe incorrect reste un400 sans notifier une expiration ni vider CSRF', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf())
      .mockResolvedValueOnce(
        json({ code: 'CURRENT_PASSWORD_INVALID', errors: [{ field: 'currentPassword', message: 'invalid' }] }, 400),
      )
      .mockResolvedValueOnce(empty())
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)
    const api = createUsersApi(client)
    await expect(api.changeOwnPassword(ownPassword)).rejects.toMatchObject({
      kind: 'http',
      status: 400,
      code: 'CURRENT_PASSWORD_INVALID',
      fieldErrors: { currentPassword: 'Vérifiez la valeur de ce champ.' },
      message: expect.stringMatching(/mot de passe actuel/i),
    })
    await api.resetPassword(42, resetPassword)
    expect(listener).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/auth/password',
      '/api/users/42/password',
    ])
  })

  it('ne prend pas un200 quelconque pour une confirmation de changement de mot de passe', async () => {
    for (const operation of writes.filter(({ name }) => name === 'reset' || name === 'own-password')) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockResolvedValueOnce(json({ ok: true }))
      await expect(operation.run(createUsersApi(createApiClient(fetcher)))).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it('accepte un nouveau mot de passe exactement à72octets sans le normaliser', async () => {
    const password = 'é'.repeat(35) + '  '
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(csrf()).mockResolvedValueOnce(empty())
    await createUsersApi(createApiClient(fetcher)).resetPassword(42, { password })
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual({ password })
  })
})

describe('échecs, absence de rejeu et annulations', () => {
  it.each([401, 403])('conserve chaque refus%i et notifie la session sans rejouer la mutation', async (status) => {
    for (const operation of writes) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockResolvedValueOnce(json({ code: status === 401 ? 'AUTHENTICATION_REQUIRED' : 'ACCESS_DENIED' }, status))
      const client = createApiClient(fetcher)
      const listener = vi.fn()
      client.subscribeAuthFailure(listener)
      await expect(operation.run(createUsersApi(client))).rejects.toMatchObject({ kind: 'http', status })
      expect(listener).toHaveBeenCalledTimes(1)
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it('signale les résultats réseau incertains sur toutes les écritures sans réessayer', async () => {
    for (const operation of writes) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockRejectedValueOnce(new TypeError('Connection lost after submit'))
      await expect(operation.run(createUsersApi(createApiClient(fetcher)))).rejects.toMatchObject({
        kind: 'network',
        status: null,
        message: expect.stringMatching(/vérifi|confirm/i),
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it('conserve statut, code et champs des erreurs serveur dont le résultat est incertain', async () => {
    for (const operation of writes) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockResolvedValueOnce(
          json({ code: 'PERSISTENCE_ERROR', errors: [{ field: 'displayName', message: 'invalid' }] }, 503),
        )
      await expect(operation.run(createUsersApi(createApiClient(fetcher)))).rejects.toMatchObject({
        kind: 'http',
        status: 503,
        code: 'PERSISTENCE_ERROR',
        fieldErrors: { displayName: 'Vérifiez la valeur de ce champ.' },
        message: expect.stringMatching(/vérifi|confirm/i),
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it('refuse les réponses HTML aux écritures sans fabriquer de succès', async () => {
    for (const operation of writes) {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockResolvedValueOnce(new Response('<html>Proxy</html>'))
      await expect(operation.run(createUsersApi(createApiClient(fetcher)))).rejects.toMatchObject({
        kind: 'invalid-response',
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })

  it('n’envoie aucune opération dont le signal est déjà annulé', async () => {
    const controller = new AbortController()
    controller.abort()
    const fetcher = vi.fn<typeof fetch>()
    const api = createUsersApi(createApiClient(fetcher))
    await expect(api.list(controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    for (const operation of writes)
      await expect(operation.run(api, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('ne confirme aucune réponse reçue après annulation de sa requête', async () => {
    for (const operation of writes) {
      const controller = new AbortController()
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(csrf())
        .mockImplementationOnce(async () => {
          controller.abort()
          return operation.response()
        })
      await expect(operation.run(createUsersApi(createApiClient(fetcher)), controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      })
      expect(fetcher).toHaveBeenCalledTimes(2)
    }
  })
})
