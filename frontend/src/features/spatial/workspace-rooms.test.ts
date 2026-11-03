import { describe, expect, it, vi } from 'vitest'
import { defaultPlan, parsePlan } from './plan-document'
import {
  createWorkspaceFromPlan,
  createWorkspaceHistory,
  parseWorkspace,
  pushWorkspaceChange,
  redoWorkspace,
  undoWorkspace,
  workspaceRoomLimit,
} from './workspace-document'
import {
  createRoom,
  deleteRoom,
  duplicateRoom,
  findWorkspaceStation,
  prepareRoomReplacement,
  renameRoom,
  type WorkspaceIdFactory,
} from './workspace-rooms'

function idFactory() {
  let index = 0
  return vi.fn<WorkspaceIdFactory>((type) => `${type}-new-${++index}`)
}

function twoRooms() {
  const workspace = createWorkspaceFromPlan()
  workspace.floors.push({ id: 'floor-support', name: 'Support' })
  workspace.rooms.push({
    floorId: 'floor-support',
    plan: parsePlan(
      JSON.stringify({
        ...structuredClone(defaultPlan),
        id: 'room-support',
        name: 'Salle support',
        workstations: [{ ...defaultPlan.workstations[0]!, id: 'desk-support' }],
        furniture: [{ ...defaultPlan.furniture[0]!, id: 'furniture-support' }],
      }),
    ),
  })
  return workspace
}

