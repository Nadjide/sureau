import { describe, expect, it } from 'vitest'
import {
  adminUserListSchema, adminUserSchema, changeOwnPasswordInputSchema, createUserInputSchema,
  resetPasswordInputSchema, sameEmail, updateUserInputSchema,
} from './user-schema'

const creation = {
  username: 'equipe.atelier', displayName: 'Équipe Atelier', role: 'EDITOR', password: 'Sureau-test-only-42!',
}
const update = { displayName: creation.displayName, role: creation.role, enabled: true, email: null }
const user = { id: 42, username: creation.username, displayName: creation.displayName, role: creation.role, enabled: true, email: null }

function newPasswordResults(password: unknown): boolean[] {
  return [
    createUserInputSchema.safeParse({ ...creation, password }).success,
    resetPasswordInputSchema.safeParse({ password }).success,
    changeOwnPasswordInputSchema.safeParse({ currentPassword: creation.password, newPassword: password }).success,
  ]
}

describe('saisie des comptes de l’instance', () => {
  it('normalise uniquement l’identifiant et le nom sans modifier les espaces du mot de passe', () => {
    const password = '  secret pour atelier  '
    expect(createUserInputSchema.parse({
      ...creation, username: '  ÉQUIPE  '.replace('É', 'E'), displayName: '  Équipe Atelier 🪴  ', password,
    })).toEqual({ username: 'equipe', displayName: 'Équipe Atelier 🪴', password, role: 'EDITOR', email: null })
    expect(updateUserInputSchema.parse({ ...update, displayName: '  Équipe Atelier  ', enabled: false }))
      .toEqual({ ...update, enabled: false })
  })

  it('accepte une adresse e-mail facultative pour la connexion d’entreprise', () => {
    expect(createUserInputSchema.parse({ ...creation, email: '  Camille@Exemple.fr ' }).email).toBe('Camille@Exemple.fr')
    expect(updateUserInputSchema.parse({ ...update, email: '   ' }).email).toBeNull()
    expect(updateUserInputSchema.safeParse({ ...update, email: 'camille' }).error?.issues[0]?.message)
      .toBe('Renseignez une adresse e-mail valide.')
    expect(sameEmail('Camille@Exemple.fr', ' camille@exemple.FR ')).toBe(true)
    expect(sameEmail(null, '')).toBe(true)
    expect(sameEmail('camille@exemple.fr', null)).toBe(false)
  })

  it('accepte les identifiants compatibles avec le serveur aux bornes de longueur après normalisation', () => {
    for (const username of ['ABC', 'a'.repeat(50), 'a.1-b_2']) {
      expect(createUserInputSchema.parse({ ...creation, username: ` ${username} ` }).username).toBe(username.toLowerCase())
    }
  })

  it.each(['ab', 'a'.repeat(51), 'equipe atelier', 'équipe', '-atelier', '_atelier', 'atelier/admin']) (
    'refuse un identifiant incompatible sans le réparer silencieusement : %s', (username) => {
      expect(createUserInputSchema.safeParse({ ...creation, username }).success).toBe(false)
    },
  )

  it('valide la longueur du nom après avoir retiré uniquement ses espaces extérieurs', () => {
    const name = 'É'.repeat(80)
    expect(createUserInputSchema.parse({ ...creation, displayName: ` ${name} ` }).displayName).toBe(name)
    expect(updateUserInputSchema.parse({ ...update, displayName: ` ${name} ` }).displayName).toBe(name)
    for (const displayName of ['', ' \t ', 'N'.repeat(81)]) {
      expect(createUserInputSchema.safeParse({ ...creation, displayName }).success).toBe(false)
      expect(updateUserInputSchema.safeParse({ ...update, displayName }).success).toBe(false)
    }
  })

  it.each(['\u0000', '\ud800', '\udfff', '\ud800\ud800']) (
    'refuse un nom incompatible avec PostgreSQL avant création ou modification : %j', (invalid) => {
      const displayName = `Atelier${invalid}`
      expect(createUserInputSchema.safeParse({ ...creation, displayName }).success).toBe(false)
      expect(updateUserInputSchema.safeParse({ ...update, displayName }).success).toBe(false)
      expect(adminUserSchema.safeParse({ ...user, displayName }).success).toBe(false)
    },
  )

  it('conserve les caractères accentués et les paires Unicode valides dans le nom', () => {
    const displayName = 'Équipe 東京 🪴'
    expect(createUserInputSchema.parse({ ...creation, displayName }).displayName).toBe(displayName)
    expect(updateUserInputSchema.parse({ ...update, displayName }).displayName).toBe(displayName)
    expect(adminUserSchema.parse({ ...user, displayName }).displayName).toBe(displayName)
  })

  it('exige un rôle explicite connu lors de la création et de la modification', () => {
    for (const role of ['ADMIN', 'EDITOR', 'VIEWER']) {
      expect(createUserInputSchema.parse({ ...creation, role }).role).toBe(role)
      expect(updateUserInputSchema.parse({ ...update, role }).role).toBe(role)
    }
    for (const role of [undefined, null, '', 'OWNER', 'admin']) {
      expect(createUserInputSchema.safeParse({ ...creation, role }).success).toBe(false)
      expect(updateUserInputSchema.safeParse({ ...update, role }).success).toBe(false)
    }
  })

  it('exige un vrai booléen d’activation et respecte une désactivation explicite', () => {
    expect(updateUserInputSchema.parse({ ...update, enabled: false }).enabled).toBe(false)
    for (const enabled of [undefined, null, 'false', 'true', 0, 1]) {
      expect(updateUserInputSchema.safeParse({ ...update, enabled }).success).toBe(false)
    }
  })

  it('n’envoie pas de champs serveur, de changement d’identifiant ou de mot de passe dans le mauvais DTO', () => {
    expect(createUserInputSchema.safeParse({ ...creation, id: 42 }).success).toBe(false)
    expect(createUserInputSchema.safeParse({ ...creation, enabled: false }).success).toBe(false)
    expect(updateUserInputSchema.safeParse({ ...update, username: 'nouveau' }).success).toBe(false)
    expect(updateUserInputSchema.safeParse({ ...update, password: creation.password }).success).toBe(false)
    expect(resetPasswordInputSchema.safeParse({ password: creation.password, role: 'ADMIN' }).success).toBe(false)
    expect(changeOwnPasswordInputSchema.safeParse({
      currentPassword: creation.password, newPassword: creation.password, userId: 42,
    }).success).toBe(false)
  })
})

