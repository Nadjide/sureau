import { describe, expect, it, vi } from 'vitest'
import { createApiClient } from '@/lib/api-client'
import { createAuthApi, type SessionUser } from './auth-api'

const administrator: SessionUser = { id: 1, username: 'nadjide', displayName: 'Nadjide', role: 'ADMIN' }
const input = { username: ' nadjide ', password: 'a long password' }

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } })
}

function csrf(token: string): Response {
  return json({ token, headerName: 'X-CSRF-TOKEN' })
}

describe('API de connexion', () => {
  it('utilise le formulaire Spring puis renouvelle CSRF après le changement de session', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('anonymous'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(csrf('authenticated'))
      .mockResolvedValueOnce(json(administrator))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = createApiClient(fetcher)
    const auth = createAuthApi(client)

    await expect(auth.login(input)).resolves.toEqual(administrator)
    await client.requestVoid('/api/assets/42/retire', { method: 'PATCH' })

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/auth/login',
      '/api/auth/csrf',
      '/api/auth/me',
      '/api/assets/42/retire',
    ])
    const login = fetcher.mock.calls[1]![1]
    const body = new URLSearchParams(String(login?.body))
    expect(body.get('username')).toBe('nadjide')
    expect(body.get('password')).toBe(input.password)
    expect(new Headers(login?.headers).get('Content-Type')).toBe('application/x-www-form-urlencoded;charset=UTF-8')
    expect(new Headers(login?.headers).get('X-CSRF-TOKEN')).toBe('anonymous')
    expect(new Headers(fetcher.mock.calls[4]![1]?.headers).get('X-CSRF-TOKEN')).toBe('authenticated')
  })

  it('présente un refus de connexion sans notifier une expiration ni rejouer le mot de passe', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('anonymous'))
      .mockResolvedValueOnce(json({ code: 'INVALID_CREDENTIALS' }, 401))
    const client = createApiClient(fetcher)
    const listener = vi.fn()
    client.subscribeAuthFailure(listener)

    await expect(createAuthApi(client).login(input)).rejects.toMatchObject({
      status: 401,
      code: 'INVALID_CREDENTIALS',
      message: 'L’identifiant ou le mot de passe est incorrect.',
    })
    expect(listener).not.toHaveBeenCalled()
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/auth/login'])
  })

  it('confirme la déconnexion dès le 204 et abandonne le jeton de la session précédente', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('old-session'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(csrf('new-session'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    const client = createApiClient(fetcher)
    const auth = createAuthApi(client)

    await expect(auth.logout()).resolves.toBeUndefined()
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/auth/logout'])
    await client.requestVoid('/api/auth/logout', { method: 'POST' })

    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/auth/logout',
      '/api/auth/csrf',
      '/api/auth/logout',
    ])
    expect(new Headers(fetcher.mock.calls[3]![1]?.headers).get('X-CSRF-TOKEN')).toBe('new-session')
  })

  it('ne peut pas transformer un logout confirmé en échec à cause d’une requête supplémentaire', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('session'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockRejectedValue(new TypeError('The network is now offline'))

    await expect(createAuthApi(createApiClient(fetcher)).logout()).resolves.toBeUndefined()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('annonce la connexion d’entreprise seulement quand l’instance la propose', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(json({ setupRequired: false, sso: { name: 'Microsoft' } }))
      .mockResolvedValueOnce(json({ setupRequired: false, sso: { name: null } }))
      .mockResolvedValueOnce(json({ setupRequired: false }))
    const auth = createAuthApi(createApiClient(fetcher))

    await expect(auth.status()).resolves.toEqual({ setupRequired: false, sso: { name: 'Microsoft' } })
    await expect(auth.status()).resolves.toEqual({ setupRequired: false, sso: { name: null } })
    await expect(auth.status()).resolves.toEqual({ setupRequired: false, sso: null })
  })

  it('refuse un statut d’installation ambigu', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ setupRequired: 'false' }))

    await expect(createAuthApi(createApiClient(fetcher)).status()).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it.each([
    { ...administrator, role: 'SUPERUSER' },
    { ...administrator, id: Number.MAX_SAFE_INTEGER + 1 },
    { ...administrator, username: '' },
    { ...administrator, displayName: undefined },
  ])('ne considère pas un profil incompatible comme une connexion valide', async (user) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(user))

    await expect(createAuthApi(createApiClient(fetcher)).me()).rejects.toMatchObject({ kind: 'invalid-response' })
  })

  it('crée le premier administrateur puis ouvre sa session avec un nouveau jeton', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('setup'))
      .mockResolvedValueOnce(json(administrator, 201))
      .mockResolvedValueOnce(csrf('login'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(csrf('session'))
      .mockResolvedValueOnce(json(administrator))
    const setup = { ...input, setupToken: 'installer-generated-token', displayName: 'Nadjide' }

    await expect(createAuthApi(createApiClient(fetcher)).setup(setup)).resolves.toEqual(administrator)
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual([
      '/api/auth/csrf',
      '/api/auth/setup',
      '/api/auth/csrf',
      '/api/auth/login',
      '/api/auth/csrf',
      '/api/auth/me',
    ])
    expect(JSON.parse(String(fetcher.mock.calls[1]![1]?.body))).toEqual(setup)
    expect(new Headers(fetcher.mock.calls[3]![1]?.headers).get('X-CSRF-TOKEN')).toBe('login')
  })

  it('permet de vérifier puis rejoindre un compte créé même si sa connexion automatique a échoué', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('setup'))
      .mockResolvedValueOnce(json(administrator, 201))
      .mockRejectedValueOnce(new TypeError('Offline after setup'))
      .mockResolvedValueOnce(json({ setupRequired: false }))
      .mockResolvedValueOnce(csrf('recovered-anonymous'))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(csrf('recovered-session'))
      .mockResolvedValueOnce(json(administrator))
    const auth = createAuthApi(createApiClient(fetcher))

    await expect(
      auth.setup({ ...input, setupToken: 'installer-generated-token', displayName: 'Nadjide' }),
    ).rejects.toMatchObject({ name: 'AccountCreatedError', cause: { kind: 'network' } })
    await expect(auth.status()).resolves.toEqual({ setupRequired: false, sso: null })
    await expect(auth.login(input)).resolves.toEqual(administrator)
    expect(fetcher.mock.calls.filter(([path]) => path === '/api/auth/setup')).toHaveLength(1)
  })

  it('arrête la connexion annulée avant de lire le profil ou de notifier une session expirée', async () => {
    const controller = new AbortController()
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(csrf('anonymous'))
      .mockImplementationOnce(async () => {
        controller.abort()
        return new Response(null, { status: 204 })
      })

    await expect(createAuthApi(createApiClient(fetcher)).login(input, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(fetcher.mock.calls.map(([path]) => path)).toEqual(['/api/auth/csrf', '/api/auth/login'])
  })
})
