import { legacyStorageKeys } from '@/lib/browser-storage'
import { describe, expect, it, vi } from 'vitest'
import { defaultPlan, parsePlan, planStorageKey, type SpatialPlan } from './plan-document'
import {
  createWorkspaceFromPlan,
  createWorkspaceHistory,
  loadWorkspace,
  parseWorkspace,
  pushWorkspaceChange,
  redoWorkspace,
  replaceWorkspaceRoom,
  saveWorkspace,
  undoWorkspace,
  workspaceFileSizeLimit,
  workspaceFloorLimit,
  workspaceHistoryLimit,
  workspaceRoomLimit,
  workspaceStorageKey,
  type WorkspaceDocument,
  type WorkspaceStorage,
} from './workspace-document'

function emptyPlan(id: string): SpatialPlan {
  return parsePlan(JSON.stringify({ ...structuredClone(defaultPlan), id, workstations: [], furniture: [] }))
}

function twoRooms(): WorkspaceDocument {
  const workspace = createWorkspaceFromPlan()
  workspace.floors.push({ id: 'floor-02', name: 'Étage 2' })
  workspace.rooms.push({ floorId: 'floor-02', plan: emptyPlan('room-support') })
  return workspace
}

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, raw: string) => {
      values.set(key, raw)
    }),
  } satisfies WorkspaceStorage
  return { storage, values, raw: (key: string) => values.get(key) ?? null }
}

