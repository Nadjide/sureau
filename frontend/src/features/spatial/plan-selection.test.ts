import { describe, expect, it } from 'vitest'
import { createFurniture } from './furniture-catalog'
import { defaultPlan, parsePlan } from './plan-document'
import { footprintBounds } from './plan-geometry'
import { createPlanHistory, pushPlanChange, redoPlan, undoPlan } from './plan-history'
import { resolveSelection, selectIds, translateSelection } from './plan-selection'
import type { SpatialPlan } from './room-model'

function fixture(): SpatialPlan {
  return {
    ...structuredClone(defaultPlan), width: 10, depth: 8,
    workstations: [
      { ...defaultPlan.workstations[0]!, id: 'desk-first', position: [-2, 0, -1], rotation: 0 },
      { ...defaultPlan.workstations[1]!, id: 'desk-second', position: [1, 0, 1], rotation: Math.PI / 2 },
    ],
    furniture: [
      { ...createFurniture('plant', 'furniture-plant'), position: [-3, 0, 2] },
      { ...createFurniture('table', 'furniture-table'), position: [2, 0, -2] },
    ],
  }
}

describe('sélection des objets du plan', () => {
  it('résout une sélection mixte sans doublons, en ignorant les identifiants absents', () => {
    const plan = fixture()
    expect(resolveSelection(plan, ['furniture-table', 'desk-second', 'desk-second', 'desk-missing']))
      .toEqual([plan.workstations[1], plan.furniture[1]])
    expect(resolveSelection(plan, [])).toEqual([])
  })

  it('remplace, ajoute et retire un membre sans modifier la liste source', () => {
    const ids = ['desk-first', 'furniture-table']
    expect(selectIds(ids, 'desk-second')).toEqual(['desk-second'])
    expect(selectIds(ids, 'desk-second', true)).toEqual([...ids, 'desk-second'])
    expect(selectIds(ids, 'furniture-table', true)).toEqual(['desk-first'])
    expect(selectIds(['desk-first'], 'desk-first', true)).toEqual([])
    expect(ids).toEqual(['desk-first', 'furniture-table'])
  })

  it('conserve les membres au début d’un glissement et nettoie les doublons', () => {
    const ids = ['desk-first', 'furniture-table', 'desk-first']
    expect(selectIds(ids, 'desk-first', false, true)).toEqual(['desk-first', 'furniture-table'])
    expect(selectIds(ids, 'desk-first', true, true)).toEqual(['desk-first', 'furniture-table'])
    expect(selectIds(ids, 'desk-second', false, true)).toEqual(['desk-second'])
  })
})

