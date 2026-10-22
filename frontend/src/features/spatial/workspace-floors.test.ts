import { describe, expect, it, vi } from 'vitest'
import { defaultPlan } from './plan-document'
import {
  createWorkspaceFromPlan, createWorkspaceHistory, parseWorkspace, pushWorkspaceChange,
  redoWorkspace, undoWorkspace, workspaceFloorLimit,
} from './workspace-document'
import { createFloor, moveRoomToFloor, removeFloor, renameFloor, renameWorkspace, reorderFloor } from './workspace-floors'
import { findWorkspaceStation } from './workspace-rooms'

function threeFloors() {
  const workspace = createWorkspaceFromPlan()
  workspace.floors.push({ id: 'floor-support', name: 'Support' }, { id: 'floor-reserve', name: 'Réserve' })
  workspace.rooms.push({
    floorId: 'floor-support',
    plan: {
      ...structuredClone(defaultPlan), id: 'room-support', name: 'Salle support',
      workstations: [{ ...structuredClone(defaultPlan.workstations[0]!), id: 'desk-support' }], furniture: [],
    },
  }, {
    floorId: 'floor-01',
    plan: { ...structuredClone(defaultPlan), id: 'room-extension', name: 'Salle projet', workstations: [], furniture: [] },
  })
  return workspace
}