describe('gestion des salles de l’espace', () => {
  it('crée une salle explicitement vide avec un nom et un identifiant propres, en conservant l’ambiance du modèle', () => {
    const workspace = twoRooms(),
      source = structuredClone(workspace),
      factory = idFactory()
    const template = workspace.rooms[1]!.plan
    template.width = 20
    template.depth = 16
    template.colors.floor = '#123456'
    template.display.walls = false
    const result = createRoom(workspace, 'floor-support', '  Salle projet  ', template, factory)
    const added = result.workspace.rooms.at(-1)!
    expect(result.roomId).toBe('room-new-1')
    expect(added).toMatchObject({
      floorId: 'floor-support',
      plan: { id: 'room-new-1', name: 'Salle projet', width: 20, depth: 16, workstations: [], furniture: [] },
    })
    expect(added.plan.colors).toEqual(template.colors)
    expect(added.plan.display).toEqual(template.display)
    expect(result.workspace.rooms[0]).toBe(workspace.rooms[0])
    expect(result.workspace.rooms[1]).toBe(workspace.rooms[1])
    expect(factory.mock.calls).toEqual([['room']])
    added.plan.colors.floor = '#abcdef'
    expect(template.colors.floor).toBe('#123456')
    expect(workspace.rooms[0]).toEqual(source.rooms[0])
    expect(parseWorkspace(JSON.stringify(result.workspace))).toEqual(result.workspace)
  })

  it('duplique tous les objets sans conserver aucun de leurs identifiants ni partager leurs coordonnées', () => {
    const workspace = twoRooms(),
      source = structuredClone(workspace),
      factory = idFactory()
    const result = duplicateRoom(workspace, 'plateau-a', undefined, factory)
    const original = workspace.rooms[0]!.plan,
      copy = result.workspace.rooms.at(-1)!.plan
    expect(copy.name).toBe('Plateau A (copie)')
    expect(copy.id).toBe(result.roomId)
    expect(result.workspace.rooms.at(-1)!.floorId).toBe('floor-01')
    const originalIds = [
      original.id,
      ...original.workstations.map((item) => item.id),
      ...original.furniture.map((item) => item.id),
    ]
    const copiedIds = [copy.id, ...copy.workstations.map((item) => item.id), ...copy.furniture.map((item) => item.id)]
    expect(copiedIds.every((id) => !originalIds.includes(id))).toBe(true)
    expect(new Set(copiedIds).size).toBe(copiedIds.length)
    expect(copy.colors).toEqual(original.colors)
    expect(copy.workstations.map(({ id: _id, ...item }) => item)).toEqual(
      original.workstations.map(({ id: _id, ...item }) => item),
    )
    expect(copy.furniture.map(({ id: _id, ...item }) => item)).toEqual(
      original.furniture.map(({ id: _id, ...item }) => item),
    )
    copy.workstations[0]!.position[0] = 0
    copy.furniture[0]!.position[0] = 0
    expect(workspace).toEqual(source)
    expect(result.workspace.rooms[1]).toBe(workspace.rooms[1])
  })

  it('contrôle l’étage, le plafond et les noms avant de générer un identifiant', () => {
    const workspace = twoRooms(),
      factory = idFactory()
    expect(() => createRoom(workspace, 'floor-missing', 'Salle', undefined, factory)).toThrow(/étage/)
    expect(() => createRoom(workspace, 'floor-01', ' ', undefined, factory)).toThrow(/nom/)
    expect(() => createRoom(workspace, 'floor-01', 'x'.repeat(61), undefined, factory)).toThrow(/nom/)
    expect(() => duplicateRoom(workspace, 'room-missing', undefined, factory)).toThrow(/salle/)
    expect(() => duplicateRoom(workspace, 'plateau-a', '', factory)).toThrow(/nom/)
    const full = createWorkspaceFromPlan()
    full.rooms = Array.from({ length: workspaceRoomLimit }, (_, index) => ({
      floorId: 'floor-01',
      plan: { ...structuredClone(defaultPlan), id: `room-${index}-full`, workstations: [], furniture: [] },
    }))
    expect(() => createRoom(full, 'floor-01', 'Une autre salle', undefined, factory)).toThrow(/32/)
    expect(() => duplicateRoom(full, full.rooms[0]!.plan.id, undefined, factory)).toThrow(/32/)
    expect(factory).not.toHaveBeenCalled()
  })

  it('refuse un identifiant invalide ou déjà pris sans modifier les salles', () => {
    const workspace = twoRooms(),
      source = structuredClone(workspace)
    expect(() => createRoom(workspace, 'floor-01', 'Salle', undefined, () => 'room-support')).toThrow(/identifiant/)
    expect(() => createRoom(workspace, 'floor-01', 'Salle', undefined, () => 'bad')).toThrow(/identifiant/)
    const factory: WorkspaceIdFactory = (type) =>
      type === 'room' ? 'room-copy' : type === 'desk' ? 'desk-identical' : 'furniture-copy'
    expect(() => duplicateRoom(workspace, 'plateau-a', 'Copie', factory)).toThrow(/identifiant/)
    expect(workspace).toEqual(source)
  })

  it('renomme la salle sans changer ses IDs ou les autres salles et ignore un nom identique après nettoyage', () => {
    const workspace = twoRooms()
    expect(renameRoom(workspace, 'plateau-a', ' Plateau A ')).toBe(workspace)
    const result = renameRoom(workspace, 'room-support', '  Pôle support  ')
    expect(result.rooms[1]!.plan.name).toBe('Pôle support')
    expect(result.rooms[1]!.plan.workstations).toBe(workspace.rooms[1]!.plan.workstations)
    expect(result.rooms[0]).toBe(workspace.rooms[0])
    expect(() => renameRoom(workspace, 'room-support', '')).toThrow()
    expect(() => renameRoom(workspace, 'room-missing', 'Salle')).toThrow()
    expect(workspace.rooms[1]!.plan.name).toBe('Salle support')
  })

  it('retrouve un poste dans une autre salle avec son étage, et ne confond jamais meuble ou lien absent', () => {
    const workspace = twoRooms()
    const result = findWorkspaceStation(workspace, 'desk-support')!
    expect(result.station).toBe(workspace.rooms[1]!.plan.workstations[0])
    expect(result.room).toBe(workspace.rooms[1])
    expect(result.floor).toBe(workspace.floors[1])
    expect(findWorkspaceStation(workspace, 'furniture-support')).toBeUndefined()
    expect(findWorkspaceStation(workspace, 'desk-missing')).toBeUndefined()
    expect(findWorkspaceStation(workspace, null)).toBeUndefined()
    expect(findWorkspaceStation(workspace, undefined)).toBeUndefined()
  })

  it('supprime une salle en une étape annulable et retrouve ses mêmes objets pour les localisations', () => {
    const initial = createWorkspaceHistory(twoRooms())
    const deleted = deleteRoom(initial.present, 'room-support')
    expect(deleted.rooms).toHaveLength(1)
    expect(deleted.floors).toBe(initial.present.floors)
    expect(findWorkspaceStation(deleted, 'desk-support')).toBeUndefined()
    expect(deleted.rooms[0]).toBe(initial.present.rooms[0])
    const history = pushWorkspaceChange(initial, deleted)
    expect(history.past).toHaveLength(1)
    const restored = undoWorkspace(history)
    expect(findWorkspaceStation(restored.present, 'desk-support')!.station).toEqual(
      initial.present.rooms[1]!.plan.workstations[0],
    )
    expect(redoWorkspace(restored).present).toEqual(deleted)
    expect(() => deleteRoom(deleted, 'plateau-a')).toThrow(/au moins une salle/)
    expect(() => deleteRoom(deleted, 'room-support')).toThrow(/salle/)
  })
})

