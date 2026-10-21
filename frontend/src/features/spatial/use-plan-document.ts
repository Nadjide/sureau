import { useCallback, useRef, useState } from 'react'
import { loadPlan, parsePlan, savePlan, type LoadedPlan, type PlanStorage, type SpatialPlan } from './plan-document'

interface PlanState extends LoadedPlan {
  storage: PlanStorage | null
}

export interface PlanDocumentResult {
  plan: SpatialPlan
  warning: string | null
  persisted: boolean
  replace: (next: SpatialPlan) => void
}

function initialPlan(): PlanState {
  let storage: PlanStorage | null = null
  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch {
    // Browser privacy settings may deny access to the property itself.
  }
  return { ...loadPlan(storage), storage }
}

export function usePlanDocument(): PlanDocumentResult {
  const [state, setState] = useState<PlanState>(initialPlan)
  const current = useRef(state)

  const replace = useCallback((candidate: SpatialPlan) => {
    const previous = current.current
    let plan: SpatialPlan
    try {
      plan = parsePlan(JSON.stringify(candidate))
    } catch {
      const next = { ...previous, warning: 'Ce plan est invalide. Aucun changement n’a été appliqué.' }
      current.current = next
      setState(next)
      return
    }
    if (JSON.stringify(plan) === JSON.stringify(previous.plan) && previous.persisted && previous.warning === null) return

    const next: PlanState = previous.canPersist
      ? { ...previous, plan, ...savePlan(previous.storage, plan) }
      : { ...previous, plan, persisted: false }
    current.current = next
    setState(next)
  }, [])

  return { plan: state.plan, warning: state.warning, persisted: state.persisted, replace }
}
