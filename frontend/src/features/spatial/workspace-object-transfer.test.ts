import { describe, expect, it } from 'vitest'
import { createFurniture } from './furniture-catalog'
import { defaultPlan, parsePlan } from './plan-document'
import { footprintBounds, mixedOverlaps } from './plan-geometry'
import { resolveSelection } from './plan-selection'
import {
  createWorkspaceFromPlan,
  createWorkspaceHistory,
  parseWorkspace,
  pushWorkspaceChange,
  redoWorkspace,
  undoWorkspace,
} from './workspace-document'
import { moveSelectionToRoom } from './workspace-object-transfer'
import { findWorkspaceStation } from './workspace-rooms'

function fixture() {
  const workspace = createWorkspaceFromPlan(
    parsePlan(
      JSON.stringify({
        ...structuredClone(defaultPlan),
        workstations: [
          { ...defaultPlan.workstations[0]!, id: 'desk-transfer', position: [-2, 0, -1], rotation: Math.PI / 2 },
        ],
        furniture: [
          { ...createFurniture('table', 'furniture-transfer'), position: [1, 0, -1] },
          { ...createFurniture('plant', 'furniture-stay'), position: [-3, 0, 2] },
        ],
      }),
    ),
  )
  workspace.floors.push({ id: 'floor-support', name: 'Support' })
  workspace.rooms.push({
    floorId: 'floor-support',
    plan: {
      ...structuredClone(defaultPlan),
      id: 'room-target',
      name: 'Salle cible',
      width: 10,
      depth: 8,
      workstations: [],
      furniture: [],
      display: { walls: true, decor: false },
    },
  })
  workspace.rooms.push({
    floorId: 'floor-01',
    plan: {
      ...structuredClone(defaultPlan),
      id: 'room-unrelated',
      name: 'Autre salle',
      workstations: [],
      furniture: [],
    },
  })
  return workspace
}

