import { describe, expect, it, vi } from 'vitest'
import { defaultPlan, parsePlan } from './plan-document'
import {
  createSpatialHistory, parseSpatialDraft, pushSpatialChange, redoSpatial, sameSpatialDraft,
  spatialHistoryLimit, spatialLocationLimit, undoSpatial, type SpatialDraft,
} from './shared-workspace-model'
import { createWorkspaceFromPlan } from './workspace-document'

function draft(): SpatialDraft {
  const workspace = createWorkspaceFromPlan()
  workspace.floors.push({ id: 'floor-02', name: 'Étage 2' })
  workspace.rooms.push({
    floorId: 'floor-02',
    plan: parsePlan(JSON.stringify({ ...defaultPlan, id: 'room-support', workstations: [], furniture: [] })),
  })
  return { workspace, locations: { 42: 'desk-01', 83: 'desk-disparu' } }
}

function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys)
  if (typeof value !== 'object' || value === null) return value
  return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseKeys(entry)]))
}

describe('brouillon spatial partagé', () => {
  it('détache les deux documents et canonise les noms sans perdre les associations orphelines', () => {
    const source = draft()
    source.workspace.name = '  Montréal 🪴  '
    const parsed = parseSpatialDraft(source)
    expect(parsed.workspace.name).toBe('Montréal 🪴')
    expect(parsed.locations).toEqual({ 42: 'desk-01', 83: 'desk-disparu' })
    source.workspace.rooms[0]!.plan.workstations[0]!.label = 'Autre poste'
    Object.assign(source.locations, { 42: 'desk-modifie' })
    expect(parsed.workspace.rooms[0]!.plan.workstations[0]!.label).toBe(defaultPlan.workstations[0]!.label)
    expect(parsed.locations[42]).toBe('desk-01')
    expect(Object.isFrozen(parsed.locations)).toBe(true)
  })

  it('accepte une table sans prototype et conserve les identifiants sûrs jusqu’à MAX_SAFE_INTEGER', () => {
    const locations: unknown = Object.assign(Object.create(null), {
      '9007199254740991': 'desk-max', '4294967297': 'desk-grand', '1': 'desk-01',
    })
    const parsed = parseSpatialDraft({ workspace: draft().workspace, locations })
    expect(Object.keys(parsed.locations)).toEqual(['1', '4294967297', '9007199254740991'])
    expect(parsed.locations[Number.MAX_SAFE_INTEGER]).toBe('desk-max')
    expect(JSON.stringify(parsed.locations)).toBe('{"1":"desk-01","4294967297":"desk-grand","9007199254740991":"desk-max"}')
  })

  it.each(['0', '-0', '-1', '01', '1.0', '1e2', '+1', ' 1', '1 ', 'NaN', 'Infinity', '9007199254740992', '__proto__']) (
    'refuse la clé de matériel non canonique %s', (key) => {
      const locations = Object.fromEntries([[key, 'desk-01']])
      expect(() => parseSpatialDraft({ ...draft(), locations })).toThrow()
    },
  )

  it.each([null, [], new Date(), new Map([[1, 'desk-01']]), Object.create({ 1: 'desk-01' })])(
    'refuse une table de localisations incompatible : %s', (locations) => {
      expect(() => parseSpatialDraft({ ...draft(), locations })).toThrow()
    },
  )

  it.each([null, 42, '', 'desk-1', 'DESK-01', 'desk-01 ', 'room-01', `desk-${'a'.repeat(81)}`])(
    'refuse une localisation invalide sans la retirer silencieusement : %s', (station) => {
      expect(() => parseSpatialDraft({ ...draft(), locations: { 42: station } })).toThrow()
    },
  )

  it('refuse les propriétés invisibles ou calculées sans exécuter de getter', () => {
    const getter = vi.fn(() => 'desk-01')
    const accessor = Object.defineProperty({}, '42', { enumerable: true, get: getter })
    const hidden = Object.defineProperty({}, '42', { enumerable: false, value: 'desk-01' })
    const symbol = { [Symbol('asset')]: 'desk-01' }
    for (const locations of [accessor, hidden, symbol]) {
      expect(() => parseSpatialDraft({ ...draft(), locations })).toThrow()
    }
    expect(getter).not.toHaveBeenCalled()
  })

  it('accepte 20 000 liens et refuse le dépassement sans tronquer le document', () => {
    const locations = Object.fromEntries(Array.from({ length: spatialLocationLimit }, (_, index) => [index + 1, 'desk-absent']))
    expect(Object.keys(parseSpatialDraft({ ...draft(), locations }).locations)).toHaveLength(spatialLocationLimit)
    expect(() => parseSpatialDraft({ ...draft(), locations: { ...locations, [spatialLocationLimit + 1]: 'desk-01' } }))
      .toThrow('20 000')
    expect(Object.keys(locations)).toHaveLength(spatialLocationLimit)
  })

  it.each([null, [], '{}', {}, { workspace: draft().workspace }, { ...draft(), revision: 1 }])(
    'refuse une enveloppe incomplète ou contenant des données étrangères', (value) => {
      expect(() => parseSpatialDraft(value)).toThrow()
    },
  )

  it('réutilise la validation géométrique et les migrations explicites des anciens plans', () => {
    const source = draft()
    const plan = source.workspace.rooms[0]!.plan
    const { display: _display, furniture: _furniture, ...legacy } = plan
    const legacyWorkspace = { ...source.workspace, rooms: [{ floorId: 'floor-01', plan: legacy }] }
    const parsed = parseSpatialDraft({ ...source, workspace: legacyWorkspace })
    expect(parsed.workspace.rooms[0]!.plan.display).toEqual(defaultPlan.display)
    expect(parsed.workspace.rooms[0]!.plan.furniture).toEqual(defaultPlan.furniture)
    expect(() => parseSpatialDraft({ ...source, workspace: { ...source.workspace, floors: [] } })).toThrow()
    plan.workstations[0]!.position = [100, 0, 100]
    expect(() => parseSpatialDraft(source)).toThrow()
  })

  it.each(['\u0000', '\ud800', '\udfff', 'avant\ud800après', '\ud800\ud800']) (
    'refuse les caractères incompatibles avec PostgreSQL dans chaque nom : %j', (invalid) => {
      const changes = [
        (value: SpatialDraft) => { value.workspace.name = `Nom${invalid}` },
        (value: SpatialDraft) => { value.workspace.floors[0]!.name = `Étage${invalid}` },
        (value: SpatialDraft) => { value.workspace.rooms[0]!.plan.name = `Salle${invalid}` },
        (value: SpatialDraft) => { value.workspace.rooms[0]!.plan.workstations[0]!.label = `Poste${invalid}` },
        (value: SpatialDraft) => { value.workspace.rooms[0]!.plan.furniture[0]!.label = `Meuble${invalid}` },
      ]
      for (const change of changes) {
        const source = draft()
        change(source)
        expect(() => parseSpatialDraft(source)).toThrow('caractère incompatible')
      }
    },
  )

  it('compare les valeurs indépendamment de l’ordre des clés JSONB mais conserve l’ordre des salles', () => {
    const initial = draft()
    const reordered = reverseKeys(initial) as SpatialDraft
    expect(sameSpatialDraft(initial, reordered)).toBe(true)
    expect(JSON.stringify(parseSpatialDraft(initial))).toBe(JSON.stringify(parseSpatialDraft(reordered)))
    expect(sameSpatialDraft(initial, { ...initial, locations: { ...initial.locations, 42: 'desk-02' } })).toBe(false)
    expect(sameSpatialDraft(initial, { ...initial, workspace: { ...initial.workspace, rooms: [...initial.workspace.rooms].reverse() } })).toBe(false)
  })
})