describe('translation commune de la sélection', () => {
  it('mesure aussi le fauteuil décentré lorsque le poste pivote', () => {
    const item = fixture().workstations[1]!
    const box = footprintBounds(item)
    expect(box.minX).toBeCloseTo(0.5)
    expect(box.maxX).toBeCloseTo(2.3)
    expect(box.minZ).toBeCloseTo(0)
    expect(box.maxZ).toBeCloseTo(2)
  })

  it('déplace postes et meubles ensemble, sans toucher aux autres objets ni au plan source', () => {
    const plan = fixture(), source = structuredClone(plan)
    const result = translateSelection(plan, ['desk-second', 'furniture-table'], 'desk-second', 2, 0.5, false)
    expect(result.workstations[1]!.position).toEqual([2, 0, 0.5])
    expect(result.furniture[1]!.position).toEqual([3, 0, -2.5])
    expect(result.workstations[0]).toBe(plan.workstations[0])
    expect(result.furniture[0]).toBe(plan.furniture[0])
    expect(result.workstations[1]!.rotation).toBe(plan.workstations[1]!.rotation)
    expect(plan).toEqual(source)
    expect(parsePlan(JSON.stringify(result))).toEqual(result)
  })

  it('borne le même delta sur les deux axes sans écraser les écarts près des murs', () => {
    const plan = fixture()
    const result = translateSelection(plan, ['desk-second', 'furniture-table'], 'desk-second', 100, -100, false)
    expect(result.workstations[1]!.position[0]).toBeCloseTo(2.8)
    expect(result.furniture[1]!.position[0]).toBeCloseTo(3.8)
    expect(result.workstations[1]!.position[2]).toBeCloseTo(-0.4)
    expect(result.furniture[1]!.position[2]).toBeCloseTo(-3.4)
    const [desk, table] = resolveSelection(result, ['desk-second', 'furniture-table'])
    expect(table!.position[0] - desk!.position[0]).toBeCloseTo(1)
    expect(table!.position[2] - desk!.position[2]).toBeCloseTo(-3)
    for (const item of [desk!, table!]) {
      const bounds = footprintBounds(item)
      expect(bounds.minX).toBeGreaterThanOrEqual(-5 - 1e-7)
      expect(bounds.maxX).toBeLessThanOrEqual(5 + 1e-7)
      expect(bounds.minZ).toBeGreaterThanOrEqual(-4 - 1e-7)
      expect(bounds.maxZ).toBeLessThanOrEqual(4 + 1e-7)
    }
    expect(parsePlan(JSON.stringify(result))).toEqual(result)
  })

  it('aimante uniquement l’ancre et conserve les décalages libres des autres membres', () => {
    const plan = fixture()
    plan.workstations[0]!.position = [-2.13, 0, -1.07]
    plan.furniture[0]!.position = [-3.18, 0, 2.09]
    const result = translateSelection(plan, ['desk-first', 'furniture-plant'], 'desk-first', -1.62, -0.61, true)
    expect(result.workstations[0]!.position[0]).toBeCloseTo(-1.5)
    expect(result.workstations[0]!.position[2]).toBeCloseTo(-0.5)
    expect(result.furniture[0]!.position[0]).toBeCloseTo(-2.55)
    expect(result.furniture[0]!.position[2]).toBeCloseTo(2.66)
    const free = translateSelection(plan, ['desk-first', 'furniture-plant'], 'desk-first', -1.62, -0.61, false)
    expect(free.workstations[0]!.position[0]).toBeCloseTo(-1.62)
    expect(free.furniture[0]!.position[0]).toBeCloseTo(-2.67)
  })

  it('garde la référence du plan pour une sélection vide, une ancre absente ou un déplacement nul', () => {
    const plan = fixture()
    expect(translateSelection(plan, [], 'desk-first', 0, 0, true)).toBe(plan)
    expect(translateSelection(plan, ['desk-first'], 'desk-second', 0, 0, true)).toBe(plan)
    expect(translateSelection(plan, ['desk-first', 'desk-missing'], 'desk-first', -2, -1, true)).toBe(plan)
  })

  it('refuse les coordonnées non finies et une sélection plus grande que la salle', () => {
    const plan = fixture(), source = structuredClone(plan)
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() => translateSelection(plan, ['desk-first'], 'desk-first', value, 0, true)).toThrow()
      expect(() => translateSelection(plan, ['desk-first'], 'desk-first', 0, value, false)).toThrow()
    }
    expect(() => translateSelection({ ...plan, width: 1 }, ['desk-first'], 'desk-first', 0, 0, false)).toThrow()
    expect(() => translateSelection({ ...plan, depth: 0 }, ['desk-first'], 'desk-first', 0, 0, false)).toThrow()
    expect(plan).toEqual(source)
  })

  it('borne les cibles finies extrêmes sans produire de coordonnées infinies', () => {
    const plan = fixture()
    const result = translateSelection(plan, ['desk-second', 'furniture-table'], 'desk-second', Number.MAX_VALUE, -Number.MAX_VALUE, true)
    expect(parsePlan(JSON.stringify(result))).toEqual(result)
    expect(result.workstations[1]!.position[0]).toBeCloseTo(2.8)
  })

  it('annule et rétablit le déplacement de plusieurs objets en une seule étape', () => {
    const initial = createPlanHistory(fixture())
    const candidate = translateSelection(initial.present, ['desk-second', 'furniture-table'], 'desk-second', 2, 0.5, false)
    const changed = pushPlanChange(initial, candidate)
    expect(changed.past).toHaveLength(1)
    const undone = undoPlan(changed)
    expect(undone.present).toEqual(initial.present)
    expect(redoPlan(undone).present).toEqual(changed.present)
    expect(pushPlanChange(undone, translateSelection(undone.present, ['desk-first'], 'desk-first', -2, -1, true))).toBe(undone)
  })
})