describe('document d’espace de travail', () => {
  it('initialise un espace indépendant sans écriture même lors de lectures répétées', () => {
    const { storage } = memoryStorage()
    const first = loadWorkspace(storage)
    const second = loadWorkspace(storage)
    expect(first).toMatchObject({ warning: null, persisted: true, canPersist: true })
    expect(first.workspace.floors).toEqual([{ id: 'floor-01', name: 'Étage 1' }])
    expect(first.workspace.rooms[0]!.plan).toEqual(defaultPlan)
    expect(first.workspace).toEqual(second.workspace)
    expect(first.workspace.rooms[0]!.plan).not.toBe(second.workspace.rooms[0]!.plan)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('enveloppe l’ancien plateau sans perdre ses objets, préférences, IDs ou localisations', () => {
    const plan = structuredClone(defaultPlan)
    plan.name = 'Support'
    plan.workstations[0]!.label = 'Accueil'
    plan.colors.floor = '#123456'
    plan.display.walls = false
    const oldRaw = JSON.stringify(plan)
    const locations = JSON.stringify({ version: 1, planId: 'plateau-a', associations: { 42: 'desk-01' } })
    const { storage, raw } = memoryStorage({ [planStorageKey]: oldRaw, [legacyStorageKeys.locations]: locations })
    const loaded = loadWorkspace(storage)
    expect(loaded.workspace.rooms[0]!.plan).toEqual(plan)
    expect(loaded).toMatchObject({ warning: null, persisted: true, canPersist: true })
    expect(raw(planStorageKey)).toBe(oldRaw)
    expect(raw(legacyStorageKeys.locations)).toBe(locations)
    expect(raw(workspaceStorageKey)).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(storage.getItem.mock.calls.map(([key]) => key)).toEqual([
      workspaceStorageKey,
      legacyStorageKeys.workspace,
      planStorageKey,
    ])
  })

  it('migre aussi un plateau antérieur au mobilier et aux options d’affichage', () => {
    const { furniture: _furniture, display: _display, ...legacy } = structuredClone(defaultPlan)
    const oldRaw = JSON.stringify(legacy)
    const { storage, raw } = memoryStorage({ [planStorageKey]: oldRaw })
    const loaded = loadWorkspace(storage)
    expect(loaded.workspace.rooms[0]!.plan.workstations).toEqual(legacy.workstations)
    expect(loaded.workspace.rooms[0]!.plan.furniture).toEqual(defaultPlan.furniture)
    expect(loaded.workspace.rooms[0]!.plan.display).toEqual(defaultPlan.display)
    expect(raw(planStorageKey)).toBe(oldRaw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('donne priorité au nouvel espace valide et ne relit pas l’ancien plateau', () => {
    const workspace = twoRooms()
    workspace.name = 'Équipe support'
    const { storage } = memoryStorage({
      [workspaceStorageKey]: JSON.stringify(workspace),
      [planStorageKey]: '{old-broken',
    })
    expect(loadWorkspace(storage).workspace).toEqual(workspace)
    expect(storage.getItem.mock.calls.map(([key]) => key)).toEqual([workspaceStorageKey])
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it.each(['{broken', JSON.stringify({ ...createWorkspaceFromPlan(), version: 2 })])(
    'préserve un nouvel espace incompatible sans revenir silencieusement à l’ancien',
    (broken) => {
      const old = { ...structuredClone(defaultPlan), name: 'Ancien plateau sauvegardé' }
      const { storage, raw } = memoryStorage({ [workspaceStorageKey]: broken, [planStorageKey]: JSON.stringify(old) })
      const loaded = loadWorkspace(storage)
      expect(loaded).toMatchObject({ warning: expect.any(String), persisted: false, canPersist: false })
      expect(loaded.workspace.rooms[0]!.plan.name).toBe(defaultPlan.name)
      expect(saveWorkspace(storage, twoRooms())).toMatchObject({ persisted: false, canPersist: false })
      expect(raw(workspaceStorageKey)).toBe(broken)
      expect(raw(planStorageKey)).toBe(JSON.stringify(old))
      expect(storage.getItem.mock.calls.every(([key]) => key === workspaceStorageKey)).toBe(true)
      expect(storage.setItem).not.toHaveBeenCalled()
    },
  )

  it('garde un ancien plateau corrompu intact et limite la migration à la session', () => {
    const { storage, raw } = memoryStorage({ [planStorageKey]: '{broken' })
    expect(loadWorkspace(storage)).toMatchObject({ persisted: false, canPersist: false, warning: expect.any(String) })
    expect(saveWorkspace(storage, createWorkspaceFromPlan()).persisted).toBe(false)
    expect(raw(planStorageKey)).toBe('{broken')
    expect(raw(workspaceStorageKey)).toBeNull()
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('enregistre uniquement la nouvelle clé et préserve l’ancien plateau et ses liens', () => {
    const old = JSON.stringify(defaultPlan)
    const locations = '{"version":1,"planId":"plateau-a","associations":{"42":"desk-01"}}'
    const { storage, raw } = memoryStorage({ [planStorageKey]: old, [legacyStorageKeys.locations]: locations })
    const workspace = twoRooms()
    expect(saveWorkspace(storage, workspace)).toEqual({ warning: null, persisted: true, canPersist: true })
    expect(loadWorkspace(storage).workspace).toEqual(workspace)
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([workspaceStorageKey])
    expect(raw(planStorageKey)).toBe(old)
    expect(raw(legacyStorageKeys.locations)).toBe(locations)
  })

  it.each([
    [
      'version inconnue',
      (workspace: WorkspaceDocument) => {
        Object.assign(workspace, { version: 2 })
      },
    ],
    [
      'mauvais namespace',
      (workspace: WorkspaceDocument) => {
        Object.assign(workspace, { id: 'workspace-other' })
      },
    ],
    [
      'nom vide',
      (workspace: WorkspaceDocument) => {
        workspace.name = '  '
      },
    ],
    [
      'nom trop long',
      (workspace: WorkspaceDocument) => {
        workspace.name = 'a'.repeat(61)
      },
    ],
    [
      'aucun étage',
      (workspace: WorkspaceDocument) => {
        workspace.floors = []
      },
    ],
    [
      'aucune salle',
      (workspace: WorkspaceDocument) => {
        workspace.rooms = []
      },
    ],
    [
      'étage inexistant',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[0]!.floorId = 'floor-absent'
      },
    ],
    [
      'identifiant d’étage invalide',
      (workspace: WorkspaceDocument) => {
        workspace.floors[0]!.id = '__proto__'
      },
    ],
    [
      'étage dupliqué',
      (workspace: WorkspaceDocument) => {
        workspace.floors[1]!.id = workspace.floors[0]!.id
      },
    ],
    [
      'salle dupliquée',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.id = workspace.rooms[0]!.plan.id
      },
    ],
    [
      'poste présent dans deux salles',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.workstations = [structuredClone(workspace.rooms[0]!.plan.workstations[0]!)]
      },
    ],
    [
      'meuble présent dans deux salles',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.furniture = [structuredClone(workspace.rooms[0]!.plan.furniture[0]!)]
      },
    ],
    [
      'plan de salle invalide',
      (workspace: WorkspaceDocument) => {
        workspace.rooms[1]!.plan.width = Number.NaN
      },
    ],
    [
      'inventaire dans le document',
      (workspace: WorkspaceDocument) => {
        Object.assign(workspace, { assets: [] })
      },
    ],
    [
      'localisations dans une salle',
      (workspace: WorkspaceDocument) => {
        Object.assign(workspace.rooms[1]!, { associations: {} })
      },
    ],
  ])('refuse un document incohérent : %s', (_label, mutate) => {
    const workspace = twoRooms()
    mutate(workspace)
    expect(() => parseWorkspace(JSON.stringify(workspace))).toThrow()
  })

  it('accepte huit étages et trente-deux salles puis refuse les dépassements', () => {
    const workspace = createWorkspaceFromPlan()
    workspace.floors = Array.from({ length: workspaceFloorLimit }, (_, index) => ({
      id: `floor-test-${index}`,
      name: `Étage ${index + 1}`,
    }))
    workspace.rooms = Array.from({ length: workspaceRoomLimit }, (_, index) => ({
      floorId: workspace.floors[index % workspaceFloorLimit]!.id,
      plan: emptyPlan(`room-test-${index}`),
    }))
    expect(parseWorkspace(JSON.stringify(workspace))).toEqual(workspace)
    expect(() =>
      parseWorkspace(
        JSON.stringify({
          ...workspace,
          floors: [...workspace.floors, { id: 'floor-extra', name: 'Étage supplémentaire' }],
        }),
      ),
    ).toThrow()
    expect(() =>
      parseWorkspace(
        JSON.stringify({
          ...workspace,
          rooms: [...workspace.rooms, { floorId: workspace.floors[0]!.id, plan: emptyPlan('room-extra') }],
        }),
      ),
    ).toThrow()
  })

  it('applique la limite de deux millions d’octets en UTF-8', () => {
    const workspace = createWorkspaceFromPlan()
    workspace.name = 'Équipe Montréal 🪴'
    const raw = JSON.stringify(workspace)
    const bytes = new TextEncoder().encode(raw).byteLength
    expect(bytes).toBeGreaterThan(raw.length)
    const atLimit = ' '.repeat(workspaceFileSizeLimit - bytes) + raw
    expect(parseWorkspace(atLimit)).toEqual(workspace)
    expect(() => parseWorkspace(' ' + atLimit)).toThrow('trop volumineux')
    expect(() => parseWorkspace('null')).toThrow()
  })

  it('refuse un remplacement de salle ambigu ou invalide et préserve les autres références', () => {
    const workspace = twoRooms()
    const first = workspace.rooms[0]!
    const second = workspace.rooms[1]!
    const changed = replaceWorkspaceRoom(workspace, first.plan.id, { ...first.plan, name: 'Nouveau nom' })
    expect(changed.rooms[1]).toBe(second)
    expect(changed.rooms[0]!.plan.name).toBe('Nouveau nom')
    expect(first.plan.name).toBe(defaultPlan.name)
    expect(replaceWorkspaceRoom(workspace, first.plan.id, first.plan)).toBe(workspace)
    expect(() => replaceWorkspaceRoom(workspace, first.plan.id, second.plan)).toThrow(RangeError)
    expect(() => replaceWorkspaceRoom(workspace, 'room-absent', emptyPlan('room-absent'))).toThrow(RangeError)
    const conflicting = { ...second.plan, workstations: [structuredClone(first.plan.workstations[0]!)] }
    expect(() => replaceWorkspaceRoom(workspace, second.plan.id, conflicting)).toThrow()
    expect(workspace.rooms[1]).toBe(second)
  })

  it('signale un refus de stockage sans écrire', () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error('SecurityError')
      }),
      setItem: vi.fn(),
    } satisfies WorkspaceStorage
    expect(loadWorkspace(storage)).toMatchObject({ persisted: false, canPersist: false })
    expect(saveWorkspace(storage, createWorkspaceFromPlan())).toMatchObject({ persisted: false, canPersist: false })
    expect(loadWorkspace(null)).toMatchObject({ persisted: false, canPersist: false })
    expect(saveWorkspace(null, createWorkspaceFromPlan()).persisted).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('conserve l’édition en mémoire et permet de réessayer après un quota', () => {
    const old = JSON.stringify(defaultPlan)
    const { storage, raw } = memoryStorage({ [planStorageKey]: old })
    const history = createWorkspaceHistory(loadWorkspace(storage).workspace)
    const changed = pushWorkspaceChange(history, { ...history.present, name: 'Équipe support' })
    storage.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveWorkspace(storage, changed.present)).toMatchObject({
      persisted: false,
      canPersist: true,
      warning: expect.any(String),
    })
    expect(changed.present.name).toBe('Équipe support')
    expect(changed.past).toHaveLength(1)
    expect(raw(workspaceStorageKey)).toBeNull()
    expect(raw(planStorageKey)).toBe(old)
    expect(saveWorkspace(storage, changed.present).persisted).toBe(true)
    expect(loadWorkspace(storage).workspace.name).toBe('Équipe support')
  })

  it('détecte une corruption apparue avant la sauvegarde et ne l’écrase pas', () => {
    const { storage, values, raw } = memoryStorage({ [workspaceStorageKey]: JSON.stringify(twoRooms()) })
    const loaded = loadWorkspace(storage)
    values.set(workspaceStorageKey, '{changed-externally')
    expect(saveWorkspace(storage, loaded.workspace).canPersist).toBe(false)
    expect(raw(workspaceStorageKey)).toBe('{changed-externally')
    expect(storage.setItem).not.toHaveBeenCalled()
    expect(loaded.workspace.rooms).toHaveLength(2)
  })
})

describe('historique de l’espace de travail', () => {
  it('capture une édition sans muter la source et réutilise les salles inchangées', () => {
    const source = twoRooms()
    const initial = createWorkspaceHistory(source)
    const second = initial.present.rooms[1]!
    const candidate = replaceWorkspaceRoom(initial.present, initial.present.rooms[0]!.plan.id, {
      ...initial.present.rooms[0]!.plan,
      name: 'Salle support',
    })
    const changed = pushWorkspaceChange(initial, candidate)
    candidate.rooms[0]!.plan.colors.floor = '#123456'
    expect(changed.present.rooms[0]!.plan.name).toBe('Salle support')
    expect(changed.present.rooms[0]!.plan.colors.floor).toBe(defaultPlan.colors.floor)
    expect(changed.present.rooms[1]).toBe(second)
    expect(source.rooms[0]!.plan.name).toBe(defaultPlan.name)
    expect(undoWorkspace(changed).present).toBe(initial.present)
    expect(redoWorkspace(undoWorkspace(changed)).present).toBe(changed.present)
  })

  it('conserve la salle et ses objets lorsqu’elle change d’étage', () => {
    const initial = createWorkspaceHistory(twoRooms())
    const first = initial.present.rooms[0]!
    const moved = pushWorkspaceChange(initial, {
      ...initial.present,
      rooms: initial.present.rooms.map((room) =>
        room.plan.id === first.plan.id ? { ...room, floorId: 'floor-02' } : room,
      ),
    })
    expect(moved.present.rooms[0]!.floorId).toBe('floor-02')
    expect(moved.present.rooms[0]!.plan).toBe(first.plan)
    expect(undoWorkspace(moved).present.rooms[0]!.floorId).toBe('floor-01')
  })

  it('déplace un poste entre salles comme une action atomique en gardant son identifiant', () => {
    const initial = createWorkspaceHistory(twoRooms())
    const [source, destination] = initial.present.rooms as [
      (typeof initial.present.rooms)[number],
      (typeof initial.present.rooms)[number],
    ]
    const station = source.plan.workstations[0]!
    const links = { 42: station.id }
    const moved = pushWorkspaceChange(initial, {
      ...initial.present,
      rooms: [
        {
          ...source,
          plan: { ...source.plan, workstations: source.plan.workstations.filter((item) => item.id !== station.id) },
        },
        { ...destination, plan: { ...destination.plan, workstations: [station] } },
      ],
    })
    const locate = (workspace: WorkspaceDocument) =>
      workspace.rooms.find((room) => room.plan.workstations.some((item) => item.id === links[42]))?.plan.id
    expect(moved.past).toHaveLength(1)
    expect(locate(moved.present)).toBe(destination.plan.id)
    expect(locate(undoWorkspace(moved).present)).toBe(source.plan.id)
    expect(locate(redoWorkspace(undoWorkspace(moved)).present)).toBe(destination.plan.id)
    expect(links).toEqual({ 42: station.id })
  })

  it('restaure les identifiants après suppression d’une salle sans modifier ses liens', () => {
    const initial = createWorkspaceHistory(twoRooms())
    const removed = initial.present.rooms[0]!
    const deleted = pushWorkspaceChange(initial, { ...initial.present, rooms: initial.present.rooms.slice(1) })
    expect(deleted.present.rooms.some((room) => room.plan.id === removed.plan.id)).toBe(false)
    expect(undoWorkspace(deleted).present.rooms[0]!.plan.workstations).toEqual(removed.plan.workstations)
    expect(undoWorkspace(deleted).present.rooms[0]!.plan.furniture).toEqual(removed.plan.furniture)
  })

  it('préserve le rétablissement après une action identique ou invalide puis l’efface après une nouvelle édition', () => {
    const first = createWorkspaceHistory(twoRooms())
    const changed = pushWorkspaceChange(first, { ...first.present, name: 'Version B' })
    const undone = undoWorkspace(changed)
    expect(pushWorkspaceChange(undone, { ...undone.present, name: ' Espace de travail ' })).toBe(undone)
    expect(() => pushWorkspaceChange(undone, { ...undone.present, floors: [] })).toThrow()
    expect(redoWorkspace(undone).present.name).toBe('Version B')
    const branched = pushWorkspaceChange(undone, { ...undone.present, name: 'Version C' })
    expect(branched.future).toEqual([])
    expect(redoWorkspace(branched)).toBe(branched)
  })

  it('limite les annulations et rétablissements à cinquante étapes', () => {
    let history = createWorkspaceHistory(createWorkspaceFromPlan())
    expect(undoWorkspace(history)).toBe(history)
    expect(redoWorkspace(history)).toBe(history)
    for (let index = 1; index <= 60; index++)
      history = pushWorkspaceChange(history, { ...history.present, name: `Version ${index}` })
    expect(history.past).toHaveLength(workspaceHistoryLimit)
    for (let index = 0; index < workspaceHistoryLimit; index++) history = undoWorkspace(history)
    expect(history.present.name).toBe('Version 10')
    expect(history.future).toHaveLength(workspaceHistoryLimit)
    expect(undoWorkspace(history)).toBe(history)
    for (let index = 0; index < workspaceHistoryLimit; index++) history = redoWorkspace(history)
    expect(history.present.name).toBe('Version 60')
    expect(redoWorkspace(history)).toBe(history)
  })
})
