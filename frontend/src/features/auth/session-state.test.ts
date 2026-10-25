import { describe, expect, it } from 'vitest'
import type { SessionUser } from './auth-api'
import { authenticatedSession, expiredSession, initialSession, sessionPermissions, signedOutSession } from './session-state'

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
