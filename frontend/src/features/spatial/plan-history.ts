import { parsePlan, type SpatialPlan } from './plan-document'

export interface PlanHistory {
  readonly past: readonly SpatialPlan[]
  readonly present: SpatialPlan
  readonly future: readonly SpatialPlan[]
}

export const planHistoryLimit = 50

function snapshot(plan: SpatialPlan): SpatialPlan {
  return parsePlan(JSON.stringify(plan))
}

export function createPlanHistory(initial: SpatialPlan): PlanHistory {
  return { past: [], present: snapshot(initial), future: [] }
}

export function pushPlanChange(history: PlanHistory, candidate: SpatialPlan): PlanHistory {
  const present = snapshot(candidate)
  if (JSON.stringify(present) === JSON.stringify(history.present)) return history
  return {
    past: [...history.past, history.present].slice(-planHistoryLimit),
    present,
    future: [],
  }
}

export function undoPlan(history: PlanHistory): PlanHistory {
  const present = history.past.at(-1)
  if (!present) return history
  return {
    past: history.past.slice(0, -1),
    present,
    future: [history.present, ...history.future].slice(0, planHistoryLimit),
  }
}

export function redoPlan(history: PlanHistory): PlanHistory {
  const present = history.future[0]
  if (!present) return history
  return {
    past: [...history.past, history.present].slice(-planHistoryLimit),
    present,
    future: history.future.slice(1),
  }
}
