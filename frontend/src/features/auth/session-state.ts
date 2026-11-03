import type { SessionUser } from './auth-api'
import { msg } from '@/lib/i18n'

export const roleLabels = { ADMIN: msg('Administrateur'), EDITOR: msg('Éditeur'), VIEWER: msg('Lecteur') } as const

export type SessionState =
  | { phase: 'checking' | 'setup-required'; user: null; error: null; generation: number }
  | { phase: 'anonymous'; user: null; error: string | null; generation: number }
  | { phase: 'authenticated' | 'expired'; user: SessionUser; error: string | null; generation: number }
  | { phase: 'error'; user: null; error: string; generation: number }

export const initialSession: SessionState = { phase: 'checking', user: null, error: null, generation: 0 }

export function authenticatedSession(previous: SessionState, user: SessionUser): SessionState {
  return {
    phase: 'authenticated',
    user,
    error: null,
    generation: previous.generation + (previous.user && previous.user.id !== user.id ? 1 : 0),
  }
}

export function expiredSession(previous: SessionState, message: string | null = null): SessionState {
  return previous.user ? { ...previous, phase: 'expired', error: message } : previous
}

export function updateSessionUser(
  previous: SessionState,
  input: Pick<SessionUser, 'id' | 'displayName'>,
): SessionState {
  if (!previous.user || previous.user.id !== input.id || previous.user.displayName === input.displayName)
    return previous
  return { ...previous, user: { ...previous.user, displayName: input.displayName } }
}

export function signedOutSession(previous: SessionState, message: string | null = null): SessionState {
  return { phase: 'anonymous', user: null, error: message, generation: previous.generation + 1 }
}

export function sessionPermissions(state: SessionState) {
  return {
    canEdit: state.phase === 'authenticated' && state.user.role !== 'VIEWER',
    canAdmin: state.phase === 'authenticated' && state.user.role === 'ADMIN',
  }
}
