export type ApiErrorKind = 'network' | 'http' | 'invalid-response'

export class ApiError extends Error {
  readonly kind: ApiErrorKind
  readonly status: number | null
  readonly code: string | null
  readonly fieldErrors: Readonly<Record<string, string>>

  constructor(kind: ApiErrorKind, message: string, status: number | null = null,
    code: string | null = null, fieldErrors: Readonly<Record<string, string>> = {}) {
    super(message)
    this.name = 'ApiError'
    this.kind = kind
    this.status = status
    this.code = code
    this.fieldErrors = fieldErrors
  }
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  json?: unknown
  body?: URLSearchParams
  signal?: AbortSignal
  notifyAuthFailure?: boolean
  fetcher?: typeof fetch
  ifMatch?: number
}

type AuthFailureListener = (error: ApiError) => void
interface CsrfToken { token: string; headerName: string }

const messages: Record<string, string> = {
  INVALID_CREDENTIALS: 'L’identifiant ou le mot de passe est incorrect.',
  AUTHENTICATION_REQUIRED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  ACCESS_DENIED: 'Votre session ou vos droits ne permettent pas cette action. Réessayez après vérification de la connexion.',
  VALIDATION_ERROR: 'Vérifiez les champs indiqués avant de réessayer.',
  MALFORMED_REQUEST: 'La demande contient des données invalides.',
  INVALID_REQUEST: 'Les informations saisies ne permettent pas de terminer cette action.',
  DUPLICATE_RESOURCE: 'Cet identifiant est déjà utilisé. Choisissez-en un autre.',
  LAST_ADMIN_REQUIRED: 'Conservez au moins un compte administrateur actif. Cette modification n’a pas été appliquée.',
  CURRENT_PASSWORD_INVALID: 'Le mot de passe actuel est incorrect. Vérifiez-le avant de réessayer.',
  ASSET_CONFLICT: 'Cette fiche a été modifiée par une autre personne. Votre saisie est conservée. Rechargez la version du serveur avant de poursuivre.',
  ASSET_STATUS_CONFLICT: 'Un matériel affecté doit d’abord être désaffecté et enregistré avant de pouvoir être retiré du parc.',
  WORKSPACE_CONFLICT: 'L’espace a changé sur le serveur. Votre brouillon est conservé.',
  WORKSPACE_INVALID: 'L’espace contient des données invalides et n’a pas été enregistré.',
  WORKSPACE_TOO_LARGE: 'L’espace dépasse la taille autorisée.',
  PAYLOAD_TOO_LARGE: 'Les données envoyées sont trop volumineuses.',
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function validationMessage(value: unknown): string {
  if (typeof value !== 'string') return 'Vérifiez ce champ.'
  if (/must not be (blank|null|empty)/i.test(value)) return 'Ce champ est obligatoire.'
  const size = /size must be between (\d+) and (\d+)/i.exec(value)
  if (size) return `Utilisez entre ${size[1]} et ${size[2]} caractères.`
  if (/must match/i.test(value)) return 'Utilisez le format demandé.'
  return 'Vérifiez la valeur de ce champ.'
}

function tooManyAttempts(retryAfter: string | null): string {
  const seconds = Number(retryAfter)
  if (!retryAfter || !Number.isFinite(seconds) || seconds <= 0) {
    return 'Trop de tentatives échouées. Patientez quelques minutes avant de réessayer.'
  }
  if (seconds < 60) {
    const rounded = Math.ceil(seconds)
    return `Trop de tentatives échouées. Réessayez dans ${rounded} seconde${rounded > 1 ? 's' : ''}.`
  }
  const minutes = Math.ceil(seconds / 60)
  return `Trop de tentatives échouées. Réessayez dans ${minutes} minute${minutes > 1 ? 's' : ''}.`
}

async function responseError(response: Response): Promise<ApiError> {
  let payload: unknown
  try { payload = await response.json() } catch { /* Proxies may return an HTML error page. */ }
  const code = object(payload) && typeof payload.code === 'string' ? payload.code : null
  const fields: Record<string, string> = Object.create(null) as Record<string, string>
  if (object(payload) && Array.isArray(payload.errors)) {
    for (const error of payload.errors) {
      if (object(error) && typeof error.field === 'string') fields[error.field] = validationMessage(error.message)
    }
  }
  // The server locks an account or address after repeated failures; Retry-After gives the wait.
  if (response.status === 429) return new ApiError('http', tooManyAttempts(response.headers.get('Retry-After')), 429, code, fields)
  const fallback = response.status >= 500
    ? 'Le service est momentanément indisponible. Réessayez dans un instant.'
    : response.status === 401 ? messages.AUTHENTICATION_REQUIRED!
      : response.status === 403 ? messages.ACCESS_DENIED!
        : response.status === 404 ? 'La ressource demandée est introuvable.'
          : response.status === 409 ? 'Ces informations ont changé ou sont déjà utilisées. Vérifiez-les avant de réessayer.'
            : response.status === 412 ? 'Cette fiche a changé sur le serveur. Votre saisie est conservée ; rechargez la fiche avant de poursuivre.'
            : 'La demande n’a pas pu être terminée. Réessayez dans un instant.'
  return new ApiError('http', code && Object.hasOwn(messages, code) ? messages[code]! : fallback, response.status, code, fields)
}

/** One instance per browser origin. Credentials and CSRF never enter browser storage. */
export function createApiClient(defaultFetcher: typeof fetch = (...args) => fetch(...args)) {
  let csrf: CsrfToken | null = null
  let csrfGeneration = 0
  const listeners = new Set<AuthFailureListener>()

  async function request(path: string, options: ApiRequestOptions): Promise<Response> {
    if (!path.startsWith('/api/') || path.startsWith('//')) throw new Error('An API path on the current origin is required.')
    options.signal?.throwIfAborted()
    if (options.ifMatch !== undefined && (!Number.isSafeInteger(options.ifMatch) || options.ifMatch < 0)) {
      throw new RangeError('Une révision entière positive ou nulle est requise.')
    }
    const method = options.method || 'GET'
    const fetcher = options.fetcher || defaultFetcher
    const headers = new Headers({ Accept: 'application/json' })
    if (options.ifMatch !== undefined) headers.set('If-Match', `"${options.ifMatch}"`)
    if (method !== 'GET') {
      const token = csrf || await refreshCsrf(options.signal, fetcher)
      options.signal?.throwIfAborted()
      headers.set(token.headerName, token.token)
    }
    const init: RequestInit = { method, credentials: 'same-origin', headers }
    if (options.signal) init.signal = options.signal
    if (options.json !== undefined) {
      headers.set('Content-Type', 'application/json')
      init.body = JSON.stringify(options.json)
    } else if (options.body) {
      headers.set('Content-Type', 'application/x-www-form-urlencoded;charset=UTF-8')
      init.body = options.body.toString()
    }
    let response: Response
    try { response = await fetcher(path, init) } catch {
      options.signal?.throwIfAborted()
      throw new ApiError('network', 'Impossible de joindre Sureau. Vérifiez votre connexion puis réessayez.')
    }
    options.signal?.throwIfAborted()
    if (!response.ok) {
      const error = await responseError(response)
      options.signal?.throwIfAborted()
      if (options.notifyAuthFailure !== false && (response.status === 401 || response.status === 403)) {
        for (const listener of listeners) listener(error)
      }
      throw error
    }
    return response
  }

  async function requestJson<T>(path: string, decode: (payload: unknown) => T,
    options: ApiRequestOptions = {}): Promise<T> {
    const response = await request(path, options)
    let payload: unknown
    try { payload = await response.json() } catch {
      options.signal?.throwIfAborted()
      throw new ApiError('invalid-response', 'Sureau a renvoyé une réponse illisible. Réessayez dans un instant.')
    }
    options.signal?.throwIfAborted()
    try { return decode(payload) } catch {
      throw new ApiError('invalid-response', 'Les données reçues de Sureau sont incompatibles avec cette version.')
    }
  }

  async function requestVoid(path: string, options: ApiRequestOptions = {}): Promise<void> {
    const response = await request(path, options)
    if (response.status !== 204) throw new ApiError('invalid-response', 'Sureau n’a pas confirmé cette action. Vérifiez son résultat avant de réessayer.')
    options.signal?.throwIfAborted()
  }

  async function refreshCsrf(signal?: AbortSignal, fetcher?: typeof fetch): Promise<CsrfToken> {
    const generation = ++csrfGeneration
    csrf = null
    const token = await requestJson('/api/auth/csrf', (payload): CsrfToken => {
      if (!object(payload) || typeof payload.token !== 'string' || !payload.token
        || payload.headerName !== 'X-CSRF-TOKEN') throw new Error('Invalid CSRF response')
      return { token: payload.token, headerName: payload.headerName }
    }, { notifyAuthFailure: false, ...(signal ? { signal } : {}), ...(fetcher ? { fetcher } : {}) })
    signal?.throwIfAborted()
    if (generation === csrfGeneration) csrf = token
    return token
  }

  return {
    requestJson, requestVoid, refreshCsrf,
    clearCsrf: () => { csrfGeneration += 1; csrf = null },
    subscribeAuthFailure(listener: AuthFailureListener) {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const apiClient = createApiClient()
export const { requestJson, requestVoid } = apiClient
