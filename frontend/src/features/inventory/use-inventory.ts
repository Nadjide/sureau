import { useCallback, useEffect, useRef, useState } from 'react'
import { AssetApiError, getAssets } from './asset-api'
import type { Asset } from './asset-schema'
import { t } from '@/lib/i18n'

interface InventoryState {
  assets: Asset[] | null
  status: 'loading' | 'ready' | 'error'
  error: AssetApiError | null
}

export interface InventoryResult extends InventoryState {
  reload: () => void
  refreshAfterMutation: (asset: Asset) => void
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
  const refreshAfterMutation = useCallback((asset: Asset) => {
    activeController.current?.abort()
    // This is a validated server response, never an optimistic or fabricated record.
    setState((previous) => ({ assets: [...(previous.assets || []).filter((existing) => existing.id !== asset.id), asset].sort((a, b) => a.id - b.id), status: 'loading', error: null }))
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
            : new AssetApiError('network', t('L’inventaire est indisponible. Réessayez dans un instant.'))

        setState((previous) => ({ ...previous, status: 'error', error: apiError }))
      })

    return () => {
      active = false
      controller.abort()
      if (activeController.current === controller) activeController.current = null
    }
  }, [requestVersion])

  return { ...state, reload, refreshAfterMutation }
}
