import { useCallback, useState } from 'react'
import { storageKeys } from '@/lib/browser-storage'

/** The first-visit invitation stays until the person opens the guide or dismisses it, in this browser. */
export function useGuideIntroduction() {
  const [visible, setVisible] = useState(() => {
    try {
      return window.localStorage.getItem(storageKeys.guide) === null
    } catch {
      return true
    }
  })
  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      window.localStorage.setItem(storageKeys.guide, 'seen')
    } catch {
      // Without browser storage, the invitation simply comes back on the next visit.
    }
  }, [])
  return { visible, dismiss }
}
