import { describe, expect, it } from 'vitest'
import { defaultPlan } from './plan-document'
import {
  applySpatialTransfer,
  createInitialSpatialDraft,
  parseSpatialTransfer,
  serializeSpatialDraft,
  spatialTransferFileSizeLimit,
} from './shared-workspace-transfer'

describe('préparation explicite d’un espace partagé', () => {
  it('prépare une salle vide valide avec un étage et aucune association', () => {
    const draft = createInitialSpatialDraft('empty')
    expect(draft.workspace.floors).toHaveLength(1)
    expect(draft.workspace.rooms).toHaveLength(1)
    expect(draft.workspace.rooms[0]!.floorId).toBe(draft.workspace.floors[0]!.id)
    expect(draft.workspace.rooms[0]!.plan.workstations).toEqual([])
    expect(draft.workspace.rooms[0]!.plan.furniture).toEqual([])
    expect(draft.locations).toEqual({})
  })

  it('prépare l’exemple illustratif sans matériel ni lien inventé et détache les créations suivantes', () => {
    const first = createInitialSpatialDraft('example')
    expect(first.workspace.rooms[0]!.plan).toEqual(defaultPlan)
    expect(first.locations).toEqual({})
    first.workspace.rooms[0]!.plan.workstations[0]!.label = 'Poste modifié'
    first.workspace.rooms[0]!.plan.colors.floor = '#000000'
    expect(createInitialSpatialDraft('example').workspace.rooms[0]!.plan).toEqual(defaultPlan)
    expect(createInitialSpatialDraft('empty').workspace.rooms[0]!.plan.colors).toEqual(defaultPlan.colors)
  })
})

