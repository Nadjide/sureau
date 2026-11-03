import { describe, expect, it } from 'vitest'
import { createFurniture } from './furniture-catalog'
import { defaultPlan, parsePlan } from './plan-document'
import { footprintBounds, mixedOverlaps } from './plan-geometry'
import { createPlanHistory, pushPlanChange, redoPlan, undoPlan } from './plan-history'
import {
  duplicateSelection,
  removeSelection,
  resolveSelection,
  rotateSelection,
  selectIds,
  translateSelection,
} from './plan-selection'
import type { SpatialPlan } from './room-model'

function fixture(): SpatialPlan {
  return {
    ...structuredClone(defaultPlan),
    width: 10,
    depth: 8,
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
    expect(resolveSelection(plan, ['furniture-table', 'desk-second', 'desk-second', 'desk-missing'])).toEqual([
      plan.workstations[1],
      plan.furniture[1],
    ])
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
    const plan = fixture(),
      source = structuredClone(plan)
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
    const plan = fixture(),
      source = structuredClone(plan)
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
    const result = translateSelection(
      plan,
      ['desk-second', 'furniture-table'],
      'desk-second',
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      true,
    )
    expect(parsePlan(JSON.stringify(result))).toEqual(result)
    expect(result.workstations[1]!.position[0]).toBeCloseTo(2.8)
  })

  it('annule et rétablit le déplacement de plusieurs objets en une seule étape', () => {
    const initial = createPlanHistory(fixture())
    const candidate = translateSelection(
      initial.present,
      ['desk-second', 'furniture-table'],
      'desk-second',
      2,
      0.5,
      false,
    )
    const changed = pushPlanChange(initial, candidate)
    expect(changed.past).toHaveLength(1)
    const undone = undoPlan(changed)
    expect(undone.present).toEqual(initial.present)
    expect(redoPlan(undone).present).toEqual(changed.present)
    expect(pushPlanChange(undone, translateSelection(undone.present, ['desk-first'], 'desk-first', -2, -1, true))).toBe(
      undone,
    )
  })
})

