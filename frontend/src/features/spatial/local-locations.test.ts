import { describe, expect, it, vi } from 'vitest'
import {
  decodeLocations,
  getWorkstationAssetIds,
  loadLocations,
  locationStorageKey,
  saveLocations,
  updateLocation,
  type LocalLocations,
  type LocationStorage,
} from './local-locations'

function snapshot(associations: unknown, version = 1, planId = 'plateau-a'): string {
  return JSON.stringify({ version, planId, associations })
}

function memoryStorage(initial: string | null = null) {
  let raw = initial
  const storage = {
    getItem: vi.fn((_key: string) => raw),
    setItem: vi.fn((_key: string, value: string) => { raw = value }),
  } satisfies LocationStorage

  return { storage, raw: () => raw }
}

describe('local locations', () => {
  it('conserve les postes personnalisés et les liens vers un poste absent du plan', () => {
    const id = 'desk-1c135801-8050-49a5-a207-1310b4e408c4'
    const loaded = decodeLocations(snapshot({ 42: id, 84: 'desk-99' }))
    expect(loaded.canPersist).toBe(true)
    expect(loaded.locations).toEqual({ 42: id, 84: 'desk-99' })
    expect(updateLocation(loaded.locations, 42, 'desk-02')).toEqual({ 42: 'desk-02', 84: 'desk-99' })
  })
  it('lit un état initial vide sans écrire pendant l’initialisation, même répétée', () => {
    const { storage } = memoryStorage()

    expect(loadLocations(storage)).toMatchObject({ locations: {}, warning: null, persisted: true })
    expect(loadLocations(storage)).toMatchObject({ locations: {}, warning: null, persisted: true })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('enregistre et relit les associations versionnées du seul plan attendu', () => {
    const { storage, raw } = memoryStorage()
    const locations = updateLocation(updateLocation({}, 42, 'desk-01'), 84, 'desk-01')

    expect(saveLocations(storage, locations)).toEqual({ warning: null, persisted: true, canPersist: true })
    expect(storage.setItem).toHaveBeenCalledWith(locationStorageKey, expect.any(String))
    expect(JSON.parse(raw() ?? '')).toEqual({
      version: 1,
      planId: 'plateau-a',
      associations: { 42: 'desk-01', 84: 'desk-01' },
    })
    expect(loadLocations(storage).locations).toEqual(locations)
    expect(getWorkstationAssetIds(loadLocations(storage).locations, 'desk-01')).toEqual([42, 84])
  })

  it.each([
    { label: 'JSON corrompu', raw: '{broken' },
    { label: 'version inconnue', raw: snapshot({}, 2) },
    { label: 'autre plan', raw: snapshot({}, 1, 'plateau-b') },
    { label: 'identifiant de poste invalide', raw: snapshot({ 42: 'invalid' }) },
    { label: 'identifiant nul', raw: snapshot({ 0: 'desk-01' }) },
    { label: 'identifiant négatif', raw: snapshot({ '-1': 'desk-01' }) },
    { label: 'identifiant non sûr', raw: snapshot({ '9007199254740992': 'desk-01' }) },
    { label: 'zéros initiaux', raw: snapshot({ '042': 'desk-01' }) },
    { label: 'notation exponentielle', raw: snapshot({ '1e3': 'desk-01' }) },
    { label: 'tableau à la place du dictionnaire', raw: snapshot(['desk-01']) },
    { label: 'clé de prototype', raw: '{"version":1,"planId":"plateau-a","associations":{"__proto__":"desk-01"}}' },
    { label: 'clé de constructeur', raw: '{"version":1,"planId":"plateau-a","associations":{"constructor":"desk-01"}}' },
  ])('conserve le contenu initial invalide : $label', ({ raw }) => {
    const { storage, raw: storedRaw } = memoryStorage(raw)

    expect(loadLocations(storage)).toMatchObject({ locations: {}, persisted: false, canPersist: false })
    expect(loadLocations(storage).warning).toBeTruthy()
    expect(saveLocations(storage, { 42: 'desk-02' })).toMatchObject({ persisted: false, canPersist: false })
    expect(storedRaw()).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('accepte la borne sûre maximale et conserve l’identité numérique des matériels', () => {
    const locations = decodeLocations(snapshot({ '9007199254740991': 'desk-08' })).locations

    expect(getWorkstationAssetIds(locations, 'desk-08')).toEqual([Number.MAX_SAFE_INTEGER])
  })

  it('déplace et retire seulement le matériel demandé, sans muter l’état précédent', () => {
    const original: LocalLocations = Object.freeze({ 42: 'desk-01', 84: 'desk-01' })

    const moved = updateLocation(original, 42, 'desk-03')
    const removed = updateLocation(moved, 42, null)

    expect(original).toEqual({ 42: 'desk-01', 84: 'desk-01' })
    expect(moved).toEqual({ 42: 'desk-03', 84: 'desk-01' })
    expect(removed).toEqual({ 84: 'desk-01' })
    expect(getWorkstationAssetIds(moved, 'desk-01')).toEqual([84])
    expect(getWorkstationAssetIds(moved, 'desk-03')).toEqual([42])
  })

  it('conserve les associations de matériels absents de la réponse d’inventaire', () => {
    const { storage } = memoryStorage(snapshot({ 42: 'desk-01', 999: 'desk-02' }))
    const loaded = loadLocations(storage)
    const updated = updateLocation(loaded.locations, 42, 'desk-03')

    saveLocations(storage, updated)

    expect(loadLocations(storage).locations).toEqual({ 42: 'desk-03', 999: 'desk-02' })
    expect(getWorkstationAssetIds(loadLocations(storage).locations, 'desk-02')).toEqual([999])
  })

  it('ne dépend pas de l’ordre de l’inventaire pour retrouver le bureau et ses matériels', () => {
    const locations = decodeLocations(snapshot({ 84: 'desk-03', 42: 'desk-03', 7: 'desk-02' })).locations
    const inventory = [{ id: 84 }, { id: 7 }, { id: 42 }]
    const reversed = [...inventory].reverse()

    expect(locations[42]).toBe('desk-03')
    expect(getWorkstationAssetIds(locations, 'desk-03')).toEqual([42, 84])
    expect(reversed.filter((asset) => locations[asset.id] === 'desk-03').map((asset) => asset.id).sort((a, b) => a - b)).toEqual([42, 84])
  })

  it('refuse une mutation avec un identifiant ou un poste invalide', () => {
    const original: LocalLocations = Object.freeze({ 42: 'desk-01' })

    expect(() => updateLocation(original, Number.MAX_SAFE_INTEGER + 1, 'desk-02')).toThrow(RangeError)
    expect(() => updateLocation(original, -1, null)).toThrow(RangeError)
    expect(() => updateLocation(original, 42, 'invalid')).toThrow(RangeError)
    expect(original).toEqual({ 42: 'desk-01' })
  })

  it('signale le refus de lecture et ne tente pas d’écraser un contenu inaccessible', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('SecurityError') }),
      setItem: vi.fn(),
    } satisfies LocationStorage

    expect(loadLocations(storage)).toMatchObject({ locations: {}, persisted: false, canPersist: false })
    expect(saveLocations(storage, { 42: 'desk-01' })).toMatchObject({ persisted: false, canPersist: false })
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('garde les modifications en mémoire et signale un quota ou un refus d’écriture', () => {
    const storage = {
      getItem: vi.fn((_key: string) => snapshot({ 42: 'desk-01' })),
      setItem: vi.fn(() => { throw new Error('QuotaExceededError') }),
    } satisfies LocationStorage
    const locations = updateLocation(loadLocations(storage).locations, 42, 'desk-04')

    const saved = saveLocations(storage, locations)

    expect(locations).toEqual({ 42: 'desk-04' })
    expect(saved).toMatchObject({ persisted: false, canPersist: true })
    expect(saved.warning).toBeTruthy()
    expect(storage.getItem(locationStorageKey)).toBe(snapshot({ 42: 'desk-01' }))
  })

  it('reste explicite lorsque le navigateur ne fournit aucun stockage', () => {
    expect(loadLocations(null)).toMatchObject({ locations: {}, persisted: false, canPersist: false })
    expect(saveLocations(null, { 42: 'desk-01' })).toMatchObject({ persisted: false, canPersist: false })
    expect(saveLocations(null, {}).warning).toBeTruthy()
  })

  it('n’écrit jamais dans l’API et ne modifie aucun état métier lors d’une localisation', () => {
    const fetcher = vi.spyOn(globalThis, 'fetch')
    const asset = Object.freeze({ id: 42, status: 'AVAILABLE' })
    const { storage } = memoryStorage()

    try {
      const associated = updateLocation({}, asset.id, 'desk-01')
      const moved = updateLocation(associated, asset.id, 'desk-03')
      saveLocations(storage, updateLocation(moved, asset.id, null))

      expect(asset.status).toBe('AVAILABLE')
      expect(fetcher).not.toHaveBeenCalled()
    } finally {
      fetcher.mockRestore()
    }
  })
})
