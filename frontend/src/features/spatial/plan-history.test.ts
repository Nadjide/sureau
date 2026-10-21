import { describe, expect, it } from 'vitest'
import { defaultPlan, type SpatialPlan } from './plan-document'
import { createPlanHistory, planHistoryLimit, pushPlanChange, redoPlan, undoPlan } from './plan-history'

function plan(): SpatialPlan {
  return structuredClone(defaultPlan)
}

describe('historique du plateau', () => {
  it('démarre sans actions et isole la capture des mutations du document source', () => {
    const source = plan()
    const history = createPlanHistory(source)
    source.name = 'Modifié ailleurs'
    source.workstations[0]!.position[0] = 1
    source.colors.floor = '#112233'
    source.display.walls = false
    expect(history).toEqual({ past: [], present: defaultPlan, future: [] })
    expect(undoPlan(history)).toBe(history)
    expect(redoPlan(history)).toBe(history)
  })

  it('annule et rétablit un déplacement complet sans muter les états précédents', () => {
    const initial = createPlanHistory(plan())
    const moved = plan()
    moved.workstations[0]!.position = [1.25, 0, 2]
    moved.workstations[0]!.rotation = Math.PI / 2
    const history = pushPlanChange(initial, moved)
    moved.workstations[0]!.position[0] = 99
    expect(history.past).toHaveLength(1)
    expect(history.present.workstations[0]!.position).toEqual([1.25, 0, 2])
    expect(initial.present).toEqual(defaultPlan)
    const undone = undoPlan(history)
    expect(undone.present).toEqual(defaultPlan)
    expect(undone.future).toHaveLength(1)
    expect(redoPlan(undone).present).toEqual(history.present)
  })

  it('retrouve les mêmes identifiants après ajout puis suppression et annulations', () => {
    const initial = createPlanHistory(plan())
    const added = plan()
    added.workstations.push({ ...added.workstations[0]!, id: 'desk-new-test', label: 'Nouveau', position: [0, 0, 0] })
    const created = pushPlanChange(initial, added)
    const removed = pushPlanChange(created, { ...created.present, workstations: created.present.workstations.filter((station) => station.id !== 'desk-01') })
    expect(removed.present.workstations.some((station) => station.id === 'desk-01')).toBe(false)
    const restored = undoPlan(removed)
    expect(restored.present.workstations.find((station) => station.id === 'desk-01')).toEqual(defaultPlan.workstations[0])
    expect(restored.present.workstations.some((station) => station.id === 'desk-new-test')).toBe(true)
    expect(undoPlan(restored).present).toEqual(initial.present)
    expect(redoPlan(redoPlan(undoPlan(restored)))).toEqual(removed)
  })

  it('annule ensemble les couleurs, dimensions et préférences appliquées par une action', () => {
    const initial = createPlanHistory(plan())
    const changed = plan()
    changed.colors = { floor: '#123456', wall: '#abcdef', desk: '#998877', accent: '#551122' }
    changed.display = { walls: false, decor: false }
    changed.width = 20
    changed.workstations[0]!.color = '#112233'
    const history = pushPlanChange(initial, changed)
    expect(history.past).toHaveLength(1)
    expect(undoPlan(history).present).toEqual(defaultPlan)
    expect(redoPlan(undoPlan(history)).present).toEqual(changed)
  })

  it('garde le rétablissement lorsqu’une modification est identique après validation', () => {
    const initial = createPlanHistory(plan())
    const changed = pushPlanChange(initial, { ...plan(), name: 'Support' })
    const undone = undoPlan(changed)
    const equivalent = { ...plan(), name: '  Plateau A  ' }
    expect(pushPlanChange(undone, equivalent)).toBe(undone)
    expect(redoPlan(undone).present.name).toBe('Support')
  })

  it('efface seulement la branche de rétablissement après une nouvelle modification', () => {
    const first = pushPlanChange(createPlanHistory(plan()), { ...plan(), name: 'Version B' })
    const second = pushPlanChange(first, { ...first.present, name: 'Version C' })
    const undone = undoPlan(second)
    const branched = pushPlanChange(undone, { ...undone.present, name: 'Version D' })
    expect(branched.future).toEqual([])
    expect(branched.past.map((item) => item.name)).toEqual(['Plateau A', 'Version B'])
    expect(redoPlan(branched)).toBe(branched)
    expect(second.present.name).toBe('Version C')
  })

  it('refuse une modification invalide sans perdre l’état ni la branche de rétablissement', () => {
    const changed = pushPlanChange(createPlanHistory(plan()), { ...plan(), name: 'Version B' })
    const history = undoPlan(changed)
    const original = structuredClone(history)
    const invalid = { ...history.present, width: Number.NaN }
    expect(() => pushPlanChange(history, invalid)).toThrow()
    expect(history).toEqual(original)
    expect(redoPlan(history).present.name).toBe('Version B')
    expect(() => createPlanHistory(invalid)).toThrow()
  })

  it('limite l’historique à cinquante étapes et permet de les parcourir dans les deux sens', () => {
    let history = createPlanHistory(plan())
    for (let index = 1; index <= 60; index++) {
      history = pushPlanChange(history, { ...history.present, name: `Version ${index}` })
    }
    expect(history.past).toHaveLength(planHistoryLimit)
    expect(history.present.name).toBe('Version 60')
    for (let index = 0; index < planHistoryLimit; index++) history = undoPlan(history)
    expect(history.present.name).toBe('Version 10')
    expect(history.future).toHaveLength(planHistoryLimit)
    expect(undoPlan(history)).toBe(history)
    for (let index = 0; index < planHistoryLimit; index++) history = redoPlan(history)
    expect(history.present.name).toBe('Version 60')
    expect(history.past).toHaveLength(planHistoryLimit)
    expect(redoPlan(history)).toBe(history)
  })
})
