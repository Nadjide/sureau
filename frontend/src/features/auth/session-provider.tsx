import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { ApiError, apiClient } from '@/lib/api-client'
import { AccountCreatedError, authApi, type LoginInput, type SetupInput } from './auth-api'
import { SessionContext } from './session-context'
import { authenticatedSession, expiredSession, initialSession, sessionPermissions, signedOutSession, type SessionState } from './session-state'

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>(initialSession)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const stateRef = useRef(state)
  const action = useRef<AbortController | null>(null)
  const probing = useRef(false)
  const authEpoch = useRef(0)
  useEffect(() => { stateRef.current = state }, [state])

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
    if (!stateRef.current.user) return
    if (error.status === 401) {
      apiClient.clearCsrf()
      setState((previous) => expiredSession(previous))
      return
    }
    if (probing.current) return
    probing.current = true
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
        setState((previous) => previous.user?.id === userId ? expiredSession(previous) : previous)
      }
    }).finally(() => { probing.current = false })
  }), [])

  useEffect(() => () => { action.current?.abort() }, [])

  const authenticate = useCallback(async (input: LoginInput | SetupInput, setup: boolean) => {
    authEpoch.current += 1
    action.current?.abort()
    const controller = new AbortController()
    action.current = controller
    setBusy(true)
    try {
      const user = setup
        ? await authApi.setup(input as SetupInput, controller.signal)
        : await authApi.login(input, controller.signal)
      if (!controller.signal.aborted) setState((previous) => authenticatedSession(previous, user))
    } catch (error) {
      if (!controller.signal.aborted && error instanceof AccountCreatedError) {
        setState((previous) => signedOutSession(previous, error.message))
      }
      throw error
    } finally {
      if (action.current === controller) { action.current = null; setBusy(false) }
    }
  }, [])

  const logout = useCallback(async () => {
    authEpoch.current += 1
    action.current?.abort()
    const controller = new AbortController()
    action.current = controller
    setBusy(true)
    try {
      await authApi.logout(controller.signal)
      if (!controller.signal.aborted) setState((previous) => signedOutSession(previous))
    } catch (error) {
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        try { await authApi.me(controller.signal) } catch (probeError) {
          if (probeError instanceof ApiError && probeError.status === 401) setState((previous) => signedOutSession(previous))
        }
        await authApi.refreshCsrf(controller.signal)
      }
      throw error
    } finally {
      if (action.current === controller) { action.current = null; setBusy(false) }
    }
  }, [])

  return <SessionContext value={{ state, ...sessionPermissions(state), busy,
    login: (input) => authenticate(input, false), setup: (input) => authenticate(input, true), logout,
    refresh: () => { setState((previous) => ({ ...initialSession, generation: previous.generation })); setAttempt((value) => value + 1) },
  }}>{children}</SessionContext>
}
