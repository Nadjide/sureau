import { describe, expect, it } from 'vitest'
import { defaultPlan } from './plan-document'
import type { SpatialPlan, Workstation } from './room-model'
import { clampWorkstation, findFreePlacement, normalizeRotation, overlaps, snapWorkstation } from './plan-geometry'

function plan(): SpatialPlan {
  return { ...structuredClone(defaultPlan), workstations: [] }
}

function station(overrides: Partial<Workstation> = {}): Workstation {
  return {
    id: 'desk-test', label: 'Poste test', position: [0, 0, 0],
    rotation: 0, width: 2, depth: 1, color: null, ...overrides,
  }
}

function corners(item: Workstation): [number, number][] {
  return [-item.width / 2, item.width / 2].flatMap((x) => [-0.5 * item.depth, 1.3 * item.depth].map((z): [number, number] => [
    item.position[0] + Math.cos(item.rotation) * x + Math.sin(item.rotation) * z,
    item.position[2] - Math.sin(item.rotation) * x + Math.cos(item.rotation) * z,
  ]))
}

describe('géométrie du plateau', () => {
  it('normalise les rotations positives, négatives et les tours complets', () => {
    expect(normalizeRotation(0)).toBe(0)
    expect(Object.is(normalizeRotation(-0), -0)).toBe(false)
    expect(normalizeRotation(Math.PI * 2)).toBe(0)
    expect(normalizeRotation(-Math.PI / 2)).toBeCloseTo(Math.PI * 1.5)
    expect(normalizeRotation(Math.PI * 9)).toBeCloseTo(Math.PI)
    expect(normalizeRotation(-Number.MIN_VALUE)).toBeLessThan(Math.PI * 2)
  })

  it.each([Number.NaN, Infinity, -Infinity])('refuse une rotation non finie : %s', (rotation) => {
    expect(() => normalizeRotation(rotation)).toThrow(RangeError)
  })

  it.each([0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5, -Math.PI / 3])(
    'garde table et fauteuil dans les quatre murs à la rotation %s', (rotation) => {
      const room = plan()
      for (const x of [-100, 100]) {
        for (const z of [-100, 100]) {
          const candidate = clampWorkstation(room, station({ position: [x, 0, z], rotation, width: 3, depth: 1.5 }))
          for (const [cornerX, cornerZ] of corners(candidate)) {
            expect(Math.abs(cornerX)).toBeLessThanOrEqual(room.width / 2 + 1e-7)
            expect(Math.abs(cornerZ)).toBeLessThanOrEqual(room.depth / 2 + 1e-7)
          }
        }
      }
    },
  )

  it('tient compte du fauteuil décalé et du sens de rotation Three.js', () => {
    const room = { ...plan(), width: 6, depth: 6 }
    expect(clampWorkstation(room, station({ position: [0, 0, 9] })).position[2]).toBeCloseTo(1.7)
    expect(clampWorkstation(room, station({ position: [9, 0, 0], rotation: Math.PI / 2 })).position[0]).toBeCloseTo(1.7)
    expect(clampWorkstation(room, station({ position: [-9, 0, 0], rotation: Math.PI * 1.5 })).position[0]).toBeCloseTo(-1.7)
  })

  it('conserve toutes les propriétés et ne modifie pas le poste source', () => {
    const original = station({ position: [99, 0, 99], color: '#123456' })
    const moved = clampWorkstation(plan(), original)
    expect(moved).toMatchObject({ id: original.id, label: original.label, color: original.color, width: 2, depth: 1 })
    expect(original.position).toEqual([99, 0, 99])
    expect(moved.position).not.toBe(original.position)
    const unchanged = station({ position: [0.12345, 0, 0.12345] })
    expect(clampWorkstation(plan(), unchanged)).toBe(unchanged)
  })

  it('aimante au quart de mètre, permet de désactiver la grille puis respecte le mur', () => {
    const room = plan()
    const candidate = station({ position: [0.36, 0, -0.64] })
    expect(snapWorkstation(room, candidate).position).toEqual([0.25, 0, -0.75])
    expect(snapWorkstation(room, candidate, false).position).toEqual([0.36, 0, -0.64])
    const nearWall = snapWorkstation(room, station({ position: [0, 0, 99] }))
    expect(nearWall.position[2]).toBeCloseTo(3.2)
    expect(corners(nearWall).every(([, z]) => z <= room.depth / 2 + 1e-7)).toBe(true)
  })

  it.each([
    station({ width: 0 }), station({ depth: -1 }), station({ position: [Infinity, 0, 0] }),
    station({ rotation: Number.NaN }),
  ])('refuse des propriétés non finies ou des dimensions invalides', (candidate) => {
    expect(() => clampWorkstation(plan(), candidate)).toThrow(RangeError)
  })

  it('refuse une enveloppe impossible ou un plateau non fini', () => {
    expect(() => clampWorkstation({ ...plan(), width: 1 }, station())).toThrow(RangeError)
    expect(() => clampWorkstation({ ...plan(), depth: Infinity }, station())).toThrow(RangeError)
  })

  it('détecte les chevauchements table/fauteuil et permet le contact exact', () => {
    const first = station()
    expect(overlaps(first, station({ position: [1.9, 0, 0] }))).toBe(true)
    expect(overlaps(first, station({ position: [2, 0, 0] }))).toBe(false)
    expect(overlaps(first, station({ position: [0, 0, 1.7] }))).toBe(true)
    expect(overlaps(first, station({ position: [0, 0, 1.8] }))).toBe(false)
  })

  it('utilise les axes orientés pour éviter les faux chevauchements des boîtes englobantes', () => {
    const first = station({ rotation: Math.PI / 4 })
    const second = station({ rotation: Math.PI / 4, position: [1.45, 0, -1.45] })
    expect(overlaps(first, second)).toBe(false)
    expect(overlaps(second, first)).toBe(false)
    expect(overlaps(first, station({ rotation: Math.PI / 4, position: [1.3, 0, -1.3] }))).toBe(true)
    expect(overlaps(first, station({ rotation: -Math.PI / 4 }))).toBe(true)
  })

  it('trouve une place proche du point demandé sans modifier le document', () => {
    const room = plan()
    const source = station({ id: 'desk-source', position: [3, 0, 1] })
    room.workstations = [source]
    const template = station({ id: 'desk-duplicate', position: [...source.position] })
    const original = structuredClone(room)
    const placement = findFreePlacement(room, template)
    expect(placement).not.toBeNull()
    expect(overlaps(source, placement!)).toBe(false)
    expect(Math.hypot(placement!.position[0] - 3, placement!.position[2] - 1)).toBeLessThanOrEqual(2)
    expect(placement!.id).toBe('desk-duplicate')
    expect(room).toEqual(original)
    expect(template.position).toEqual(source.position)
  })

  it('place un poste dans une pièce vide à proximité du template et toujours dans les limites', () => {
    const room = plan()
    const candidate = findFreePlacement(room, station({ position: [0.24, 0, -0.23] }))
    expect(candidate?.position).toEqual([0, 0, 0])
    const outside = findFreePlacement(room, station({ position: [99, 0, 99], rotation: Math.PI / 4 }))
    expect(outside).not.toBeNull()
    expect(corners(outside!).every(([x, z]) => Math.abs(x) <= room.width / 2 + 1e-7 && Math.abs(z) <= room.depth / 2 + 1e-7)).toBe(true)
  })

  it('retourne null dans une pièce entièrement occupée sans superposer un nouveau poste', () => {
    const room = { ...plan(), width: 6, depth: 6 }
    const depth = 2 / 1.8
    room.workstations = [-2, 0, 2].flatMap((x, column) => [-2, 0, 2].map((center, row) => station({
      id: `desk-${column}-${row}`, position: [x, 0, center - 0.4 * depth], depth,
    })))
    expect(findFreePlacement(room, station({ depth }))).toBeNull()
  })
})
