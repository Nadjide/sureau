import { z } from 'zod'

export const userIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const userRoleSchema = z.enum(['ADMIN', 'EDITOR', 'VIEWER'])

const encoder = new TextEncoder()
const usernameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/, 'Utilisez 3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.')

function databaseText(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const character = value.charCodeAt(index)
    if (character === 0) return false
    if (character >= 0xd800 && character <= 0xdbff) {
      const following = value.charCodeAt(index + 1)
      if (!(following >= 0xdc00 && following <= 0xdfff)) return false
      index++
    } else if (character >= 0xdc00 && character <= 0xdfff) return false
  }
  return true
}

const displayNameSchema = z.string().min(1, 'Donnez un nom à ce compte.').max(80, 'Utilisez au plus 80 caractères.')
  .refine((name) => name.trim().length > 0, 'Donnez un nom à ce compte.')
  .refine(databaseText, 'Le nom contient un caractère incompatible avec la base de données.')

function passwordSchema(minimum: number) {
  return z.string().min(minimum, `Utilisez au moins ${minimum} caractères.`).max(64, 'Utilisez au plus 64 caractères.')
    .refine((password) => password.trim().length > 0, 'Le mot de passe est obligatoire.')
    .refine((password) => encoder.encode(password).byteLength <= 72, 'Le mot de passe ne doit pas dépasser 72 octets en UTF-8.')
}

const newPasswordSchema = passwordSchema(12)

export const adminUserSchema = z.object({
  id: userIdSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  enabled: z.boolean(),
})

export const adminUserListSchema = z.array(adminUserSchema).superRefine((users, context) => {
  const ids = new Set<number>()
  const usernames = new Set<string>()
  for (const [index, user] of users.entries()) {
    if (ids.has(user.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: 'Chaque compte doit avoir un identifiant unique.' })
    if (usernames.has(user.username)) context.addIssue({ code: 'custom', path: [index, 'username'], message: 'Chaque compte doit avoir un nom d’utilisateur unique.' })
    ids.add(user.id)
    usernames.add(user.username)
  }
})

export const createUserInputSchema = z.strictObject({
  username: z.string().trim().toLowerCase().pipe(usernameSchema),
  displayName: z.string().trim().pipe(displayNameSchema),
  password: newPasswordSchema,
  role: userRoleSchema,
})

export const updateUserInputSchema = z.strictObject({
  displayName: z.string().trim().pipe(displayNameSchema),
  role: userRoleSchema,
  enabled: z.boolean(),
})

export const resetPasswordInputSchema = z.strictObject({ password: newPasswordSchema })
export const changeOwnPasswordInputSchema = z.strictObject({
  currentPassword: passwordSchema(1),
  newPassword: newPasswordSchema,
})

export type AdminUser = z.infer<typeof adminUserSchema>
export type UserRole = z.infer<typeof userRoleSchema>
export type CreateUserInput = z.infer<typeof createUserInputSchema>
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>
export type ChangeOwnPasswordInput = z.infer<typeof changeOwnPasswordInputSchema>
