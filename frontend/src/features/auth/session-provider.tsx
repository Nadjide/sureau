import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiClient } from '@/lib/api-client'
import { AccountCreatedError, authApi, type LoginInput, type SessionUser, type SetupInput } from './auth-api'
import { SessionContext } from './session-context'
import { authenticatedSession, expiredSession, initialSession, sessionPermissions, signedOutSession, updateSessionUser, type SessionState } from './session-state'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(initialSession)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(state)
  const action = useRef<AbortController | null>(null)
  const probing = useRef<symbol | null>(null)
  const authEpoch = useRef(0)
  useEffect(() => { stateRef.current = state }, [state])

  const expire = useCallback((message?: string) => {
    authEpoch.current += 1
    probing.current = null
    apiClient.clearCsrf()
    setState((previous) => expiredSession(previous,
      message ?? (previous.phase === 'expired' ? previous.error : null)))
  }, [])

  const updateUser = useCallback((input: Pick<SessionUser, 'id' | 'displayName'>) => {
    if (stateRef.current.user?.id !== input.id) return
    authEpoch.current += 1
    probing.current = null
    setState((previous) => updateSessionUser(previous, input))
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    async function bootstrap() {
      try {
        const status = await authApi.status(controller.signal)
        if (controller.signal.aborted) return
        if (status.setupRequired) {
          setState((previous) => ({ phase: 'setup-required', user: null, error: null, generation: previous.generation }))
          return
        }
        try {
          const user = await authApi.me(controller.signal)
          if (!controller.signal.aborted) setState((previous) => authenticatedSession(previous, user))
        } catch (error) {
          if (controller.signal.aborted) return
          if (error instanceof ApiError && error.status === 401) {
            setState((previous) => signedOutSession(previous))
          } else throw error
        }
      } catch (error) {
        if (!controller.signal.aborted) setState((previous) => ({
          phase: 'error', user: null, generation: previous.generation,
          error: error instanceof Error ? error.message : 'La connexion à Sureau n’a pas pu être vérifiée.',
        }))
      }
    }
    void bootstrap()
    return () => controller.abort()
  }, [attempt])

  useEffect(() => apiClient.subscribeAuthFailure((error) => {
    // Auth requests manage their own failures. Other responses may belong to the preceding session.
    if (!stateRef.current.user || action.current) return
    if (error.status === 401) {
      expire()
      return
    }
    if (probing.current) return
    const probe = Symbol('session-probe')
    probing.current = probe
    const userId = stateRef.current.user.id
    const epoch = authEpoch.current
    // A 403 may be a permission denial, an expired session, or a stale CSRF token.
    // Probe the session and refresh CSRF; never replay the rejected mutation.
    void authApi.me().then(async (user) => {
      if (authEpoch.current !== epoch || stateRef.current.user?.id !== userId) return
      setState((previous) => authEpoch.current === epoch && previous.user?.id === userId ? authenticatedSession(previous, user) : previous)
      await authApi.refreshCsrf()
    }).catch((failure: unknown) => {
      if (failure instanceof ApiError && failure.status === 401 && authEpoch.current === epoch) {
        if (stateRef.current.user?.id === userId) expire()
      }
    }).finally(() => { if (probing.current === probe) probing.current = null })
  }), [expire])

  useEffect(() => () => { action.current?.abort() }, [])

  const authenticate = useCallback(async (input: LoginInput | SetupInput, setup: boolean) => {
    const epoch = ++authEpoch.current
    probing.current = null
    action.current?.abort()
    const controller = new AbortController()
    action.current = controller
    setBusy(true)
    try {
      const user = setup
        ? await authApi.setup(input as SetupInput, controller.signal)
        : await authApi.login(input, controller.signal)
      if (!controller.signal.aborted && authEpoch.current === epoch) setState((previous) => authenticatedSession(previous, user))
    } catch (error) {
      if (!controller.signal.aborted && authEpoch.current === epoch && error instanceof AccountCreatedError) {
        setState((previous) => signedOutSession(previous, error.message))
      }
      throw error
    } finally {
      if (action.current === controller) { action.current = null; setBusy(false) }
    }
  }, [])

  const logout = useCallback(async () => {
    const epoch = ++authEpoch.current
    probing.current = null
    action.current?.abort()
    const controller = new AbortController()
    action.current = controller
    setBusy(true)
    try {
      await authApi.logout(controller.signal)
      if (!controller.signal.aborted && action.current === controller) {
        authEpoch.current += 1
        probing.current = null
        setState((previous) => signedOutSession(previous))
      }
    } catch (error) {
      if (authEpoch.current === epoch && error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        try { await authApi.me(controller.signal) } catch (probeError) {
          if (authEpoch.current === epoch && probeError instanceof ApiError && probeError.status === 401) {
            setState((previous) => signedOutSession(previous))
          }
        }
        if (authEpoch.current === epoch) await authApi.refreshCsrf(controller.signal)
      }
      throw error
    } finally {
      if (action.current === controller) { action.current = null; setBusy(false) }
    }
  }, [])

  return <SessionContext value={{ state, ...sessionPermissions(state), busy,
    login: (input) => authenticate(input, false), setup: (input) => authenticate(input, true), logout, expire, updateUser,
    refresh: () => { setState((previous) => ({ ...initialSession, generation: previous.generation })); setAttempt((value) => value + 1) },
  }}>{children}</SessionContext>
}
