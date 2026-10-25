import { describe, expect, it } from 'vitest'
import { defaultPlan } from './plan-document'
import { createInitialSpatialDraft, serializeSpatialDraft } from './shared-workspace-transfer'

describe('préparation explicite d’un espace partagé', () => {
  it('prépare une salle vide valide avec un étage et aucune association', () => {
    const draft = createInitialSpatialDraft('empty')
    expect(draft.workspace.floors).toHaveLength(1)
    expect(draft.workspace.rooms).toHaveLength(1)
    expect(draft.workspace.rooms[0]!.floorId).toBe(draft.workspace.floors[0]!.id)
    expect(draft.workspace.rooms[0]!.plan.workstations).toEqual([])
    expect(draft.workspace.rooms[0]!.plan.furniture).toEqual([])
    expect(draft.locations).toEqual({})
  })

  it('prépare l’exemple illustratif sans matériel ni lien inventé et détache les créations suivantes', () => {
    const first = createInitialSpatialDraft('example')
    expect(first.workspace.rooms[0]!.plan).toEqual(defaultPlan)
    expect(first.locations).toEqual({})
    first.workspace.rooms[0]!.plan.workstations[0]!.label = 'Poste modifié'
    first.workspace.rooms[0]!.plan.colors.floor = '#000000'
    expect(createInitialSpatialDraft('example').workspace.rooms[0]!.plan).toEqual(defaultPlan)
    expect(createInitialSpatialDraft('empty').workspace.rooms[0]!.plan.colors).toEqual(defaultPlan.colors)
  })
})

describe('export de secours de l’espace spatial', () => {
  it('inclut les salles et les associations stables et orphelines dans une enveloppe versionnée', () => {
    const draft = { ...createInitialSpatialDraft('example'), locations: { 42: 'desk-01', 950: 'desk-supprime' } }
    const raw = serializeSpatialDraft(draft)
    expect(JSON.parse(raw)).toEqual({ format: 'sureau-spatial', version: 1, ...draft })
    expect(Object.keys(JSON.parse(raw) as object)).toEqual(['format', 'version', 'workspace', 'locations'])
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('refuse un brouillon invalide au lieu de produire une copie de secours trompeuse', () => {
    const draft = createInitialSpatialDraft('empty')
    draft.workspace.rooms = []
    expect(() => serializeSpatialDraft(draft)).toThrow()
  })
})
