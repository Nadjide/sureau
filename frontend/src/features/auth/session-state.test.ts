import { describe, expect, it } from 'vitest'
import type { SessionUser } from './auth-api'
import { authenticatedSession, expiredSession, initialSession, sessionPermissions, signedOutSession, updateSessionUser, type SessionState } from './session-state'

const user: SessionUser = { id: 1, username: 'nadjide', displayName: 'Nadjide', role: 'ADMIN' }

describe('cycle de session et brouillon', () => {
  it('conserve la génération du brouillon pendant une expiration et la reconnexion du même compte', () => {
    const connected = authenticatedSession(initialSession, user)
    const expired = expiredSession(connected)
    const recovered = authenticatedSession(expired, user)

    expect(expired).toMatchObject({ phase: 'expired', user, generation: connected.generation })
    expect(sessionPermissions(expired)).toEqual({ canEdit: false, canAdmin: false })
    expect(recovered).toMatchObject({ phase: 'authenticated', user, generation: connected.generation })
  })

  it('change de génération lorsque la reconnexion utilise un autre compte', () => {
    const connected = authenticatedSession(initialSession, user)
    const replacement = authenticatedSession(expiredSession(connected), { ...user, id: 2, username: 'colleague' })

    expect(replacement.generation).toBe(connected.generation + 1)
    expect(replacement.user?.id).toBe(2)
  })

  it('retire le profil et renouvelle la génération lors d’une déconnexion explicite', () => {
    const connected = authenticatedSession(initialSession, user)
    const anonymous = signedOutSession(connected)

    expect(anonymous).toEqual({ phase: 'anonymous', user: null, error: null, generation: connected.generation + 1 })
    expect(sessionPermissions(anonymous)).toEqual({ canEdit: false, canAdmin: false })
  })

  it.each([
    { role: 'ADMIN' as const, canEdit: true, canAdmin: true },
    { role: 'EDITOR' as const, canEdit: true, canAdmin: false },
    { role: 'VIEWER' as const, canEdit: false, canAdmin: false },
  ])('applique les droits du rôle $role', ({ role, canEdit, canAdmin }) => {
    expect(sessionPermissions(authenticatedSession(initialSession, { ...user, role }))).toEqual({ canEdit, canAdmin })
  })

  it('prend en compte les nouveaux droits sans jeter le brouillon du même utilisateur', () => {
    const connected = authenticatedSession(initialSession, user)
    const downgraded = authenticatedSession(connected, { ...user, role: 'VIEWER' })

    expect(downgraded.generation).toBe(connected.generation)
    expect(sessionPermissions(downgraded)).toEqual({ canEdit: false, canAdmin: false })
  })

  it('n’invente pas d’utilisateur lorsqu’une requête anonyme échoue', () => {
    expect(expiredSession(initialSession)).toEqual(initialSession)
    expect(sessionPermissions(initialSession)).toEqual({ canEdit: false, canAdmin: false })
  })
})

describe('actualisation du nom du compte courant', () => {
  it('applique uniquement le nom confirmé du même compte en conservant son rôle et son brouillon', () => {
    const connected = authenticatedSession({ ...initialSession, generation: 7 }, user)
    const incoming: SessionUser = { ...user, displayName: 'Équipe Sureau', username: 'autre-identifiant', role: 'VIEWER' }

    const updated = updateSessionUser(connected, incoming)

    expect(updated).toEqual({ ...connected, user: { ...user, displayName: 'Équipe Sureau' } })
    expect(sessionPermissions(updated)).toEqual({ canEdit: true, canAdmin: true })
    expect(connected.user?.displayName).toBe('Nadjide')
  })

  it('garde une session expirée suspendue après une réponse tardive de renommage', () => {
    const suspended = expiredSession(authenticatedSession({ ...initialSession, generation: 9 }, user))
    const updated = updateSessionUser(suspended, { id: user.id, displayName: 'Nouveau nom' })

    expect(updated).toMatchObject({ phase: 'expired', generation: 9, user: { ...user, displayName: 'Nouveau nom' } })
    expect(sessionPermissions(updated)).toEqual({ canEdit: false, canAdmin: false })
  })

  it('ignore une modification concernant un autre compte', () => {
    const connected = authenticatedSession(initialSession, user)

    expect(updateSessionUser(connected, { id: 73, displayName: 'Autre personne' })).toBe(connected)
  })

  it('ignore la réponse de l’ancien compte lorsque la reconnexion a changé d’identité', () => {
    const connected = authenticatedSession(initialSession, user)
    const replacement = authenticatedSession(expiredSession(connected), {
      id: 73, username: 'collegue', displayName: 'Collègue', role: 'EDITOR',
    })

    const afterLateResponse = updateSessionUser(replacement, { id: user.id, displayName: 'Ancienne réponse' })

    expect(afterLateResponse).toBe(replacement)
    expect(afterLateResponse).toMatchObject({ generation: connected.generation + 1, user: { id: 73, displayName: 'Collègue' } })
    expect(sessionPermissions(afterLateResponse)).toEqual({ canEdit: true, canAdmin: false })
  })

  it('ne recrée pas de profil après une déconnexion ou pendant la vérification de connexion', () => {
    const states: SessionState[] = [
      initialSession,
      { phase: 'setup-required', user: null, error: null, generation: 3 },
      signedOutSession(authenticatedSession(initialSession, user)),
      { phase: 'error', user: null, error: 'Service indisponible', generation: 4 },
    ]
    for (const state of states) {
      expect(updateSessionUser(state, { id: user.id, displayName: 'Réponse tardive' })).toBe(state)
    }
  })

  it('préserve le nom confirmé et la suspension quel que soit l’ordre de la réponse et de l’expiration', () => {
    const connected = authenticatedSession({ ...initialSession, generation: 5 }, user)
    const input = { id: user.id, displayName: 'Nom confirmé' }
    const renamedThenExpired = expiredSession(updateSessionUser(connected, input))
    const expiredThenRenamed = updateSessionUser(expiredSession(connected), input)

    expect(renamedThenExpired).toEqual(expiredThenRenamed)
    expect(expiredThenRenamed).toMatchObject({ phase: 'expired', generation: 5, user: { displayName: 'Nom confirmé' } })
    expect(sessionPermissions(expiredThenRenamed)).toEqual({ canEdit: false, canAdmin: false })
  })
})