describe('actions sur toute la sélection', () => {
  it('pivote les origines et les orientations autour d’un pivot commun avec la convention de la vue 3D', () => {
    const plan = fixture(),
      source = structuredClone(plan)
    const ids = ['desk-second', 'furniture-table']
    const items = resolveSelection(plan, ids),
      boxes = items.map(footprintBounds)
    const pivotX = (Math.min(...boxes.map((box) => box.minX)) + Math.max(...boxes.map((box) => box.maxX))) / 2
    const pivotZ = (Math.min(...boxes.map((box) => box.minZ)) + Math.max(...boxes.map((box) => box.maxZ))) / 2
    const rotated = rotateSelection(plan, ids, Math.PI / 2)
    for (const before of items) {
      const after = resolveSelection(rotated, [before.id])[0]!
      expect(after.position[0]).toBeCloseTo(pivotX + before.position[2] - pivotZ)
      expect(after.position[2]).toBeCloseTo(pivotZ - before.position[0] + pivotX)
      expect(after.rotation).toBeCloseTo((before.rotation + Math.PI / 2) % (Math.PI * 2))
    }
    const after = resolveSelection(rotated, ids)
    expect(after[1]!.position[0] - after[0]!.position[0]).toBeCloseTo(-3)
    expect(after[1]!.position[2] - after[0]!.position[2]).toBeCloseTo(-1)
    expect(rotated.workstations[0]).toBe(plan.workstations[0])
    expect(rotated.furniture[0]).toBe(plan.furniture[0])
    expect(parsePlan(JSON.stringify(rotated))).toEqual(rotated)
    expect(plan).toEqual(source)
  })

  it('corrige la position de l’assemblage par un seul delta après rotation au bord de la salle', () => {
    const plan = fixture()
    plan.workstations = []
    plan.furniture = [
      { ...createFurniture('partition', 'furniture-first'), width: 4, depth: 0.2, position: [0, 0, -3.8] },
      { ...createFurniture('plant', 'furniture-second'), position: [2.5, 0, -3.5] },
    ]
    const rotated = rotateSelection(
      plan,
      plan.furniture.map((item) => item.id),
      Math.PI / 2,
    )
    expect(rotated.furniture[1]!.position[0] - rotated.furniture[0]!.position[0]).toBeCloseTo(0.3)
    expect(rotated.furniture[1]!.position[2] - rotated.furniture[0]!.position[2]).toBeCloseTo(-2.5)
    for (const item of rotated.furniture) {
      const bounds = footprintBounds(item)
      expect(bounds.minZ).toBeGreaterThanOrEqual(-4 - 1e-7)
      expect(bounds.maxZ).toBeLessThanOrEqual(4 + 1e-7)
    }
    expect(parsePlan(JSON.stringify(rotated))).toEqual(rotated)
  })

  it('refuse intégralement une rotation trop grande et les angles non finis', () => {
    const plan = fixture()
    plan.width = 12
    plan.depth = 6
    plan.workstations = []
    plan.furniture = [
      { ...createFurniture('table', 'furniture-first'), width: 6, position: [-3, 0, 0] },
      { ...createFurniture('table', 'furniture-second'), width: 6, position: [3, 0, 0] },
    ]
    const source = structuredClone(plan)
    expect(() =>
      rotateSelection(
        plan,
        plan.furniture.map((item) => item.id),
        Math.PI / 2,
      ),
    ).toThrow()
    expect(() => rotateSelection(plan, [], Number.NaN)).toThrow()
    expect(() => rotateSelection(plan, [], Number.POSITIVE_INFINITY)).toThrow()
    expect(plan).toEqual(source)
  })

  it('copie un assemblage avec des identifiants neufs, un delta commun et aucune collision avec le plan source', () => {
    const plan = fixture(),
      source = structuredClone(plan),
      generated: string[] = []
    plan.width = 20
    plan.depth = 16
    const ids = ['desk-second', 'furniture-table']
    const result = duplicateSelection(plan, ids, (type) => {
      const id = `${type}-copy-${generated.length}`
      generated.push(id)
      return id
    })
    expect(result.selectedIds).toEqual(['desk-copy-0', 'furniture-copy-1'])
    const originals = resolveSelection(plan, ids),
      copies = resolveSelection(result.plan, result.selectedIds)
    expect(result.plan.workstations).toHaveLength(plan.workstations.length + 1)
    expect(result.plan.furniture).toHaveLength(plan.furniture.length + 1)
    expect(copies[1]!.position[0] - copies[0]!.position[0]).toBeCloseTo(
      originals[1]!.position[0] - originals[0]!.position[0],
    )
    expect(copies[1]!.position[2] - copies[0]!.position[2]).toBeCloseTo(
      originals[1]!.position[2] - originals[0]!.position[2],
    )
    for (const [index, copy] of copies.entries()) {
      expect(copy.rotation).toBe(originals[index]!.rotation)
      expect(copy.label).toBe(`${originals[index]!.label} (copie)`)
      expect([...plan.workstations, ...plan.furniture].every((item) => !mixedOverlaps(copy, item))).toBe(true)
    }
    expect(result.plan.workstations[0]).toBe(plan.workstations[0])
    expect(result.plan.furniture[0]).toBe(plan.furniture[0])
    expect(parsePlan(JSON.stringify(result.plan))).toEqual(result.plan)
    expect(plan.workstations).toEqual(source.workstations)
    expect(plan.furniture).toEqual(source.furniture)
  })

  it('ne consomme aucun identifiant si tout l’assemblage ne trouve pas de place', () => {
    const plan = fixture()
    plan.width = 6
    plan.depth = 6
    plan.workstations = []
    plan.furniture = [{ ...createFurniture('cabinet', 'furniture-full'), width: 6, depth: 4 }]
    let generated = 0
    const source = structuredClone(plan)
    expect(() =>
      duplicateSelection(plan, ['furniture-full'], () => {
        generated++
        return 'furniture-copy'
      }),
    ).toThrow(/zone libre/)
    expect(generated).toBe(0)
    expect(plan).toEqual(source)
  })

  it('respecte chaque quota et refuse toute duplication partielle ou tout identifiant invalide', () => {
    const plan = fixture()
    plan.width = 30
    plan.depth = 30
    plan.furniture = Array.from({ length: 64 }, (_, index) => ({
      ...createFurniture('plant', `furniture-plant-${index}`),
      position: [0, 0, 0],
    }))
    let generated = 0
    expect(() =>
      duplicateSelection(plan, ['desk-first', 'furniture-plant-0'], () => {
        generated++
        return 'furniture-copy'
      }),
    ).toThrow(/64/)
    expect(generated).toBe(0)
    const desks = fixture()
    desks.workstations = Array.from({ length: 64 }, (_, index) => ({ ...desks.workstations[0]!, id: `desk-${index}` }))
    expect(() =>
      duplicateSelection(desks, ['desk-0'], () => {
        generated++
        return 'desk-copy'
      }),
    ).toThrow(/64/)
    expect(generated).toBe(0)
    const free = fixture()
    free.width = 30
    free.depth = 30
    const source = structuredClone(free)
    expect(() => duplicateSelection(free, ['desk-first'], () => 'desk-first')).toThrow(/identifiant/)
    expect(() => duplicateSelection(free, ['desk-first'], () => 'furniture-wrong-type')).toThrow(/identifiant/)
    expect(() => duplicateSelection(free, ['desk-first', 'desk-second'], () => 'desk-identical')).toThrow(/identifiant/)
    expect(free).toEqual(source)
  })

  it('supprime postes et meubles ensemble, puis retrouve leurs identifiants avec une annulation', () => {
    const initial = createPlanHistory(fixture())
    const removed = removeSelection(initial.present, ['desk-second', 'furniture-table', 'desk-second'])
    expect(removed.workstations.map((item) => item.id)).toEqual(['desk-first'])
    expect(removed.furniture.map((item) => item.id)).toEqual(['furniture-plant'])
    expect(removed.workstations[0]).toBe(initial.present.workstations[0])
    const history = pushPlanChange(initial, removed)
    expect(history.past).toHaveLength(1)
    expect(undoPlan(history).present).toEqual(initial.present)
    expect(redoPlan(undoPlan(history)).present).toEqual(removed)
  })

  it('n’enregistre aucune action vide ni rotation d’un tour complet', () => {
    const plan = fixture()
    expect(rotateSelection(plan, [], Math.PI / 2)).toBe(plan)
    expect(rotateSelection(plan, ['desk-first'], Math.PI * 2)).toBe(plan)
    expect(removeSelection(plan, ['desk-missing'])).toBe(plan)
    expect(duplicateSelection(plan, [])).toEqual({ plan, selectedIds: [] })
  })

  it('annule toute la rotation ou duplication en une seule étape', () => {
    const initial = createPlanHistory(fixture()),
      ids = ['desk-second', 'furniture-table']
    const rotation = pushPlanChange(initial, rotateSelection(initial.present, ids, Math.PI / 2))
    expect(rotation.past).toHaveLength(1)
    expect(undoPlan(rotation).present).toEqual(initial.present)
    const result = duplicateSelection(initial.present, ['furniture-plant'], () => 'furniture-new-copy')
    const duplication = pushPlanChange(initial, result.plan)
    expect(duplication.past).toHaveLength(1)
    expect(undoPlan(duplication).present).toEqual(initial.present)
    expect(redoPlan(undoPlan(duplication)).present).toEqual(result.plan)
  })
})
