import { defaultPlan } from './plan-document'
import { createEmptyPlan, createExamplePlan } from './plan-transfer'
import { parseSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { createWorkspaceFromPlan } from './workspace-document'

export type InitialWorkspaceKind = 'empty' | 'example'

export function createInitialSpatialDraft(kind: InitialWorkspaceKind): SpatialDraft {
  const plan = kind === 'empty'
    ? { ...createEmptyPlan(defaultPlan), id: 'room-01', name: 'Salle 01' }
    : createExamplePlan()
  const workspace = createWorkspaceFromPlan(plan)
  workspace.name = 'Notre espace'
  return parseSpatialDraft({ workspace, locations: {} })
}

/** A portable spatial draft, including unresolved links. Inventory and accounts remain in the database. */
export function serializeSpatialDraft(draft: SpatialDraft): string {
  const validated = parseSpatialDraft(draft)
  return `${JSON.stringify({ format: 'sureau-spatial', version: 1, ...validated }, null, 2)}\n`
}