describe('historique spatial atomique', () => {
  it('annule et rétablit ensemble un changement de salle et ses associations', () => {
    const source = draft()
    const initial = createSpatialHistory(source)
    const changed = pushSpatialChange(initial, {
      workspace: { ...initial.present.workspace, rooms: initial.present.workspace.rooms.slice(1) },
      locations: { 42: 'desk-autre', 83: 'desk-disparu' },
    })
    expect(changed.past).toHaveLength(1)
    expect(changed.present.workspace.rooms).toHaveLength(1)
    expect(changed.present.locations[42]).toBe('desk-autre')
    const undone = undoSpatial(changed)
    expect(undone.present).toBe(initial.present)
    expect(undone.present.workspace.rooms[0]!.plan.workstations[0]!.id).toBe('desk-01')
    expect(undone.present.locations[42]).toBe('desk-01')
    expect(redoSpatial(undone).present).toBe(changed.present)
    expect(source.workspace.rooms).toHaveLength(2)
  })

  it('préserve un lien orphelin lors d’une suppression et le récupère lors de l’annulation', () => {
    const initial = createSpatialHistory(draft())
    const changed = pushSpatialChange(initial, {
      ...initial.present,
      workspace: { ...initial.present.workspace, rooms: initial.present.workspace.rooms.slice(1) },
    })
    expect(changed.present.locations).toBe(initial.present.locations)
    expect(changed.present.locations[42]).toBe('desk-01')
    expect(changed.present.workspace.rooms.some((room) => room.plan.workstations.some((station) => station.id === 'desk-01'))).toBe(false)
    expect(undoSpatial(changed).present.workspace.rooms[0]!.plan.workstations.some((station) => station.id === 'desk-01')).toBe(true)
  })

  it('garde la scène entière lors d’une simple association et les plans inchangés lors d’un renommage', () => {
    const initial = createSpatialHistory(draft())
    const associated = pushSpatialChange(initial, { ...initial.present, locations: { ...initial.present.locations, 91: 'desk-03' } })
    expect(associated.present.workspace).toBe(initial.present.workspace)
    const renamed = pushSpatialChange(associated, {
      ...associated.present, workspace: { ...associated.present.workspace, name: 'Agence Sureau' },
    })
    expect(renamed.present.locations).toBe(associated.present.locations)
    expect(renamed.present.workspace.floors[0]).toBe(initial.present.workspace.floors[0])
    expect(renamed.present.workspace.rooms[0]).toBe(initial.present.workspace.rooms[0])
    expect(renamed.present.workspace.rooms[1]!.plan).toBe(initial.present.workspace.rooms[1]!.plan)
  })

  it('partage une salle déplacée d’étage et conserve la référence de son plan', () => {
    const initial = createSpatialHistory(draft())
    const original = initial.present.workspace.rooms[0]!
    const changed = pushSpatialChange(initial, {
      ...initial.present,
      workspace: {
        ...initial.present.workspace,
        rooms: initial.present.workspace.rooms.map((room) => room === original ? { ...room, floorId: 'floor-02' } : room),
      },
    })
    expect(changed.present.workspace.rooms[0]!.floorId).toBe('floor-02')
    expect(changed.present.workspace.rooms[0]!.plan).toBe(original.plan)
    expect(changed.present.workspace.rooms[1]).toBe(initial.present.workspace.rooms[1])
  })

  it('détache la salle modifiée du candidat tout en partageant les autres plans', () => {
    const initial = createSpatialHistory(draft())
    const candidate = structuredClone(initial.present)
    candidate.workspace.rooms[0]!.plan.name = 'Accueil'
    const changed = pushSpatialChange(initial, candidate)
    candidate.workspace.rooms[0]!.plan.colors.floor = '#123456'
    expect(changed.present.workspace.rooms[0]!.plan.name).toBe('Accueil')
    expect(changed.present.workspace.rooms[0]!.plan.colors.floor).toBe(defaultPlan.colors.floor)
    expect(changed.present.workspace.rooms[1]).toBe(initial.present.workspace.rooms[1])
    expect(changed.present.locations).toBe(initial.present.locations)
  })

  it('préserve le rétablissement après une action identique ou invalide puis l’efface après une édition', () => {
    const initial = createSpatialHistory(draft())
    const changed = pushSpatialChange(initial, { ...initial.present, locations: { 42: 'desk-02' } })
    const undone = undoSpatial(changed)
    const equivalent = reverseKeys(undone.present) as SpatialDraft
    expect(pushSpatialChange(undone, equivalent)).toBe(undone)
    expect(() => pushSpatialChange(undone, { ...undone.present, locations: { 42: 'invalide' } })).toThrow()
    expect(redoSpatial(undone).present).toBe(changed.present)
    const branched = pushSpatialChange(undone, { ...undone.present, locations: {} })
    expect(branched.future).toEqual([])
    expect(redoSpatial(branched)).toBe(branched)
  })

  it('limite à cinquante étapes les changements de géométrie comme les associations', () => {
    let history = createSpatialHistory(draft())
    expect(undoSpatial(history)).toBe(history)
    expect(redoSpatial(history)).toBe(history)
    for (let index = 1; index <= 60; index++) {
      history = pushSpatialChange(history, {
        workspace: { ...history.present.workspace, name: `Version ${index}` },
        locations: { [index]: `desk-${index.toString().padStart(2, '0')}` },
      })
    }
    expect(history.past).toHaveLength(spatialHistoryLimit)
    for (let index = 0; index < spatialHistoryLimit; index++) history = undoSpatial(history)
    expect(history.present.workspace.name).toBe('Version 10')
    expect(history.present.locations).toEqual({ 10: 'desk-10' })
    expect(history.future).toHaveLength(spatialHistoryLimit)
    expect(undoSpatial(history)).toBe(history)
    for (let index = 0; index < spatialHistoryLimit; index++) history = redoSpatial(history)
    expect(history.present.workspace.name).toBe('Version 60')
    expect(history.present.locations).toEqual({ 60: 'desk-60' })
    expect(redoSpatial(history)).toBe(history)
  })
})