describe('contrats des mots de passe', () => {
  it('applique les mêmes bornes de caractères aux nouveaux mots de passe des trois opérations', () => {
    expect(newPasswordResults('a'.repeat(12))).toEqual([true, true, true])
    expect(newPasswordResults('a'.repeat(64))).toEqual([true, true, true])
    expect(newPasswordResults('a'.repeat(11))).toEqual([false, false, false])
    expect(newPasswordResults('a'.repeat(65))).toEqual([false, false, false])
  })

  it('compte les 72 octets UTF-8 indépendamment du nombre de caractères', () => {
    expect(newPasswordResults('é'.repeat(36))).toEqual([true, true, true])
    expect(newPasswordResults('é'.repeat(37))).toEqual([false, false, false])
    expect(newPasswordResults('🪴'.repeat(18))).toEqual([true, true, true])
    expect(newPasswordResults('🪴'.repeat(19))).toEqual([false, false, false])
  })

  it('garde chaque espace significatif, y compris au bord de la limite UTF-8', () => {
    const password = `${'é'.repeat(35)}  `
    expect(new TextEncoder().encode(password).byteLength).toBe(72)
    expect(createUserInputSchema.parse({ ...creation, password }).password).toBe(password)
    expect(resetPasswordInputSchema.parse({ password }).password).toBe(password)
    expect(changeOwnPasswordInputSchema.parse({ currentPassword: password, newPassword: password }))
      .toEqual({ currentPassword: password, newPassword: password })
  })

  it('ne transforme pas un mot de passe absent, numérique ou entièrement blanc en secret valide', () => {
    for (const password of [undefined, null, 123456789012, '', ' '.repeat(12), '\t'.repeat(12)]) {
      expect(newPasswordResults(password)).toEqual([false, false, false])
    }
  })

  it('laisse le serveur vérifier le mot de passe courant sans lui imposer le minimum d’un nouveau secret', () => {
    expect(changeOwnPasswordInputSchema.parse({ currentPassword: 'x', newPassword: creation.password }).currentPassword).toBe('x')
    const currentPassword = '  ancien secret  '
    expect(changeOwnPasswordInputSchema.parse({ currentPassword, newPassword: creation.password }).currentPassword)
      .toBe(currentPassword)
  })

  it('refuse les mots de passe courants blancs, absents ou incompatibles avec les limites de connexion', () => {
    for (const currentPassword of [undefined, null, '', ' \t ', 'a'.repeat(65), 'é'.repeat(37)]) {
      expect(changeOwnPasswordInputSchema.safeParse({ currentPassword, newPassword: creation.password }).success).toBe(false)
    }
    expect(changeOwnPasswordInputSchema.safeParse({ currentPassword: 'a'.repeat(64), newPassword: creation.password }).success).toBe(true)
  })
})