describe('gestion des étages', () => {
  it('crée un étage vide au bout de la liste sans modifier les plans ou leurs identifiants', () => {
    const workspace = threeFloors(), source = structuredClone(workspace), factory = vi.fn(() => 'floor-design')
    const result = createFloor(workspace, '  Design  ', factory)
    expect(result.floorId).toBe('floor-design')
    expect(result.workspace.floors.at(-1)).toEqual({ id: 'floor-design', name: 'Design' })
    expect(result.workspace.rooms).toBe(workspace.rooms)
    expect(result.workspace.floors[0]).toBe(workspace.floors[0])
    expect(factory).toHaveBeenCalledExactlyOnceWith()
    expect(workspace).toEqual(source)
    expect(parseWorkspace(JSON.stringify(result.workspace))).toEqual(result.workspace)
  })

  it('bloque le neuvième étage avant de générer un identifiant', () => {
    const workspace = createWorkspaceFromPlan(), factory = vi.fn(() => 'floor-overflow')
    workspace.floors = Array.from({ length: workspaceFloorLimit }, (_, index) => ({ id: `floor-cap-${index + 1}`, name: `Étage ${index + 1}` }))
    workspace.rooms[0]!.floorId = workspace.floors[0]!.id
    expect(() => createFloor(workspace, 'Encore', factory)).toThrow(/8 étages/)
    expect(factory).not.toHaveBeenCalled()
    expect(workspace.floors).toHaveLength(workspaceFloorLimit)
  })

  it.each(['floor-01', 'floor-support', 'bad', 'floor-AZ', 'floor-a'])('refuse un identifiant pris ou invalide : %s', (id) => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    expect(() => createFloor(workspace, 'Nouvel étage', () => id)).toThrow(/identifiant/)
    expect(workspace).toEqual(source)
  })

  it.each(['', '   ', 'x'.repeat(61)])('refuse un nom vide ou trop long sans modifier l’espace', (name) => {
    const workspace = threeFloors(), source = structuredClone(workspace), factory = vi.fn(() => 'floor-design')
    expect(() => createFloor(workspace, name, factory)).toThrow(/nom/)
    expect(() => renameFloor(workspace, 'floor-support', name)).toThrow(/nom/)
    expect(() => renameWorkspace(workspace, name)).toThrow(/nom/)
    expect(factory).not.toHaveBeenCalled()
    expect(workspace).toEqual(source)
  })

  it('accepte les noms de soixante caractères et normalise seulement les espaces extérieurs', () => {
    const workspace = threeFloors(), name = 'x'.repeat(60)
    expect(createFloor(workspace, ` ${name} `, () => 'floor-long').workspace.floors.at(-1)!.name).toBe(name)
    expect(renameFloor(workspace, 'floor-support', ` ${name} `).floors[1]!.name).toBe(name)
    expect(renameWorkspace(workspace, '  Atelier   Paris  ').name).toBe('Atelier   Paris')
  })

  it('renomme un étage ou l’espace en conservant les plans, les autres étages et leurs IDs', () => {
    const workspace = threeFloors()
    const renamed = renameFloor(workspace, 'floor-support', '  Pôle support  ')
    expect(renamed.floors[1]).toEqual({ id: 'floor-support', name: 'Pôle support' })
    expect(renamed.floors[0]).toBe(workspace.floors[0])
    expect(renamed.rooms).toBe(workspace.rooms)
    const named = renameWorkspace(renamed, '  Siège Paris  ')
    expect(named.name).toBe('Siège Paris')
    expect(named.floors).toBe(renamed.floors)
    expect(named.rooms).toBe(workspace.rooms)
    expect(renameFloor(workspace, 'floor-support', ' Support ')).toBe(workspace)
    expect(renameWorkspace(workspace, ' Espace de travail ')).toBe(workspace)
  })

  it('déplace une salle en conservant le même plan et les localisations de ses postes', () => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    const moved = moveRoomToFloor(workspace, 'plateau-a', 'floor-support')
    expect(moved.rooms[0]!.floorId).toBe('floor-support')
    expect(moved.rooms[0]!.plan).toBe(workspace.rooms[0]!.plan)
    expect(moved.rooms[1]).toBe(workspace.rooms[1])
    expect(moved.rooms[2]).toBe(workspace.rooms[2])
    expect(moved.floors).toBe(workspace.floors)
    expect(findWorkspaceStation(moved, 'desk-01')!.floor.id).toBe('floor-support')
    expect(findWorkspaceStation(moved, 'desk-01')!.station).toBe(workspace.rooms[0]!.plan.workstations[0])
    expect(moveRoomToFloor(moved, 'plateau-a', 'floor-support')).toBe(moved)
    expect(workspace).toEqual(source)
  })

  it('ordonne les étages sans réordonner ni reconstruire les salles et ignore une borne déjà atteinte', () => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    const raised = reorderFloor(workspace, 'floor-support', -1)
    expect(raised.floors.map((floor) => floor.id)).toEqual(['floor-support', 'floor-01', 'floor-reserve'])
    expect(raised.floors[0]).toBe(workspace.floors[1])
    expect(raised.rooms).toBe(workspace.rooms)
    expect(reorderFloor(raised, 'floor-support', -1)).toBe(raised)
    expect(reorderFloor(workspace, 'floor-reserve', 1)).toBe(workspace)
    expect(reorderFloor(raised, 'floor-support', 1)).toEqual(workspace)
    expect(workspace).toEqual(source)
  })

  it('supprime directement un étage vide en gardant toutes les salles intactes', () => {
    const workspace = threeFloors()
    const removed = removeFloor(workspace, 'floor-reserve')
    expect(removed.floors.map((floor) => floor.id)).toEqual(['floor-01', 'floor-support'])
    expect(removed.floors[0]).toBe(workspace.floors[0])
    expect(removed.rooms).toBe(workspace.rooms)
    expect(workspace.floors).toHaveLength(3)
  })

  it('exige un autre étage existant avant de supprimer un étage occupé et préserve le dernier étage', () => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    expect(() => removeFloor(workspace, 'floor-01')).toThrow(/autre étage/)
    expect(() => removeFloor(workspace, 'floor-01', 'floor-01')).toThrow(/autre étage/)
    expect(() => removeFloor(workspace, 'floor-01', 'floor-missing')).toThrow(/étage/)
    expect(() => removeFloor(createWorkspaceFromPlan(), 'floor-01')).toThrow(/au moins un étage/)
    expect(workspace).toEqual(source)
  })

  it('reloge toutes les salles d’un étage supprimé sans perdre de poste, de meuble ou d’ID', () => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    const removed = removeFloor(workspace, 'floor-01', 'floor-support')
    expect(removed.floors.map((floor) => floor.id)).toEqual(['floor-support', 'floor-reserve'])
    expect(removed.rooms).toHaveLength(workspace.rooms.length)
    expect(removed.rooms.map((room) => room.floorId)).toEqual(['floor-support', 'floor-support', 'floor-support'])
    expect(removed.rooms[1]).toBe(workspace.rooms[1])
    removed.rooms.forEach((room, index) => expect(room.plan).toBe(workspace.rooms[index]!.plan))
    expect(findWorkspaceStation(removed, 'desk-01')!.floor.id).toBe('floor-support')
    expect(workspace).toEqual(source)
  })

  it('annule et rétablit suppression et relogement comme une seule édition de l’espace', () => {
    const initial = createWorkspaceHistory(threeFloors())
    const removed = removeFloor(initial.present, 'floor-01', 'floor-support')
    const history = pushWorkspaceChange(initial, removed)
    expect(history.past).toHaveLength(1)
    expect(history.present.rooms[0]!.plan).toBe(initial.present.rooms[0]!.plan)
    expect(history.present.rooms[1]).toBe(initial.present.rooms[1])
    const restored = undoWorkspace(history)
    expect(restored.present).toBe(initial.present)
    expect(findWorkspaceStation(restored.present, 'desk-01')!.floor.id).toBe('floor-01')
    const noop = renameFloor(restored.present, 'floor-01', ' Étage 1 ')
    expect(pushWorkspaceChange(restored, noop)).toBe(restored)
    expect(redoWorkspace(restored).present).toEqual(removed)
  })

  it('refuse les ressources absentes et les directions invalides sans mutation', () => {
    const workspace = threeFloors(), source = structuredClone(workspace)
    expect(() => renameFloor(workspace, 'floor-missing', 'Étage')).toThrow(/étage/)
    expect(() => moveRoomToFloor(workspace, 'room-missing', 'floor-01')).toThrow(/salle/)
    expect(() => moveRoomToFloor(workspace, 'plateau-a', 'floor-missing')).toThrow(/étage/)
    expect(() => reorderFloor(workspace, 'floor-missing', 1)).toThrow(/étage/)
    expect(() => reorderFloor(workspace, 'floor-01', 0 as 1)).toThrow(/rang/)
    expect(() => removeFloor(workspace, 'floor-missing')).toThrow(/étage/)
    expect(() => removeFloor(workspace, 'floor-reserve', 'floor-missing')).toThrow(/étage/)
    expect(workspace).toEqual(source)
  })

  it('valide aussi les invariants globaux pour une édition ou une opération sans effet', () => {
    const invalid = threeFloors()
    invalid.rooms[1]!.plan.workstations[0]!.id = 'desk-01'
    const source = structuredClone(invalid)
    expect(() => createFloor(invalid, 'Étage', () => 'floor-valid')).toThrow(/invalide/)
    expect(() => renameWorkspace(invalid, 'Autre espace')).toThrow(/invalide/)
    expect(() => renameWorkspace(invalid, invalid.name)).toThrow(/invalide/)
    expect(() => renameFloor(invalid, 'floor-01', 'Étage 1')).toThrow(/invalide/)
    expect(() => moveRoomToFloor(invalid, 'plateau-a', 'floor-01')).toThrow(/invalide/)
    expect(() => reorderFloor(invalid, 'floor-01', -1)).toThrow(/invalide/)
    expect(() => removeFloor(invalid, 'floor-reserve')).toThrow(/invalide/)
    expect(invalid).toEqual(source)
  })
})
