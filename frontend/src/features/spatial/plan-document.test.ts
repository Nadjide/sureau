import { describe, expect, it, vi } from 'vitest'
import {
  defaultPlan,
  loadPlan,
  parsePlan,
  planFileSizeLimit,
  planStorageKey,
  savePlan,
  type PlanStorage,
  type SpatialPlan,
} from './plan-document'
import { findWorkstation } from './room-model'
import { clampWorkstation } from './plan-geometry'
import { initialFurniture } from './furniture-catalog'

function freshPlan(): SpatialPlan {
  return structuredClone(defaultPlan)
}

function memoryStorage(initial: string | null = null) {
  let raw = initial
  const storage = {
    getItem: vi.fn((_key: string) => raw),
    setItem: vi.fn((_key: string, value: string) => { raw = value }),
  } satisfies PlanStorage
  return { storage, raw: () => raw }
}

describe('document de plateau', () => {
  it('conserve les huit identifiants existants sans écrire pendant l’initialisation', () => {
    const { storage } = memoryStorage()
    const first = loadPlan(storage)
    const second = loadPlan(storage)
    expect(first).toMatchObject({ warning: null, persisted: true, canPersist: true })
    expect(first.plan.workstations.map((station) => station.id)).toEqual([
      'desk-01', 'desk-02', 'desk-03', 'desk-04', 'desk-05', 'desk-06', 'desk-07', 'desk-08',
    ])
    expect(first.plan.workstations.every((station) => station.width === 2 && station.depth === 1 && station.color === null)).toBe(true)
    expect(first.plan).toEqual(second.plan)
    expect(first.plan).not.toBe(second.plan)
    expect(first.plan.workstations[0]).not.toBe(second.plan.workstations[0])
    expect(first.plan.display).toEqual({ walls: true, decor: true })
    expect(first.plan.display).not.toBe(second.plan.display)
    expect(first.plan.furniture).toHaveLength(4)
    expect(first.plan.furniture).not.toBe(second.plan.furniture)
    expect(first.plan.furniture[0]!.position).not.toBe(second.plan.furniture[0]!.position)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('enregistre et relit dimensions, couleurs, nom et postes personnalisés sans perdre leurs identifiants', () => {
    const { storage, raw } = memoryStorage()
    const plan = freshPlan()
    plan.name = 'Accueil'
    plan.width = 16
    plan.colors.floor = '#3a4B5c'
    plan.display = { walls: false, decor: false }
    plan.workstations = [{
      id: 'desk-88df3bd9-6782-49c2-a939-0678967bb8a7', label: 'Support',
      position: [2, 0, -1], rotation: Math.PI / 2,
      width: 1.6, depth: 0.8, color: '#887766',
    }]
    expect(savePlan(storage, plan)).toEqual({ warning: null, persisted: true, canPersist: true })
    expect(storage.setItem).toHaveBeenCalledWith(planStorageKey, expect.any(String))
    expect(parsePlan(raw() ?? '')).toEqual(plan)
    expect(findWorkstation(plan.workstations[0]!.id, loadPlan(storage).plan.workstations)?.label).toBe('Support')
  })

  it('permet un plateau vide et sépare les modifications du document source', () => {
    const plan = freshPlan()
    plan.workstations = []
    const parsed = parsePlan(JSON.stringify(plan))
    parsed.name = 'Autre nom'
    expect(plan.name).toBe('Plateau A')
    expect(parsed.workstations).toEqual([])
    expect(defaultPlan.workstations).toHaveLength(8)
  })

  it('charge les anciens plans sans préférences d’affichage et sans réécriture automatique', () => {
    const { display: _display, ...legacyPlan } = freshPlan()
    const raw = JSON.stringify(legacyPlan)
    const { storage, raw: storedRaw } = memoryStorage(raw)
    const loaded = loadPlan(storage)
    expect(loaded).toMatchObject({ persisted: true, canPersist: true, warning: null })
    expect(loaded.plan.display).toEqual({ walls: true, decor: true })
    expect(loaded.plan.workstations).toEqual(legacyPlan.workstations)
    expect(storedRaw()).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
    loaded.plan.display.walls = false
    expect(parsePlan(raw).display).toEqual({ walls: true, decor: true })
    expect(defaultPlan.display).toEqual({ walls: true, decor: true })
  })

  it('convertit le décor historique en mobilier sans modifier les identifiants ni écrire au chargement', () => {
    const { furniture: _furniture, ...legacy } = freshPlan()
    const raw = JSON.stringify(legacy)
    const { storage, raw: currentRaw } = memoryStorage(raw)
    const loaded = loadPlan(storage)
    expect(loaded).toMatchObject({ persisted: true, canPersist: true, warning: null })
    expect(loaded.plan.furniture).toEqual(initialFurniture(13, 9))
    expect(loaded.plan.workstations).toEqual(legacy.workstations)
    expect(currentRaw()).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('repositionne le seul décor historique proportionnellement à une ancienne pièce réduite', () => {
    const { furniture: _furniture, ...legacy } = freshPlan()
    legacy.width = 6
    legacy.depth = 6
    legacy.workstations = []
    legacy.display.decor = false
    const loaded = parsePlan(JSON.stringify(legacy))
    expect(loaded.furniture).toEqual(initialFurniture(6, 6))
    expect(loaded.display.decor).toBe(false)
    expect(loaded.furniture).toHaveLength(4)
  })

  it('respecte un mobilier explicitement vide et ne recrée pas le décor après sauvegarde', () => {
    const { storage } = memoryStorage()
    const empty = { ...freshPlan(), furniture: [] }
    expect(parsePlan(JSON.stringify(empty)).furniture).toEqual([])
    expect(savePlan(storage, empty).persisted).toBe(true)
    expect(loadPlan(storage).plan.furniture).toEqual([])
  })

  it.each([
    ['type inconnu', (plan: SpatialPlan) => { Object.assign(plan.furniture[0]!, { kind: 'unknown' }) }],
    ['identifiant dupliqué', (plan: SpatialPlan) => { plan.furniture[1]!.id = plan.furniture[0]!.id }],
    ['préfixe de poste', (plan: SpatialPlan) => { plan.furniture[0]!.id = 'desk-01' }],
    ['label vide', (plan: SpatialPlan) => { plan.furniture[0]!.label = '' }],
    ['largeur trop petite', (plan: SpatialPlan) => { plan.furniture[0]!.width = 0.19 }],
    ['largeur trop grande', (plan: SpatialPlan) => { plan.furniture[0]!.width = 6.01 }],
    ['profondeur trop petite', (plan: SpatialPlan) => { plan.furniture[0]!.depth = 0.07 }],
    ['profondeur trop grande', (plan: SpatialPlan) => { plan.furniture[0]!.depth = 4.01 }],
    ['hauteur trop petite', (plan: SpatialPlan) => { plan.furniture[0]!.height = 0.14 }],
    ['hauteur trop grande', (plan: SpatialPlan) => { plan.furniture[0]!.height = 3.51 }],
    ['altitude non nulle', (plan: SpatialPlan) => { plan.furniture[0]!.position[1] = 1 }],
    ['position infinie', (plan: SpatialPlan) => { plan.furniture[0]!.position[0] = Infinity }],
    ['rotation hors intervalle', (plan: SpatialPlan) => { plan.furniture[0]!.rotation = Math.PI * 3 }],
    ['couleur nulle', (plan: SpatialPlan) => { Object.assign(plan.furniture[0]!, { color: null }) }],
    ['objet hors plateau', (plan: SpatialPlan) => { plan.furniture[0]!.position[0] = 100 }],
    ['propriété d’inventaire', (plan: SpatialPlan) => { Object.assign(plan.furniture[0]!, { assetId: 42 }) }],
    ['trop de meubles', (plan: SpatialPlan) => {
      plan.furniture = Array.from({ length: 65 }, (_, index) => ({ ...plan.furniture[0]!, id: `furniture-extra-${index}`, position: [0, 0, 0] }))
    }],
  ])('refuse un meuble invalide : %s', (_label, mutate) => {
    const candidate = freshPlan()
    mutate(candidate)
    expect(() => parsePlan(JSON.stringify(candidate))).toThrow()
  })

  it.each([
    { walls: 'false', decor: true },
    { walls: true, decor: 0 },
    { walls: true },
    { decor: false },
    { walls: false, decor: true, extra: true },
    null,
    [],
  ])('refuse des préférences d’affichage invalides : %j', (display) => {
    expect(() => parsePlan(JSON.stringify({ ...freshPlan(), display }))).toThrow()
  })

  it.each([
    ['version inconnue', (plan: SpatialPlan) => { Object.assign(plan, { version: 2 }) }],
    ['autre plateau', (plan: SpatialPlan) => { Object.assign(plan, { id: 'plateau-b' }) }],
    ['nom vide', (plan: SpatialPlan) => { plan.name = '  ' }],
    ['nom trop long', (plan: SpatialPlan) => { plan.name = 'a'.repeat(61) }],
    ['plateau trop étroit', (plan: SpatialPlan) => { plan.width = 5.9 }],
    ['plateau trop grand', (plan: SpatialPlan) => { plan.depth = 50.1 }],
    ['identifiants dupliqués', (plan: SpatialPlan) => { plan.workstations[1]!.id = plan.workstations[0]!.id }],
    ['identifiant dangereux', (plan: SpatialPlan) => { plan.workstations[0]!.id = '__proto__' }],
    ['label vide', (plan: SpatialPlan) => { plan.workstations[0]!.label = '' }],
    ['bureau trop petit', (plan: SpatialPlan) => { plan.workstations[0]!.width = 0.7 }],
    ['bureau trop profond', (plan: SpatialPlan) => { plan.workstations[0]!.depth = 1.6 }],
    ['altitude non nulle', (plan: SpatialPlan) => { plan.workstations[0]!.position[1] = 1 }],
    ['coordonnée infinie', (plan: SpatialPlan) => { plan.workstations[0]!.position[0] = Infinity }],
    ['rotation négative', (plan: SpatialPlan) => { plan.workstations[0]!.rotation = -0.1 }],
    ['rotation hors intervalle', (plan: SpatialPlan) => { plan.workstations[0]!.rotation = Math.PI * 2 + 0.1 }],
    ['couleur du poste incorrecte', (plan: SpatialPlan) => { plan.workstations[0]!.color = 'red' }],
    ['couleur du sol incorrecte', (plan: SpatialPlan) => { plan.colors.floor = 'url(https://example.test)' }],
    ['bureau hors plateau', (plan: SpatialPlan) => { plan.workstations[0]!.position[0] = -6 }],
    ['trop de postes', (plan: SpatialPlan) => {
      plan.workstations = Array.from({ length: 65 }, (_, index) => ({
        ...plan.workstations[0]!, id: `desk-extra-${index}`, position: [0, 0, 0],
      }))
    }],
  ])('refuse un document invalide : %s', (_label, change) => {
    const plan = freshPlan()
    change(plan)
    expect(() => parsePlan(JSON.stringify(plan))).toThrow()
  })

  it('valide les limites du poste et du fauteuil en tenant compte de leur rotation', () => {
    const plan = freshPlan()
    const station = { ...plan.workstations[0]!, position: [5.4, 0, 0] as [number, number, number], rotation: 0 }
    plan.workstations = [station]
    expect(() => parsePlan(JSON.stringify(plan))).not.toThrow()
    station.rotation = Math.PI / 2
    expect(() => parsePlan(JSON.stringify(plan))).toThrow()
  })

  it.each([
    { rotation: 0, position: [0, 0, 3.2] as [number, number, number], axis: 2, direction: 1 },
    { rotation: Math.PI / 2, position: [5.2, 0, 0] as [number, number, number], axis: 0, direction: 1 },
    { rotation: Math.PI, position: [0, 0, -3.2] as [number, number, number], axis: 2, direction: -1 },
    { rotation: Math.PI * 1.5, position: [-5.2, 0, 0] as [number, number, number], axis: 0, direction: -1 },
  ] as const)('accepte le fauteuil au bord et refuse son dépassement : rotation $rotation', ({ rotation, position, axis, direction }) => {
    const plan = freshPlan()
    const station = { ...plan.workstations[0]!, rotation, position: [...position] as [number, number, number] }
    plan.workstations = [station]
    expect(parsePlan(JSON.stringify(plan)).workstations[0]!.position).toEqual(position)
    station.position[axis] += direction * 1e-5
    const raw = JSON.stringify(plan)
    expect(() => parsePlan(raw)).toThrow()
    const { storage, raw: storedRaw } = memoryStorage(raw)
    expect(loadPlan(storage)).toMatchObject({ persisted: false, canPersist: false })
    expect(storedRaw()).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('accepte les postes bornés par les outils, y compris aux angles obliques, sans les déplacer', () => {
    const plan = freshPlan()
    for (const rotation of [0, Math.PI / 4, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      for (const x of [-100, 100]) {
        for (const z of [-100, 100]) {
          const station = clampWorkstation(plan, { ...plan.workstations[0]!, position: [x, 0, z], width: 3, depth: 1.5, rotation })
          expect(parsePlan(JSON.stringify({ ...plan, workstations: [station] })).workstations).toEqual([station])
        }
      }
    }
  })

  it('applique la limite exacte en octets UTF-8, accents compris', () => {
    const plan = freshPlan()
    plan.name = 'Équipe — Montréal 🪴'
    const raw = JSON.stringify(plan)
    const byteLength = new TextEncoder().encode(raw).byteLength
    expect(byteLength).toBeGreaterThan(raw.length)
    const atLimit = ' '.repeat(planFileSizeLimit - byteLength) + raw
    expect(new TextEncoder().encode(atLimit).byteLength).toBe(planFileSizeLimit)
    expect(parsePlan(atLimit)).toEqual(plan)
    expect(() => parsePlan(' ' + atLimit)).toThrow('trop volumineux')
  })

  it('refuse une charge trop volumineuse et les données inattendues', () => {
    expect(() => parsePlan(' '.repeat(256_001))).toThrow()
    expect(() => parsePlan('{broken')).toThrow()
    expect(() => parsePlan('null')).toThrow()
    expect(() => parsePlan(JSON.stringify({ ...freshPlan(), assets: [] }))).toThrow()
  })

  it.each(['{broken', JSON.stringify({ ...defaultPlan, version: 2 })])(
    'préserve un contenu incompatible sans le remplacer', (raw) => {
      const { storage, raw: currentRaw } = memoryStorage(raw)
      expect(loadPlan(storage)).toMatchObject({ plan: defaultPlan, persisted: false, canPersist: false })
      expect(loadPlan(storage).warning).toBeTruthy()
      expect(savePlan(storage, freshPlan())).toMatchObject({ persisted: false, canPersist: false })
      expect(currentRaw()).toBe(raw)
      expect(storage.setItem).not.toHaveBeenCalled()
    },
  )

  it('ne remplace jamais un plan valide par une modification invalide', () => {
    const raw = JSON.stringify(defaultPlan)
    const { storage, raw: currentRaw } = memoryStorage(raw)
    const candidate = freshPlan()
    candidate.width = Number.NaN
    expect(savePlan(storage, candidate)).toMatchObject({ persisted: false })
    expect(currentRaw()).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('signale un refus de lecture sans tenter de réécrire', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('SecurityError') }),
      setItem: vi.fn(),
    } satisfies PlanStorage
    expect(loadPlan(storage)).toMatchObject({ persisted: false, canPersist: false })
    expect(savePlan(storage, freshPlan())).toMatchObject({ persisted: false, canPersist: false })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('signale un quota tout en laissant le nouveau plan utilisable et la prochaine sauvegarde possible', () => {
    const raw = JSON.stringify(defaultPlan)
    const { storage, raw: currentRaw } = memoryStorage(raw)
    const plan = freshPlan()
    plan.name = 'Nouveau plateau'
    storage.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError') })
    const result = savePlan(storage, plan)
    expect(result).toMatchObject({ persisted: false, canPersist: true })
    expect(result.warning).toBeTruthy()
    expect(plan.name).toBe('Nouveau plateau')
    expect(currentRaw()).toBe(raw)
    expect(savePlan(storage, plan).persisted).toBe(true)
    expect(loadPlan(storage).plan.name).toBe('Nouveau plateau')
  })

  it('reste explicite si le navigateur ne fournit aucun stockage', () => {
    expect(loadPlan(null)).toMatchObject({ persisted: false, canPersist: false })
    expect(loadPlan(null).warning).toBeTruthy()
    expect(savePlan(null, freshPlan())).toMatchObject({ persisted: false, canPersist: false })
  })
})