describe('restauration explicite des copies spatiales', () => {
  function fixture() {
    const draft = createInitialSpatialDraft('example')
    draft.workspace.name = 'Entreprise Montréal 🪴'
    draft.workspace.floors.push({ id: 'floor-support', name: 'Support' })
    draft.workspace.rooms.push({
      floorId: 'floor-support',
      plan: {
        ...createInitialSpatialDraft('empty').workspace.rooms[0]!.plan,
        id: 'room-support',
        name: 'Salle support',
      },
    })
    return { ...draft, locations: { 42: 'desk-01', 950: 'desk-disparu' } }
  }

  it('retrouve les étages, salles, mobilier, couleurs et liens orphelins sans inclure comptes ou inventaire', () => {
    const source = fixture()
    const parsed = parseSpatialTransfer(serializeSpatialDraft(source))
    expect(parsed).toEqual({ draft: source, hasLocations: true, kind: 'snapshot' })
    source.workspace.rooms[0]!.plan.name = 'Modification après lecture'
    expect(parsed.draft.workspace.rooms[0]!.plan.name).toBe(defaultPlan.name)
    expect(Object.keys(JSON.parse(serializeSpatialDraft(parsed.draft)) as object)).toEqual([
      'format',
      'version',
      'workspace',
      'locations',
    ])
  })

  it('importe un ancien espace sans inventer de localisations et garde ses migrations explicites', () => {
    const legacy = fixture().workspace
    Reflect.deleteProperty(legacy.rooms[0]!.plan, 'display')
    Reflect.deleteProperty(legacy.rooms[0]!.plan, 'furniture')
    const parsed = parseSpatialTransfer(JSON.stringify(legacy))
    expect(parsed.kind).toBe('workspace')
    expect(parsed.hasLocations).toBe(false)
    expect(parsed.draft.locations).toEqual({})
    expect(parsed.draft.workspace.rooms[0]!.plan.display).toEqual(defaultPlan.display)
    expect(parsed.draft.workspace.rooms[0]!.plan.furniture).toEqual(defaultPlan.furniture)
  })

  it.each(['display', 'furniture'])(
    'refuse une copie Sureau tronquée sans %s au lieu de fabriquer un contenu',
    (field) => {
      const payload = JSON.parse(serializeSpatialDraft(fixture())) as {
        workspace: ReturnType<typeof fixture>['workspace']
      }
      Reflect.deleteProperty(payload.workspace.rooms[0]!.plan, field)
      expect(() => parseSpatialTransfer(JSON.stringify(payload))).toThrow()
    },
  )

  it.each([
    { format: 'autre-format', version: 1 },
    { format: 'sureau-spatial', version: 2 },
    { format: 'sureau-spatial', version: '1' },
    { format: 'sureau-spatial', version: 1, revision: 12 },
  ])('refuse le format, la version ou les métadonnées incompatibles %j', (properties) => {
    const payload = JSON.parse(serializeSpatialDraft(fixture())) as Record<string, unknown>
    expect(() => parseSpatialTransfer(JSON.stringify({ ...payload, ...properties }))).toThrow()
  })

  it.each(['workspace', 'locations', 'version'])(
    'ne transforme pas un snapshot incomplet sans %s en ancien espace',
    (field) => {
      const payload = JSON.parse(serializeSpatialDraft(fixture())) as Record<string, unknown>
      delete payload[field]
      expect(() => parseSpatialTransfer(JSON.stringify(payload))).toThrow()
    },
  )

  it.each(['{', 'null', '[]', '42', '"un texte"', '<html>Sureau</html>'])(
    'refuse le fichier incompatible %s',
    (raw) => {
      expect(() => parseSpatialTransfer(raw)).toThrow()
    },
  )

  it('valide les localisations et la géométrie avant de proposer la restauration', () => {
    const invalidLink = { ...fixture(), locations: { '0042': 'desk-01' } }
    expect(() =>
      parseSpatialTransfer(JSON.stringify({ format: 'sureau-spatial', version: 1, ...invalidLink })),
    ).toThrow()
    const invalidGeometry = fixture()
    invalidGeometry.workspace.rooms[0]!.plan.workstations[0]!.position = [1000, 0, 1000]
    expect(() =>
      parseSpatialTransfer(JSON.stringify({ format: 'sureau-spatial', version: 1, ...invalidGeometry })),
    ).toThrow()
  })

  it('mesure la taille UTF-8 et accepte exactement la limite sans tronquer', () => {
    const raw = serializeSpatialDraft(createInitialSpatialDraft('empty'))
    const padded = raw + ' '.repeat(spatialTransferFileSizeLimit - new TextEncoder().encode(raw).byteLength)
    expect(parseSpatialTransfer(padded).draft).toEqual(createInitialSpatialDraft('empty'))
    expect(() => parseSpatialTransfer(padded + ' ')).toThrow('8 Mo')
    expect(() => parseSpatialTransfer('桜'.repeat(2_700_000))).toThrow('8 Mo')
  })

  it('permet un aller-retour dense de vingt mille liens, y compris les grands identifiants', () => {
    const locations = Object.fromEntries(
      Array.from({ length: 20_000 }, (_, index) => [Number.MAX_SAFE_INTEGER - index, `desk-${'a'.repeat(80)}`]),
    )
    const source = { ...fixture(), locations }
    const raw = serializeSpatialDraft(source)
    expect(new TextEncoder().encode(raw).byteLength).toBeLessThanOrEqual(spatialTransferFileSizeLimit)
    expect(parseSpatialTransfer(raw).draft).toEqual(source)
  })

  it('conserve par défaut tous les liens actuels même absents du fichier ou du nouveau plan', () => {
    const current = { ...fixture(), locations: { 42: 'desk-actuel', 999: 'desk-orphelin' } }
    const imported = fixture()
    imported.workspace.name = 'Un autre espace'
    const incoming = parseSpatialTransfer(serializeSpatialDraft(imported))
    const applied = applySpatialTransfer(current, incoming, false)
    expect(applied.workspace).toEqual(imported.workspace)
    expect(applied.locations).toEqual(current.locations)
    expect(current.workspace.name).toBe('Entreprise Montréal 🪴')
    expect(incoming.draft.locations).toEqual(imported.locations)
  })

  it('restaure ensemble les implantations et leurs liens seulement avec le choix explicite', () => {
    const current = { ...fixture(), locations: { 1: 'desk-actuel' } }
    const imported = fixture()
    imported.workspace.name = 'Version à restaurer'
    const incoming = parseSpatialTransfer(serializeSpatialDraft(imported))
    const applied = applySpatialTransfer(current, incoming, true)
    expect(applied).toEqual(imported)
    incoming.draft.workspace.rooms[0]!.plan.name = 'Modification ultérieure'
    expect(applied.workspace.rooms[0]!.plan.name).toBe(defaultPlan.name)
    expect(current.locations).toEqual({ 1: 'desk-actuel' })
  })

  it('refuse de restaurer des liens depuis un ancien fichier qui n’en contient pas', () => {
    const current = fixture()
    const incoming = parseSpatialTransfer(JSON.stringify(current.workspace))
    expect(() => applySpatialTransfer(current, incoming, true)).toThrow('ne contient aucune localisation')
    expect(applySpatialTransfer(current, incoming, false).locations).toEqual(current.locations)
  })
})

describe('export de secours de l’espace spatial', () => {
  it('inclut les salles et les associations stables et orphelines dans une enveloppe versionnée', () => {
    const draft = { ...createInitialSpatialDraft('example'), locations: { 42: 'desk-01', 950: 'desk-supprime' } }
    const raw = serializeSpatialDraft(draft)
    expect(JSON.parse(raw)).toEqual({ format: 'sureau-spatial', version: 1, ...draft })
    expect(Object.keys(JSON.parse(raw) as object)).toEqual(['format', 'version', 'workspace', 'locations'])
    expect(raw.endsWith('\n')).toBe(true)
  })

  it('refuse un brouillon invalide au lieu de produire une copie de secours trompeuse', () => {
    const draft = createInitialSpatialDraft('empty')
    draft.workspace.rooms = []
    expect(() => serializeSpatialDraft(draft)).toThrow()
  })
})