describe('déplacement des objets entre salles', () => {
  it('transfère une sélection mixte au centre sans changer les IDs, les distances ou les autres salles', () => {
    const workspace = fixture(),
      source = structuredClone(workspace)
    const ids = ['furniture-transfer', 'desk-transfer', 'desk-transfer']
    const result = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ids)
    expect(result.selectedIds).toEqual(['furniture-transfer', 'desk-transfer'])
    expect(result.workspace.rooms[0]!.plan.workstations).toHaveLength(0)
    expect(result.workspace.rooms[0]!.plan.furniture.map((item) => item.id)).toEqual(['furniture-stay'])
    const target = result.workspace.rooms[1]!.plan
    const moved = resolveSelection(target, result.selectedIds),
      before = resolveSelection(workspace.rooms[0]!.plan, result.selectedIds)
    expect(moved[1]!.position[0] - moved[0]!.position[0]).toBeCloseTo(3)
    expect(moved[1]!.position[2] - moved[0]!.position[2]).toBeCloseTo(0)
    const bounds = moved.map(footprintBounds)
    expect(Math.min(...bounds.map((box) => box.minX)) + Math.max(...bounds.map((box) => box.maxX))).toBeCloseTo(0)
    expect(Math.min(...bounds.map((box) => box.minZ)) + Math.max(...bounds.map((box) => box.maxZ))).toBeCloseTo(0)
    for (const [index, item] of moved.entries()) {
      const { position: _position, ...properties } = item
      const { position: _originalPosition, ...originalProperties } = before[index]!
      expect(properties).toEqual(originalProperties)
    }
    expect(result.workspace.rooms[2]).toBe(workspace.rooms[2])
    expect(result.workspace.rooms[0]!.plan.furniture[0]).toBe(workspace.rooms[0]!.plan.furniture[1])
    expect(workspace).toEqual(source)
    expect(parseWorkspace(JSON.stringify(result.workspace))).toEqual(result.workspace)
  })

  it('suit une position d’arrivée explicite et borne ensemble les empreintes, fauteuil compris', () => {
    const workspace = fixture()
    const result = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer', 'furniture-transfer'], {
      x: 100,
      z: -100,
    })
    const target = result.workspace.rooms[1]!.plan,
      moved = resolveSelection(target, result.selectedIds)
    const bounds = moved.map(footprintBounds)
    expect(Math.max(...bounds.map((box) => box.maxX))).toBeCloseTo(5)
    expect(Math.min(...bounds.map((box) => box.minZ))).toBeCloseTo(-4)
    expect(moved[1]!.position[0] - moved[0]!.position[0]).toBeCloseTo(3)
    expect(moved[1]!.position[2] - moved[0]!.position[2]).toBeCloseTo(0)
    expect(parseWorkspace(JSON.stringify(result.workspace))).toEqual(result.workspace)
  })

  it('cherche une place pour tout l’assemblage lorsque le centre est occupé, sans collision avec les occupants', () => {
    const workspace = fixture()
    workspace.rooms[1]!.plan.furniture = [{ ...createFurniture('table', 'furniture-occupant'), width: 3, depth: 2 }]
    const occupant = workspace.rooms[1]!.plan.furniture[0]!
    const result = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer', 'furniture-transfer'])
    const moved = resolveSelection(result.workspace.rooms[1]!.plan, result.selectedIds)
    for (const item of moved) expect(mixedOverlaps(item, occupant)).toBe(false)
    expect(moved[1]!.position[0] - moved[0]!.position[0]).toBeCloseTo(3)
    expect(result.workspace.rooms[1]!.plan.furniture[0]).toBe(occupant)
    expect(parseWorkspace(JSON.stringify(result.workspace))).toEqual(result.workspace)
  })

  it('conserve les localisations de matériel et les résout désormais dans la salle et l’étage d’arrivée', () => {
    const workspace = fixture(),
      locations = Object.freeze({ 42: 'desk-transfer' })
    expect(findWorkspaceStation(workspace, locations[42])!.room.plan.id).toBe('plateau-a')
    const result = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer'])
    const located = findWorkspaceStation(result.workspace, locations[42])!
    expect(located.room.plan.id).toBe('room-target')
    expect(located.floor.id).toBe('floor-support')
    expect(located.station.id).toBe('desk-transfer')
    expect(locations).toEqual({ 42: 'desk-transfer' })
  })

  it('rend visible le décor transféré tout en conservant les autres préférences de la salle', () => {
    const workspace = fixture()
    const onlyTable = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['furniture-transfer'])
    expect(onlyTable.workspace.rooms[1]!.plan.display).toBe(workspace.rooms[1]!.plan.display)
    const plant = moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['furniture-stay'])
    expect(plant.workspace.rooms[1]!.plan.display).toEqual({ walls: true, decor: true })
    expect(plant.workspace.rooms[0]!.plan.display).toBe(workspace.rooms[0]!.plan.display)
  })

  it('refuse les IDs absents, les salles absentes et les positions invalides sans transfert partiel', () => {
    const workspace = fixture(),
      source = structuredClone(workspace)
    expect(() => moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer', 'desk-missing'])).toThrow(
      /sélection/,
    )
    expect(() => moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['furniture-elsewhere'])).toThrow(
      /sélection/,
    )
    expect(() => moveSelectionToRoom(workspace, 'room-missing', 'room-target', ['desk-transfer'])).toThrow(/salle/)
    expect(() => moveSelectionToRoom(workspace, 'plateau-a', 'room-missing', ['desk-transfer'])).toThrow(/salle/)
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(() =>
        moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer'], { x: value, z: 0 }),
      ).toThrow(/coordonnées/)
      expect(() =>
        moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer'], { x: 0, z: value }),
      ).toThrow(/coordonnées/)
    }
    expect(workspace).toEqual(source)
  })

  it('refuse un assemblage trop grand au lieu de déformer ses distances pour le faire rentrer', () => {
    const workspace = fixture()
    workspace.rooms[0]!.plan.width = 30
    workspace.rooms[0]!.plan.workstations[0]!.position = [-10, 0, 0]
    workspace.rooms[0]!.plan.furniture[0]!.position = [10, 0, 0]
    const source = structuredClone(workspace)
    expect(() =>
      moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer', 'furniture-transfer']),
    ).toThrow(/ne tient pas/)
    expect(workspace).toEqual(source)
  })

  it('refuse une salle sans zone libre et ne retire jamais les objets de la salle de départ', () => {
    const workspace = fixture()
    workspace.rooms[1]!.plan.width = 6
    workspace.rooms[1]!.plan.depth = 6
    workspace.rooms[1]!.plan.furniture = [
      { ...createFurniture('table', 'furniture-block-01'), width: 6, depth: 3, position: [0, 0, -1.5] },
      { ...createFurniture('table', 'furniture-block-02'), width: 6, depth: 3, position: [0, 0, 1.5] },
    ]
    const source = structuredClone(workspace)
    expect(() => moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer'])).toThrow(/zone libre/)
    expect(workspace).toEqual(source)
  })

  it('contrôle séparément les quotas de postes et de meubles avant tout changement', () => {
    const workspace = fixture()
    workspace.rooms[1]!.plan.furniture = Array.from({ length: 64 }, (_, index) => ({
      ...createFurniture('plant', `furniture-full-${index}`),
    }))
    const source = structuredClone(workspace)
    expect(() =>
      moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer', 'furniture-transfer']),
    ).toThrow(/64/)
    expect(workspace).toEqual(source)
    workspace.rooms[1]!.plan.furniture = []
    workspace.rooms[1]!.plan.workstations = Array.from({ length: 64 }, (_, index) => ({
      ...defaultPlan.workstations[0]!,
      id: `desk-full-${index}`,
    }))
    const full = structuredClone(workspace)
    expect(() => moveSelectionToRoom(workspace, 'plateau-a', 'room-target', ['desk-transfer'])).toThrow(/64/)
    expect(workspace).toEqual(full)
  })

  it('ne crée aucun changement pour une liste vide ou un transfert vers la même salle', () => {
    const workspace = fixture()
    expect(moveSelectionToRoom(workspace, 'plateau-a', 'room-target', [])).toEqual({ workspace, selectedIds: [] })
    expect(moveSelectionToRoom(workspace, 'plateau-a', 'room-target', []).workspace).toBe(workspace)
    const same = moveSelectionToRoom(workspace, 'plateau-a', 'plateau-a', [
      'furniture-transfer',
      'desk-transfer',
      'desk-transfer',
    ])
    expect(same.workspace).toBe(workspace)
    expect(same.selectedIds).toEqual(['furniture-transfer', 'desk-transfer'])
  })

  it('annule et rétablit tout le transfert en une seule étape, avec les mêmes liens de matériel', () => {
    const initial = createWorkspaceHistory(fixture()),
      ids = ['desk-transfer', 'furniture-transfer']
    const moved = moveSelectionToRoom(initial.present, 'plateau-a', 'room-target', ids)
    const history = pushWorkspaceChange(initial, moved.workspace)
    expect(history.past).toHaveLength(1)
    expect(findWorkspaceStation(history.present, 'desk-transfer')!.room.plan.id).toBe('room-target')
    const undone = undoWorkspace(history)
    expect(undone.present).toEqual(initial.present)
    expect(findWorkspaceStation(undone.present, 'desk-transfer')!.room.plan.id).toBe('plateau-a')
    expect(redoWorkspace(undone).present).toEqual(history.present)
  })
})
