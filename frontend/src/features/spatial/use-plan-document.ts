import { useCallback, useRef, useState } from 'react'
import { loadPlan, savePlan, type PlanPersistence, type PlanStorage, type SpatialPlan } from './plan-document'
import { createPlanHistory, pushPlanChange, redoPlan, undoPlan, type PlanHistory } from './plan-history'
import { t } from '@/lib/i18n'

interface PlanState extends PlanPersistence {
  history: PlanHistory
  storage: PlanStorage | null
  persistenceWarning: string | null
}

export interface PlanDocumentResult {
  plan: SpatialPlan
  warning: string | null
  persisted: boolean
  replace: (next: SpatialPlan) => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

function initialPlan(): PlanState {
  let storage: PlanStorage | null = null
  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch {
    // Browser privacy settings may deny access to the property itself.
  }
  const { plan, ...persistence } = loadPlan(storage)
  return { ...persistence, history: createPlanHistory(plan), storage, persistenceWarning: persistence.warning }
}

function persistHistory(previous: PlanState, history: PlanHistory): PlanState {
  const persistence: PlanPersistence = previous.canPersist
    ? savePlan(previous.storage, history.present)
    : { warning: previous.persistenceWarning, persisted: false, canPersist: false }
  return { ...previous, history, ...persistence, persistenceWarning: persistence.warning }
}

export function usePlanDocument(): PlanDocumentResult {
  const [state, setState] = useState<PlanState>(initialPlan)
  const current = useRef(state)

  const replace = useCallback((candidate: SpatialPlan) => {
    const previous = current.current
    let history: PlanHistory
    try {
      history = pushPlanChange(previous.history, candidate)
    } catch {
      const next = { ...previous, warning: t('Ce plan est invalide. Aucun changement n’a été appliqué.') }
      current.current = next
      setState(next)
      return
    }
    if (history === previous.history) {
      if (previous.warning !== previous.persistenceWarning) {
        const next = { ...previous, warning: previous.persistenceWarning }
        current.current = next
        setState(next)
      }
      return
    }

    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
  }, [])

  const undo = useCallback(() => {
    const previous = current.current
    const history = undoPlan(previous.history)
    if (history === previous.history) return
    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
  }, [])

  const redo = useCallback(() => {
    const previous = current.current
    const history = redoPlan(previous.history)
    if (history === previous.history) return
    const next = persistHistory(previous, history)
    current.current = next
    setState(next)
  }, [])

  return {
    plan: state.history.present,
    warning: state.warning,
    persisted: state.persisted,
    replace,
    undo,
    redo,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
  }
}