describe('réponses administratives des comptes', () => {
  it('retient seulement les six champs publics même si une réponse contient des champs internes', () => {
    const payload = { ...user, password: 'ne-pas-conserver', passwordHash: 'hash-interne', authVersion: 8, futureField: true }
    expect(adminUserSchema.parse(payload)).toEqual(user)
    expect(adminUserListSchema.parse([payload])).toEqual([user])
    expect(Object.keys(adminUserSchema.parse(payload))).toEqual(['id', 'username', 'displayName', 'role', 'enabled', 'email'])
    expect(payload.passwordHash).toBe('hash-interne')
  })

  it('ne normalise pas une identité reçue du serveur au point de masquer une incohérence', () => {
    expect(adminUserSchema.safeParse({ ...user, username: '  equipe.atelier  ' }).success).toBe(false)
    expect(adminUserSchema.safeParse({ ...user, username: 'EQUIPE.ATELIER' }).success).toBe(false)
    expect(adminUserSchema.parse({ ...user, displayName: ' Équipe Atelier ' }).displayName).toBe(' Équipe Atelier ')
  })

  it('accepte les identifiants durables jusqu’à la limite sûre JavaScript sans coercition', () => {
    expect(adminUserSchema.parse({ ...user, id: Number.MAX_SAFE_INTEGER }).id).toBe(Number.MAX_SAFE_INTEGER)
    for (const id of [undefined, null, '42', 0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.POSITIVE_INFINITY]) {
      expect(adminUserSchema.safeParse({ ...user, id }).success).toBe(false)
    }
  })

  it('exige les informations réelles du serveur sans inventer de rôle, de nom ou d’activation', () => {
    expect(adminUserSchema.parse({ ...user, enabled: false }).enabled).toBe(false)
    for (const enabled of [undefined, null, 'false', 0]) {
      expect(adminUserSchema.safeParse({ ...user, enabled }).success).toBe(false)
    }
    expect(adminUserSchema.safeParse({ ...user, role: 'OWNER' }).success).toBe(false)
    expect(adminUserSchema.safeParse({ ...user, displayName: ' \t ' }).success).toBe(false)
    expect(adminUserSchema.safeParse({ ...user, username: undefined }).success).toBe(false)
  })

  it('rejette une liste avec des identifiants ou des noms de connexion dupliqués', () => {
    expect(adminUserListSchema.safeParse([user, { ...user, username: 'autre' }]).success).toBe(false)
    expect(adminUserListSchema.safeParse([user, { ...user, id: 73 }]).success).toBe(false)
    expect(adminUserListSchema.parse([user, { ...user, id: 73, username: 'autre', enabled: false }]))
      .toEqual([user, { ...user, id: 73, username: 'autre', enabled: false }])
    expect(adminUserListSchema.parse([])).toEqual([])
  })
})
