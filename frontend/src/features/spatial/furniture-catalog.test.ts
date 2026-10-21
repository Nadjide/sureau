import { describe, expect, it } from 'vitest'
import { defaultPlan, parsePlan } from './plan-document'
import { clampFurniture, mixedOverlaps } from './plan-geometry'
import { createFurniture, findFreeFurniturePlacement, furnitureCatalog, initialFurniture } from './furniture-catalog'

describe('catalogue de mobilier', () => {
  it('propose cinq familles créant chacune un objet valide et indépendant', () => {
    expect(furnitureCatalog.map((entry) => entry.kind)).toEqual(['table', 'cabinet', 'plant', 'partition', 'sofa'])
    for (const entry of furnitureCatalog) {
      const first = createFurniture(entry.kind, `furniture-${entry.kind}-01`)
      const second = createFurniture(entry.kind, `furniture-${entry.kind}-02`)
      const plan = { ...structuredClone(defaultPlan), workstations: [], furniture: [first] }
      expect(parsePlan(JSON.stringify(plan)).furniture).toEqual([first])
      expect(first).toMatchObject({ kind: entry.kind, color: entry.defaultColor, width: entry.width, depth: entry.depth, height: entry.height })
      expect(first.position).not.toBe(second.position)
      first.position[0] = 1
      expect(second.position).toEqual([0, 0, 0])
    }
  })

  it('refuse un identifiant de poste ou une valeur dangereuse pour un meuble', () => {
    expect(() => createFurniture('table', 'desk-01')).toThrow(RangeError)
    expect(() => createFurniture('plant', '__proto__')).toThrow(RangeError)
  })

  it('reprend le décor historique avec ses coordonnées et des identifiants stables', () => {
    const items = initialFurniture(13, 9)
    expect(items.map((item) => item.id)).toEqual(['furniture-plant-01', 'furniture-plant-02', 'furniture-plant-03', 'furniture-cabinet-01'])
    expect(items.map((item) => item.position)).toEqual([[-5.72, 0, -3.6], [5.76, 0, 3.55], [-5.7, 0, 3.48], [3.85, 0, -3.99]])
    items[0]!.position[0] = 0
    expect(initialFurniture(13, 9)[0]!.position[0]).toBe(-5.72)
    expect(defaultPlan.furniture[0]!.position[0]).toBe(-5.72)
  })

  it('adapte le décor aux dimensions d’une ancienne pièce et borne chaque objet', () => {
    const bounds = { width: 6, depth: 6 }
    const items = initialFurniture(bounds.width, bounds.depth)
    expect(items).toHaveLength(4)
    for (const item of items) expect(clampFurniture(bounds, item)).toBe(item)
    const plan = { ...structuredClone(defaultPlan), ...bounds, workstations: [], furniture: items }
    expect(parsePlan(JSON.stringify(plan)).furniture).toEqual(items)
  })

  it('expose une recherche de place qui préserve les objets déjà présents', () => {
    const existing = createFurniture('table', 'furniture-existing')
    const plan = { ...structuredClone(defaultPlan), workstations: [], furniture: [existing] }
    const template = createFurniture('sofa', 'furniture-new')
    const placed = findFreeFurniturePlacement(plan, template)
    expect(placed).not.toBeNull()
    expect(mixedOverlaps(placed!, existing)).toBe(false)
    expect(existing.position).toEqual([0, 0, 0])
    expect(template.position).toEqual([0, 0, 0])
    expect(placed!.id).toBe('furniture-new')
  })
})
