/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { legacyStorageKeys, readStoredValue, storageKeys } from './browser-storage'
import { defaultPlan, loadPlan } from '@/features/spatial/plan-document'
import { createWorkspaceFromPlan, loadWorkspace, saveWorkspace } from '@/features/spatial/workspace-document'
import { loadLocations, saveLocations } from '@/features/spatial/local-locations'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value)
    }),
  }
  return { storage, values }
}

function savedWorkspace() {
  const workspace = createWorkspaceFromPlan()
  workspace.name = 'Bureaux de Lyon'
  workspace.floors.push({ id: 'floor-support', name: 'Support' })
  workspace.rooms[0]!.plan.colors.floor = '#123456'
  workspace.rooms[0]!.plan.workstations[0]!.label = 'Poste accueil'
  return workspace
}

describe('continuité des sauvegardes après le changement de nom', () => {
  it('récupère un espace historique complet sans réécrire sa sauvegarde', () => {
    const workspace = savedWorkspace()
    const raw = JSON.stringify(workspace)
    const { storage, values } = memoryStorage({ [legacyStorageKeys.workspace]: raw })
    expect(loadWorkspace(storage)).toMatchObject({ workspace, persisted: true, canPersist: true, warning: null })
    expect(values.get(legacyStorageKeys.workspace)).toBe(raw)
    expect(values.has(storageKeys.workspace)).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('enregistre sous la nouvelle identité et conserve les octets historiques', () => {
    const workspace = savedWorkspace()
    const raw = '  ' + JSON.stringify(workspace)
    const { storage, values } = memoryStorage({ [legacyStorageKeys.workspace]: raw })
    const next = { ...loadWorkspace(storage).workspace, name: 'Siège de Lyon' }
    expect(saveWorkspace(storage, next)).toMatchObject({ persisted: true, warning: null })
    expect(loadWorkspace(storage).workspace).toEqual(next)
    expect(values.get(legacyStorageKeys.workspace)).toBe(raw)
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([storageKeys.workspace])
  })

  it('donne priorité au nouvel espace et ignore une ancienne sauvegarde corrompue', () => {
    const workspace = savedWorkspace()
    const { storage } = memoryStorage({
      [storageKeys.workspace]: JSON.stringify(workspace),
      [legacyStorageKeys.workspace]: '{broken',
    })
    expect(loadWorkspace(storage).workspace).toEqual(workspace)
    expect(storage.getItem.mock.calls.map(([key]) => key)).toEqual([storageKeys.workspace])
  })

  it('préserve un espace actuel corrompu au lieu de restaurer silencieusement un ancien état', () => {
    const raw = JSON.stringify(savedWorkspace())
    const { storage, values } = memoryStorage({
      [storageKeys.workspace]: '{broken',
      [legacyStorageKeys.workspace]: raw,
    })
    expect(loadWorkspace(storage)).toMatchObject({ canPersist: false, persisted: false, warning: expect.any(String) })
    expect(saveWorkspace(storage, savedWorkspace()).persisted).toBe(false)
    expect(values.get(storageKeys.workspace)).toBe('{broken')
    expect(values.get(legacyStorageKeys.workspace)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('préserve également une ancienne sauvegarde invalide sans créer un nouvel état vide', () => {
    const { storage, values } = memoryStorage({ [legacyStorageKeys.workspace]: '{broken' })
    expect(loadWorkspace(storage)).toMatchObject({ canPersist: false, warning: expect.any(String) })
    expect(saveWorkspace(storage, savedWorkspace()).persisted).toBe(false)
    expect(values.has(storageKeys.workspace)).toBe(false)
    expect(values.get(legacyStorageKeys.workspace)).toBe('{broken')
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('récupère un ancien plateau et ses identifiants quand aucun espace ne le remplace', () => {
    const plan = { ...structuredClone(defaultPlan), name: 'Salle historique' }
    const raw = JSON.stringify(plan)
    const { storage, values } = memoryStorage({ [legacyStorageKeys.plan]: raw })
    expect(loadPlan(storage).plan).toEqual(plan)
    expect(loadWorkspace(storage).workspace.rooms[0]!.plan).toEqual(plan)
    expect(values.get(legacyStorageKeys.plan)).toBe(raw)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('conserve les associations par assetId puis écrit seulement leur nouvelle clé', () => {
    const raw = JSON.stringify({ version: 1, planId: 'plateau-a', associations: { 42: 'desk-01', 999: 'desk-absent' } })
    const { storage, values } = memoryStorage({ [legacyStorageKeys.locations]: raw })
    expect(loadLocations(storage).locations).toEqual({ 42: 'desk-01', 999: 'desk-absent' })
    expect(saveLocations(storage, { 42: 'desk-02', 999: 'desk-absent' }).persisted).toBe(true)
    expect(loadLocations(storage).locations).toEqual({ 42: 'desk-02', 999: 'desk-absent' })
    expect(values.get(legacyStorageKeys.locations)).toBe(raw)
    expect(storage.setItem.mock.calls.map(([key]) => key)).toEqual([storageKeys.locations])
  })

  it('respecte des localisations actuelles vides au lieu de rétablir les anciens liens', () => {
    const { storage } = memoryStorage({
      [storageKeys.locations]: JSON.stringify({ version: 1, planId: 'plateau-a', associations: {} }),
      [legacyStorageKeys.locations]: JSON.stringify({
        version: 1,
        planId: 'plateau-a',
        associations: { 42: 'desk-01' },
      }),
    })
    expect(loadLocations(storage).locations).toEqual({})
  })

  it('signale un refus de lecture de la sauvegarde historique et empêche toute écriture', () => {
    const { storage } = memoryStorage()
    storage.getItem.mockImplementation((key) => {
      if (key === legacyStorageKeys.workspace) throw new Error('SecurityError')
      return null
    })
    expect(loadWorkspace(storage)).toMatchObject({ canPersist: false, warning: expect.any(String) })
    expect(saveWorkspace(storage, savedWorkspace()).persisted).toBe(false)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('conserve la sauvegarde historique quand le quota empêche le nouvel enregistrement', () => {
    const raw = JSON.stringify(savedWorkspace())
    const { storage, values } = memoryStorage({ [legacyStorageKeys.workspace]: raw })
    storage.setItem.mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(saveWorkspace(storage, savedWorkspace())).toMatchObject({ persisted: false, warning: expect.any(String) })
    expect(values.get(legacyStorageKeys.workspace)).toBe(raw)
    expect(values.has(storageKeys.workspace)).toBe(false)
    expect(loadWorkspace(storage).workspace).toEqual(savedWorkspace())
  })
})

describe('thème au premier affichage', () => {
  const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
  const script = readFileSync(new URL('../../public/theme.js', import.meta.url), 'utf8')

  it('charge le script de thème avant l’application, sans script en ligne interdit par la CSP', () => {
    const head = html.slice(0, html.indexOf('</head>'))
    expect(head).toContain('<script src="/theme.js"></script>')
    expect(html).not.toMatch(/<script>/)
    expect(html.indexOf('/theme.js')).toBeLessThan(html.indexOf('/src/main.tsx'))
  })

  it.each([
    { current: null, legacy: 'dark', systemDark: false, expected: true },
    { current: null, legacy: 'light', systemDark: true, expected: false },
    { current: 'light', legacy: 'dark', systemDark: true, expected: false },
    { current: 'dark', legacy: 'light', systemDark: false, expected: true },
    { current: null, legacy: null, systemDark: true, expected: true },
  ])(
    'applique le thème enregistré avant le rendu : $current / $legacy',
    ({ current, legacy, systemDark, expected }) => {
      const { storage } = memoryStorage({
        ...(current === null ? {} : { [storageKeys.theme]: current }),
        ...(legacy === null ? {} : { [legacyStorageKeys.theme]: legacy }),
      })
      const toggle = vi.fn()
      runInNewContext(script, {
        localStorage: storage,
        matchMedia: () => ({ matches: systemDark }),
        document: { documentElement: { classList: { toggle } } },
      })
      expect(toggle).toHaveBeenCalledWith('dark', expected)
      expect(readStoredValue(storage, 'theme')).toBe(current ?? legacy)
      expect(storage.setItem).not.toHaveBeenCalled()
    },
  )

  it('tolère le stockage inaccessible pendant le premier affichage', () => {
    const toggle = vi.fn()
    expect(() =>
      runInNewContext(script, {
        localStorage: {
          getItem: () => {
            throw new Error('SecurityError')
          },
        },
        document: { documentElement: { classList: { toggle } } },
      }),
    ).not.toThrow()
    expect(toggle).not.toHaveBeenCalled()
  })
})
