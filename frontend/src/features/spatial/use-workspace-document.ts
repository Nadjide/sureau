import { useCallback, useRef, useState } from 'react'
import type { SpatialPlan } from './plan-document'
import {
  createWorkspaceHistory, loadWorkspace, pushWorkspaceChange, redoWorkspace, replaceWorkspaceRoom,
  saveWorkspace, undoWorkspace, type WorkspaceDocument, type WorkspaceHistory, type WorkspacePersistence, type WorkspaceStorage,
} from './workspace-document'
import { t } from '@/lib/i18n'

interface WorkspaceState extends WorkspacePersistence {
  history: WorkspaceHistory
  storage: WorkspaceStorage | null
  persistenceWarning: string | null
}

export interface WorkspaceDocumentResult {
  workspace: WorkspaceDocument
  replace: (next: WorkspaceDocument) => boolean
  replaceRoom: (roomId: string, next: SpatialPlan) => boolean
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  persisted: boolean
  warning: string | null
}

function initialWorkspace(): WorkspaceState {
  let storage: WorkspaceStorage | null = null
  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch {
    // Browser privacy settings may deny access to the storage property itself.
  }
  const { workspace, ...persistence } = loadWorkspace(storage)
  return { ...persistence, storage, history: createWorkspaceHistory(workspace), persistenceWarning: persistence.warning }
}

function persistHistory(previous: WorkspaceState, history: WorkspaceHistory): WorkspaceState {
  const persistence: WorkspacePersistence = previous.canPersist
    ? saveWorkspace(previous.storage, history.present)
    : { warning: previous.persistenceWarning, persisted: false, canPersist: false }
  return { ...previous, history, ...persistence, persistenceWarning: persistence.warning }
}

export function useWorkspaceDocument(): WorkspaceDocumentResult {
  const [state, setState] = useState<WorkspaceState>(initialWorkspace)
  const current = useRef(state)

  const commit = useCallback((candidate: () => WorkspaceDocument): boolean => {
    const previous = current.current
    let history: WorkspaceHistory
    try {
      history = pushWorkspaceChange(previous.history, candidate())
    } catch {
      const next = { ...previous, warning: t('Cet espace de travail est invalide. Aucun changement n’a été appliqué.') }
      current.current = next
      setState(next)
      return false
    }
    if (history === previous.history) {
      if (previous.warning !== previous.persistenceWarning) {
        const next = { ...previous, warning: previous.persistenceWarning }
        current.current = next
        setState(next)
      }
      return true
    }
    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
    return true
  }, [])

  const replace = useCallback((candidate: WorkspaceDocument) => commit(() => candidate), [commit])
  const replaceRoom = useCallback((roomId: string, plan: SpatialPlan) =>
    commit(() => replaceWorkspaceRoom(current.current.history.present, roomId, plan)), [commit])

  const undo = useCallback(() => {
    const previous = current.current
    const history = undoWorkspace(previous.history)
    if (history === previous.history) return
    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
  }, [])

  const redo = useCallback(() => {
    const previous = current.current
    const history = redoWorkspace(previous.history)
    if (history === previous.history) return
    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
  }, [])

  return {
    workspace: state.history.present, replace, replaceRoom, undo, redo,
    canUndo: state.history.past.length > 0, canRedo: state.history.future.length > 0,
    persisted: state.persisted, warning: state.warning,
  }
}
