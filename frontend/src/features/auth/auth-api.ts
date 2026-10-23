import { z } from 'zod'
import { apiClient, type createApiClient } from '@/lib/api-client'

export const sessionUserSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  username: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(['ADMIN', 'EDITOR', 'VIEWER']),
})
export type SessionUser = z.infer<typeof sessionUserSchema>
export interface LoginInput { username: string; password: string }
export interface SetupInput extends LoginInput { setupToken: string; displayName: string }

export class AccountCreatedError extends Error {
  constructor(cause: unknown) {
    super('Votre compte administrateur a été créé. Connectez-vous avec votre identifiant et votre mot de passe pour continuer.', { cause })
    this.name = 'AccountCreatedError'
  }
}

const setupStatusSchema = z.object({ setupRequired: z.boolean() })

export function createAuthApi(client: ReturnType<typeof createApiClient> = apiClient) {
  async function me(signal?: AbortSignal): Promise<SessionUser> {
    return client.requestJson('/api/auth/me', (payload) => sessionUserSchema.parse(payload),
      { notifyAuthFailure: false, ...(signal ? { signal } : {}) })
  }
  async function login(input: LoginInput, signal?: AbortSignal): Promise<SessionUser> {
    // A new masked token also recovers from an expired anonymous session.
    await client.refreshCsrf(signal)
    await client.requestVoid('/api/auth/login', {
      method: 'POST', body: new URLSearchParams({ username: input.username.trim(), password: input.password }),
      notifyAuthFailure: false, ...(signal ? { signal } : {}),
    })
    await client.refreshCsrf(signal)
    return me(signal)
  }
  return {
    me, login,
    status: (signal?: AbortSignal) => client.requestJson('/api/auth/status',
      (payload) => setupStatusSchema.parse(payload), { notifyAuthFailure: false, ...(signal ? { signal } : {}) }),
    async setup(input: SetupInput, signal?: AbortSignal): Promise<SessionUser> {
      await client.refreshCsrf(signal)
      await client.requestJson('/api/auth/setup', (payload) => sessionUserSchema.parse(payload), {
        method: 'POST', json: input, notifyAuthFailure: false, ...(signal ? { signal } : {}),
      })
      try { return await login(input, signal) } catch (error) {
        signal?.throwIfAborted()
        throw new AccountCreatedError(error)
      }
    },
    async logout(signal?: AbortSignal): Promise<void> {
      await client.requestVoid('/api/auth/logout', {
        method: 'POST', notifyAuthFailure: false, ...(signal ? { signal } : {}),
      })
      client.clearCsrf()
    },
    refreshCsrf: client.refreshCsrf,
  }
}

export const authApi = createAuthApi()
