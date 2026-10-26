import { z } from 'zod'
import { plural, t } from '@/lib/i18n'

export const userIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)
export const userRoleSchema = z.enum(['ADMIN', 'EDITOR', 'VIEWER'])

// Messages are written when a value is checked, so they follow the language chosen meanwhile.
const atMost = (count: number) => ({ error: () => t('Utilisez au plus {count} caractères.', { count }) })
const encoder = new TextEncoder()
const usernameSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{2,49}$/, { error: () => t('Utilisez 3 à 50 caractères : lettres, chiffres, point, tiret ou tiret bas.') })

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

const displayNameSchema = z.string().min(1, { error: () => t('Donnez un nom à ce compte.') }).max(80, atMost(80))
  .refine((name) => name.trim().length > 0, { error: () => t('Donnez un nom à ce compte.') })
  .refine(databaseText, { error: () => t('Le nom contient un caractère incompatible avec la base de données.') })

function passwordSchema(minimum: number) {
  return z.string()
    .min(minimum, { error: () => plural(minimum, 'Utilisez au moins {count} caractère.', 'Utilisez au moins {count} caractères.') })
    .max(64, atMost(64))
    .refine((password) => password.trim().length > 0, { error: () => t('Le mot de passe est obligatoire.') })
    .refine((password) => encoder.encode(password).byteLength <= 72, { error: () => t('Le mot de passe ne doit pas dépasser 72 octets en UTF-8.') })
}

const newPasswordSchema = passwordSchema(12)

// Optional; it lets the person use the enterprise sign-in, matched without regard to case.
const emailSchema = z.preprocess((value) => typeof value === 'string' ? value.trim() || null : value,
  z.email({ error: () => t('Renseignez une adresse e-mail valide.') }).max(254, atMost(254)).nullable())

export const adminUserSchema = z.object({
  id: userIdSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  role: userRoleSchema,
  enabled: z.boolean(),
  email: z.string().nullable().default(null),
})

/** Two addresses that open the same account. */
export function sameEmail(first: string | null | undefined, second: string | null | undefined): boolean {
  return (first ?? '').trim().toLowerCase() === (second ?? '').trim().toLowerCase()
}

export const adminUserListSchema = z.array(adminUserSchema).superRefine((users, context) => {
  const ids = new Set<number>()
  const usernames = new Set<string>()
  for (const [index, user] of users.entries()) {
    if (ids.has(user.id)) context.addIssue({ code: 'custom', path: [index, 'id'], message: t('Chaque compte doit avoir un identifiant unique.') })
    if (usernames.has(user.username)) context.addIssue({ code: 'custom', path: [index, 'username'], message: t('Chaque compte doit avoir un nom d’utilisateur unique.') })
    ids.add(user.id)
    usernames.add(user.username)
  }
})

export const createUserInputSchema = z.strictObject({
  username: z.string().trim().toLowerCase().pipe(usernameSchema),
  displayName: z.string().trim().pipe(displayNameSchema),
  password: newPasswordSchema,
  role: userRoleSchema,
  email: emailSchema.default(null),
})

export const updateUserInputSchema = z.strictObject({
  displayName: z.string().trim().pipe(displayNameSchema),
  role: userRoleSchema,
  enabled: z.boolean(),
  email: emailSchema.default(null),
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
