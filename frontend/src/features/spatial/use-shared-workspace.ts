import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { useSession } from '@/features/auth/use-session'
import { createSharedWorkspaceStore } from './shared-workspace-store'
import { getWorkspace, saveWorkspace } from './workspace-api'

/** AuthGate scopes this hook to one identity and keeps it mounted during session recovery. */
export function useSharedWorkspace() {
  const { canEdit } = useSession()
  const [{ store, setPermission }] = useState(() => {
    let currentPermission = canEdit
    return {
      store: createSharedWorkspaceStore({ getWorkspace, saveWorkspace, canEdit: () => currentPermission }),
      setPermission(value: boolean) {
        currentPermission = value
      },
    }
  })
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState)

  useLayoutEffect(() => {
    setPermission(canEdit)
  }, [canEdit, setPermission])

  useEffect(() => {
    void store.start()
    return store.dispose
  }, [store])

  return {
    ...state,
    initialize: store.initialize,
    replace: store.replace,
    replaceDraft: store.replaceDraft,
    replaceRoom: store.replaceRoom,
    associate: store.associate,
    undo: store.undo,
    redo: store.redo,
    save: store.save,
    reload: store.reload,
  }
}

export type SharedWorkspaceResult = ReturnType<typeof useSharedWorkspace>
