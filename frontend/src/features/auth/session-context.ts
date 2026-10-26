import { createContext } from 'react'
import type { EnterpriseSignIn, LoginInput, SessionUser, SetupInput } from './auth-api'
import type { SessionState } from './session-state'

export interface SessionContextValue {
  state: SessionState
  /** Enterprise sign-in offered by this instance, if any. */
  enterpriseSignIn: EnterpriseSignIn | null
  canEdit: boolean
  canAdmin: boolean
  busy: boolean
  login(input: LoginInput): Promise<void>
  setup(input: SetupInput): Promise<void>
  logout(): Promise<void>
  expire(message?: string): void
  updateUser(input: Pick<SessionUser, 'id' | 'displayName'>): void
  refresh(): void
}

export const SessionContext = createContext<SessionContextValue | null>(null)
