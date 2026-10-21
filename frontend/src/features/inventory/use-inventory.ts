import { useCallback, useEffect, useRef, useState } from 'react'
import { AssetApiError, getAssets } from './asset-api'
import type { Asset } from './asset-schema'

interface InventoryState {
  assets: Asset[] | null
  status: 'loading' | 'ready' | 'error'
  error: AssetApiError | null
}

export interface InventoryResult extends InventoryState {
  reload: () => void
}

export function useInventory(): InventoryResult {
  const [state, setState] = useState<InventoryState>({
    assets: null,
    status: 'loading',
    error: null,
  })
  const [requestVersion, setRequestVersion] = useState(0)
  const activeController = useRef<AbortController | null>(null)
  const reload = useCallback(() => {
    activeController.current?.abort()
    setState((previous) => ({ ...previous, status: 'loading', error: null }))
    setRequestVersion((version) => version + 1)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    activeController.current = controller
    let active = true

    void getAssets(controller.signal)
      .then((assets) => {
        if (active && !controller.signal.aborted) {
          setState({ assets, status: 'ready', error: null })
        }
      })
      .catch((error: unknown) => {
        if (!active || controller.signal.aborted) return

        const apiError =
          error instanceof AssetApiError
            ? error
            : new AssetApiError('network', 'L’inventaire est indisponible. Réessayez dans un instant.')

        setState((previous) => ({ ...previous, status: 'error', error: apiError }))
      })

    return () => {
      active = false
      controller.abort()
      if (activeController.current === controller) activeController.current = null
    }
  }, [requestVersion])

  return { ...state, reload }
}