describe('remplacement d’une salle avec des identifiants globaux', () => {
  it('conserve les IDs de la salle cible et les IDs libres, puis renouvelle seulement les conflits avec les autres salles', () => {
    const workspace = twoRooms(),
      source = structuredClone(workspace),
      candidate = structuredClone(defaultPlan),
      factory = idFactory()
    candidate.id = 'room-imported'
    candidate.workstations[1]!.id = 'desk-support'
    candidate.workstations[2]!.id = 'desk-unallocated'
    candidate.furniture[1]!.id = 'furniture-support'
    const prepared = prepareRoomReplacement(workspace, 'plateau-a', candidate, factory)
    expect(prepared.id).toBe('plateau-a')
    expect(prepared.workstations[0]!.id).toBe(candidate.workstations[0]!.id)
    expect(prepared.workstations[1]!.id).toBe('desk-new-1')
    expect(prepared.workstations[2]!.id).toBe('desk-unallocated')
    expect(prepared.furniture[0]!.id).toBe(candidate.furniture[0]!.id)
    expect(prepared.furniture[1]!.id).toBe('furniture-new-2')
    expect(factory.mock.calls).toEqual([['desk'], ['furniture']])
    expect(workspace).toEqual(source)
    expect(candidate.workstations[1]!.id).toBe('desk-support')
    expect(
      parseWorkspace(
        JSON.stringify({ ...workspace, rooms: [{ floorId: 'floor-01', plan: prepared }, workspace.rooms[1]] }),
      ),
    ).toBeDefined()
  })

  it('préserve le nom et l’identité de la salle cible lors d’un remplacement identique, sans générer d’ID', () => {
    const workspace = twoRooms(),
      factory = idFactory()
    const candidate = workspace.rooms[1]!.plan
    const prepared = prepareRoomReplacement(workspace, 'room-support', candidate, factory)
    expect(prepared).toEqual(candidate)
    expect(factory).not.toHaveBeenCalled()
    expect(prepared).not.toBe(candidate)
  })

  it('ne remappe jamais un conflit vers un identifiant réservé par un autre objet importé', () => {
    const workspace = twoRooms(),
      candidate = structuredClone(defaultPlan),
      source = structuredClone(workspace)
    candidate.workstations[0]!.id = 'desk-support'
    candidate.workstations[1]!.id = 'desk-reserved'
    expect(() => prepareRoomReplacement(workspace, 'plateau-a', candidate, () => 'desk-reserved')).toThrow(
      /identifiant/,
    )
    expect(() => prepareRoomReplacement(workspace, 'plateau-a', candidate, () => 'desk-04')).toThrow(/identifiant/)
    expect(workspace).toEqual(source)
  })

  it('refuse une salle absente, une géométrie invalide ou des doublons internes sans changement partiel', () => {
    const workspace = twoRooms(),
      source = structuredClone(workspace),
      candidate = structuredClone(defaultPlan),
      factory = idFactory()
    expect(() => prepareRoomReplacement(workspace, 'room-missing', candidate, factory)).toThrow(/salle/)
    candidate.workstations[0]!.position[0] = 100
    expect(() => prepareRoomReplacement(workspace, 'plateau-a', candidate, factory)).toThrow(/plan/)
    candidate.workstations[0]!.position[0] = defaultPlan.workstations[0]!.position[0]
    candidate.workstations[1]!.id = candidate.workstations[0]!.id
    expect(() => prepareRoomReplacement(workspace, 'plateau-a', candidate, factory)).toThrow(/plan/)
    expect(factory).not.toHaveBeenCalled()
    expect(workspace).toEqual(source)
  })
})
