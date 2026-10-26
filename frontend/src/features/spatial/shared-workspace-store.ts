import { ApiError } from '@/lib/api-client'
import { msg, t } from '@/lib/i18n'
import { updateLocation } from './local-locations'
import type { SpatialPlan } from './plan-document'
import {
  createSpatialHistory, parseSpatialDraft, pushSpatialChange, redoSpatial, sameSpatialDraft, undoSpatial,
  type SpatialDraft, type SpatialHistory,
} from './shared-workspace-model'
import type { WorkspaceSnapshot } from './workspace-api'
import { replaceWorkspaceRoom, type WorkspaceDocument } from './workspace-document'

export interface SharedWorkspaceState {
  readonly phase: 'loading' | 'missing' | 'ready' | 'error'
  readonly history: SpatialHistory | null
  readonly draft: SpatialDraft | null
  readonly base: SpatialDraft | null
  readonly revision: number | null
  readonly updatedAt: string | null
  readonly dirty: boolean
  readonly saving: boolean
  readonly loading: boolean
  readonly blocked: 'conflict' | 'uncertain' | null
  readonly error: string | null
  readonly warning: string | null
  readonly canUndo: boolean
  readonly canRedo: boolean
}

export interface SharedWorkspaceDependencies {
  getWorkspace(signal?: AbortSignal): Promise<WorkspaceSnapshot | null>
  saveWorkspace(expectedRevision: number, draft: SpatialDraft, signal?: AbortSignal): Promise<WorkspaceSnapshot>
  canEdit(): boolean
}

type StoredState = Omit<SharedWorkspaceState, 'draft' | 'dirty' | 'canUndo' | 'canRedo'>
type Operation = { kind: 'load' | 'save'; controller: AbortController; cycle: number }

const uncertainMessage = msg('L’enregistrement de l’espace n’a pas pu être confirmé. Votre brouillon est conservé. Rechargez la version du serveur pour vérifier son état avant de réessayer.')
const conflictMessage = msg('L’espace a été modifié sur le serveur. Votre brouillon est conservé. Exportez votre travail ou rechargez la version du serveur avant de poursuivre.')
const missingMessage = msg('Le serveur ne contient plus l’espace précédemment chargé. Votre brouillon et ses localisations sont conservés. Exportez votre travail et vérifiez cette instance avant de recharger.')

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

