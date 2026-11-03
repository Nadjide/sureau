import { ApiError, apiClient, type createApiClient } from '@/lib/api-client'
import { t } from '@/lib/i18n'
import {
  adminUserListSchema,
  adminUserSchema,
  changeOwnPasswordInputSchema,
  createUserInputSchema,
  resetPasswordInputSchema,
  updateUserInputSchema,
  userIdSchema,
  type AdminUser,
  type ChangeOwnPasswordInput,
  type CreateUserInput,
  type ResetPasswordInput,
  type UpdateUserInput,
} from './user-schema'

function mutationError(error: unknown, message: string, signal?: AbortSignal): never {
  signal?.throwIfAborted()
  if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
    throw new ApiError(error.kind, message, error.status, error.code, error.fieldErrors)
  }
  throw error
}

/** Account mutations are sent once. An uncertain result requires verification before another submission. */
export function createUsersApi(client: ReturnType<typeof createApiClient> = apiClient) {
  return {
    async list(signal?: AbortSignal): Promise<AdminUser[]> {
      signal?.throwIfAborted()
      return client.requestJson('/api/users', (payload) => adminUserListSchema.parse(payload), signal ? { signal } : {})
    },

    async create(input: CreateUserInput, signal?: AbortSignal): Promise<AdminUser> {
      signal?.throwIfAborted()
      const validated = createUserInputSchema.parse(input)
      try {
        return await client.requestJson(
          '/api/users',
          (payload) => {
            const account = adminUserSchema.parse(payload)
            if (
              account.username !== validated.username ||
              account.displayName !== validated.displayName ||
              account.role !== validated.role ||
              !account.enabled ||
              account.email !== validated.email
            ) {
              throw new Error('The server did not confirm the requested account creation.')
            }
            return account
          },
          { method: 'POST', json: validated, ...(signal ? { signal } : {}) },
        )
      } catch (error) {
        return mutationError(
          error,
          t(
            'La création du compte n’a pas pu être confirmée. Actualisez la liste des comptes pour vérifier si cet identifiant existe avant de réessayer.',
          ),
          signal,
        )
      }
    },

    async update(id: number, input: UpdateUserInput, signal?: AbortSignal): Promise<AdminUser> {
      signal?.throwIfAborted()
      userIdSchema.parse(id)
      const validated = updateUserInputSchema.parse(input)
      try {
        return await client.requestJson(
          `/api/users/${id}`,
          (payload) => {
            const account = adminUserSchema.parse(payload)
            if (
              account.id !== id ||
              account.displayName !== validated.displayName ||
              account.role !== validated.role ||
              account.enabled !== validated.enabled ||
              account.email !== validated.email
            ) {
              throw new Error('The server did not confirm the requested account update.')
            }
            return account
          },
          { method: 'PUT', json: validated, ...(signal ? { signal } : {}) },
        )
      } catch (error) {
        return mutationError(
          error,
          t(
            'La modification du compte n’a pas pu être confirmée. Rechargez la liste des comptes pour vérifier sa situation avant de réessayer.',
          ),
          signal,
        )
      }
    },

    async resetPassword(id: number, input: ResetPasswordInput, signal?: AbortSignal): Promise<void> {
      signal?.throwIfAborted()
      userIdSchema.parse(id)
      const validated = resetPasswordInputSchema.parse(input)
      try {
        await client.requestVoid(`/api/users/${id}/password`, {
          method: 'POST',
          json: validated,
          ...(signal ? { signal } : {}),
        })
      } catch (error) {
        return mutationError(
          error,
          t(
            'La réinitialisation du mot de passe n’a pas pu être confirmée. Vérifiez l’accès au compte avec le nouveau mot de passe avant de demander une autre réinitialisation.',
          ),
          signal,
        )
      }
    },

    async changeOwnPassword(input: ChangeOwnPasswordInput, signal?: AbortSignal): Promise<void> {
      signal?.throwIfAborted()
      const validated = changeOwnPasswordInputSchema.parse(input)
      try {
        await client.requestVoid('/api/auth/password', {
          method: 'POST',
          json: validated,
          ...(signal ? { signal } : {}),
        })
        client.clearCsrf()
      } catch (error) {
        return mutationError(
          error,
          t(
            'Le changement du mot de passe n’a pas pu être confirmé. Vérifiez votre connexion avec le nouveau mot de passe avant de réessayer ; votre session peut avoir été révoquée.',
          ),
          signal,
        )
      }
    },
  }
}

export const usersApi = createUsersApi()