/** A session-scoped draft. Only explicit saves reach the server; browser storage is never read. */
export function createSharedWorkspaceStore(dependencies: SharedWorkspaceDependencies) {
  const listeners = new Set<() => void>()
  let active = false
  let cycle = 0
  let operation: Operation | null = null
  let state: SharedWorkspaceState = {
    phase: 'loading', history: null, draft: null, base: null, revision: null, updatedAt: null,
    dirty: false, saving: false, loading: true, blocked: null, error: null, warning: null,
    canUndo: false, canRedo: false,
  }

  function publish(next: StoredState): void {
    state = {
      ...next,
      draft: next.history?.present ?? null,
      dirty: next.history !== null && (next.base === null || !sameSpatialDraft(next.history.present, next.base)),
      canUndo: (next.history?.past.length ?? 0) > 0,
      canRedo: (next.history?.future.length ?? 0) > 0,
    }
    for (const listener of listeners) listener()
  }

  function current(request: Operation): boolean {
    return active && operation === request && request.cycle === cycle && !request.controller.signal.aborted
  }

  function canChange(): boolean {
    return active && dependencies.canEdit() && state.phase === 'ready' && state.history !== null && !state.loading
  }

  function warn(error: unknown): false {
    publish({ ...state, warning: message(error, t('Cette modification est invalide. Aucun changement n’a été appliqué.')) })
    return false
  }

  function change(candidate: () => SpatialDraft): boolean {
    if (!canChange() || !state.history) return false
    try {
      const history = pushSpatialChange(state.history, candidate())
      if (history !== state.history || state.warning !== null) {
        publish({ ...state, history, warning: null, error: state.blocked ? state.error : null })
      }
      return true
    } catch (error) { return warn(error) }
  }

  async function load(): Promise<boolean> {
    if (!active || operation) return false
    const request: Operation = { kind: 'load', controller: new AbortController(), cycle }
    operation = request
    publish({ ...state, phase: state.history ? 'ready' : 'loading', loading: true, error: null, warning: null })
    try {
      const snapshot = await dependencies.getWorkspace(request.controller.signal)
      if (!current(request)) return false
      if (snapshot === null) {
        if (state.base !== null || (state.revision !== null && state.revision > 0)) {
          publish({ ...state, phase: 'ready', loading: false, blocked: 'uncertain', error: t(missingMessage) })
          return false
        }
        publish({
          phase: 'missing', history: null, base: null, revision: 0, updatedAt: null,
          saving: false, loading: false, blocked: null, error: null, warning: null,
        })
        return true
      }
      const history = createSpatialHistory({ workspace: snapshot.workspace, locations: snapshot.locations })
      if (!Number.isSafeInteger(snapshot.revision) || snapshot.revision <= 0
        || typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))) {
        throw new ApiError('invalid-response', t('La réponse du serveur ne contient pas une version valide de l’espace.'))
      }
      publish({
        phase: 'ready', history, base: history.present, revision: snapshot.revision, updatedAt: snapshot.updatedAt,
        saving: false, loading: false, blocked: null, error: null, warning: null,
      })
      return true
    } catch (error) {
      if (!current(request)) return false
      publish({ ...state, phase: state.history ? 'ready' : 'error', loading: false,
        error: message(error, t('L’espace n’a pas pu être chargé. Réessayez après avoir vérifié votre connexion.')) })
      return false
    } finally {
      if (operation === request) operation = null
    }
  }

  async function start(): Promise<boolean> {
    if (active) return false
    active = true
    cycle++
    if (state.phase === 'ready' || state.phase === 'missing') return true
    return load()
  }

  function dispose(): void {
    if (!active) return
    active = false
    cycle++
    const pending = operation
    operation = null
    pending?.controller.abort()
    if (pending?.kind === 'save') {
      publish({ ...state, saving: false, blocked: 'uncertain', error: t(uncertainMessage) })
    } else if (pending?.kind === 'load') {
      publish({ ...state, loading: false })
    }
  }

  function initialize(draft: SpatialDraft): boolean {
    if (!active || !dependencies.canEdit() || state.phase !== 'missing' || state.revision !== 0 || operation) return false
    try {
      const history = createSpatialHistory(draft)
      publish({ ...state, phase: 'ready', history, base: null, blocked: null, error: null, warning: null })
      return true
    } catch (error) { return warn(error) }
  }

  function replaceDraft(draft: SpatialDraft): boolean { return change(() => draft) }

  function replace(workspace: WorkspaceDocument): boolean {
    return change(() => ({ workspace, locations: state.history!.present.locations }))
  }

  function replaceRoom(roomId: string, plan: SpatialPlan): boolean {
    return change(() => ({
      ...state.history!.present,
      workspace: replaceWorkspaceRoom(state.history!.present.workspace, roomId, plan),
    }))
  }

  function associate(assetId: number, workstationId: string | null): boolean {
    return change(() => {
      const present = state.history!.present
      if (workstationId !== null && !present.workspace.rooms.some((room) => room.plan.workstations.some((station) => station.id === workstationId))) {
        throw new RangeError(t('Ce poste n’existe pas dans l’espace. Aucun lien n’a été modifié.'))
      }
      return { ...present, locations: updateLocation(present.locations, assetId, workstationId) }
    })
  }

  function travel(direction: 'undo' | 'redo'): boolean {
    if (!canChange() || !state.history) return false
    const history = direction === 'undo' ? undoSpatial(state.history) : redoSpatial(state.history)
    if (history === state.history) return false
    publish({ ...state, history, warning: null, error: state.blocked ? state.error : null })
    return true
  }

  async function save(): Promise<boolean> {
    if (!canChange() || operation || state.blocked || !state.dirty || state.revision === null || !state.draft) return false
    let sent: SpatialDraft
    try { sent = parseSpatialDraft(state.draft) } catch (error) { return warn(error) }
    const expectedRevision = state.revision
    const request: Operation = { kind: 'save', controller: new AbortController(), cycle }
    operation = request
    publish({ ...state, saving: true, error: null, warning: null })
    try {
      const snapshot = await dependencies.saveWorkspace(expectedRevision, sent, request.controller.signal)
      if (!current(request)) return false
      const confirmed = parseSpatialDraft({ workspace: snapshot.workspace, locations: snapshot.locations })
      if (snapshot.revision !== expectedRevision + 1 || !Number.isSafeInteger(snapshot.revision)
        || typeof snapshot.updatedAt !== 'string' || !Number.isFinite(Date.parse(snapshot.updatedAt))
        || !sameSpatialDraft(sent, confirmed)) {
        throw new ApiError('invalid-response', t(uncertainMessage))
      }
      // The history may contain newer edits or an undo made while the request was in flight.
      publish({ ...state, base: confirmed, revision: snapshot.revision, updatedAt: snapshot.updatedAt,
        saving: false, blocked: null, error: null, warning: null })
      return true
    } catch (error) {
      if (!current(request)) return false
      const conflict = error instanceof ApiError && error.kind === 'http' && error.status === 409
      const uncertain = error instanceof ApiError
        ? error.kind !== 'http' || (error.status !== null && error.status >= 500)
        : !(error instanceof RangeError)
      publish({ ...state, saving: false, blocked: conflict ? 'conflict' : uncertain ? 'uncertain' : null,
        error: conflict ? t(conflictMessage) : uncertain ? t(uncertainMessage) : message(error, t('L’espace n’a pas pu être enregistré.')) })
      return false
    } finally {
      if (operation === request) operation = null
    }
  }

  async function reload(discardDraft = false): Promise<boolean> {
    if (!active || operation) return false
    if ((state.dirty || state.blocked) && !discardDraft) {
      return warn(new Error(t('Confirmez le remplacement de votre brouillon avant de recharger la version du serveur.')))
    }
    return load()
  }

  return {
    getState: () => state,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    start, dispose, initialize, replace, replaceDraft, replaceRoom, associate,
    undo: () => travel('undo'), redo: () => travel('redo'), save, reload,
  }
}

export type SharedWorkspaceStore = ReturnType<typeof createSharedWorkspaceStore>
