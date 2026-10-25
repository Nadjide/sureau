import { afterEach, describe, expect, it, vi } from 'vitest'
import { legacyStorageKeys, storageKeys } from '@/lib/browser-storage'
import { defaultPlan, parsePlan } from './plan-document'
import { createWorkspaceFromPlan } from './workspace-document'
import { inspectLocalWorkspace, serializeLocalRecovery } from './local-workspace-recovery'

const recoveryKeys = [
  storageKeys.workspace, legacyStorageKeys.workspace, storageKeys.plan, legacyStorageKeys.plan,
  storageKeys.locations, legacyStorageKeys.locations,
]

function workspaceRaw(name = 'Ancien atelier'): string {
  const workspace = createWorkspaceFromPlan()
  workspace.name = name
  return JSON.stringify(workspace)
}

function planRaw(name = 'Ancien plateau'): string {
  return JSON.stringify(parsePlan(JSON.stringify({ ...defaultPlan, name })))
}

function locationsRaw(associations: Record<number, string> = { 42: 'desk-01', 950: 'desk-supprime' }): string {
  return JSON.stringify({ version: 1, planId: defaultPlan.id, associations })
}

function storage(values: Record<string, string> = {}) {
  const entries = new Map(Object.entries(values))
  const getItem = vi.fn((key: string) => entries.get(key) ?? null)
  const setItem = vi.fn(() => { throw new Error('Recovery must never write browser storage') })
  const removeItem = vi.fn(() => { throw new Error('Recovery must never delete browser storage') })
  const clear = vi.fn(() => { throw new Error('Recovery must never clear browser storage') })
  const key = vi.fn(() => { throw new Error('Recovery must never enumerate unrelated browser storage') })
  return { entries, getItem, setItem, removeItem, clear, key }
}

afterEach(() => { vi.unstubAllGlobals() })

describe('recherche explicite des anciens plans du navigateur', () => {
  it('signale l’absence de données sans inventer de géométrie ni d’exemple', () => {
    const browserStorage = storage({ [storageKeys.theme]: 'dark', 'unrelated-preference': 'conserver' })
    const result = inspectLocalWorkspace(browserStorage)

    expect(result).toMatchObject({
      phase: 'absent', draft: null, sourceKey: null, hasLocations: false, locationsValid: false,
    })
    expect(result.rawEntries).toEqual({})
    expect(browserStorage.getItem.mock.calls.map(([key]) => key).sort()).toEqual([...recoveryKeys].sort())
    expect(browserStorage.key).not.toHaveBeenCalled()
    expect(browserStorage.setItem).not.toHaveBeenCalled()
    expect(browserStorage.removeItem).not.toHaveBeenCalled()
    expect(browserStorage.clear).not.toHaveBeenCalled()
    expect(browserStorage.entries.get(storageKeys.theme)).toBe('dark')
    expect(browserStorage.entries.get('unrelated-preference')).toBe('conserver')
  })

  it('donne la priorité à l’espace Sureau et aux localisations Sureau tout en conservant les copies anciennes', () => {
    const entries = {
      [storageKeys.workspace]: workspaceRaw('Espace Sureau'),
      [legacyStorageKeys.workspace]: workspaceRaw('Espace Sentinel'),
      [storageKeys.plan]: planRaw('Plan Sureau'),
      [legacyStorageKeys.plan]: planRaw('Plan Sentinel'),
      [storageKeys.locations]: locationsRaw({ 42: 'desk-02' }),
      [legacyStorageKeys.locations]: locationsRaw({ 42: 'desk-03' }),
    }
    const browserStorage = storage(entries)
    const result = inspectLocalWorkspace(browserStorage)

    expect(result).toMatchObject({ phase: 'ready', sourceKey: storageKeys.workspace, hasLocations: true, locationsValid: true })
    expect(result.draft?.workspace.name).toBe('Espace Sureau')
    expect(result.draft?.locations).toEqual({ 42: 'desk-02' })
    expect(result.rawEntries).toEqual(entries)
    expect(Object.fromEntries(browserStorage.entries)).toEqual(entries)
    expect(browserStorage.setItem).not.toHaveBeenCalled()
    expect(browserStorage.removeItem).not.toHaveBeenCalled()
  })

  it('privilégie un véritable ancien espace Sentinel à un plan Sureau isolé', () => {
    const result = inspectLocalWorkspace(storage({
      [legacyStorageKeys.workspace]: workspaceRaw('Espace historique'),
      [storageKeys.plan]: planRaw('Plan plus récent'),
    }))

    expect(result).toMatchObject({ phase: 'ready', sourceKey: legacyStorageKeys.workspace, hasLocations: false, locationsValid: true })
    expect(result.draft?.workspace.name).toBe('Espace historique')
    expect(result.draft?.locations).toEqual({})
  })

  it('récupère les vrais plans Sureau avant les plans Sentinel sans générer de mobilier supplémentaire', () => {
    const raw = JSON.stringify({ ...defaultPlan, name: 'Plan choisi', workstations: [], furniture: [] })
    const result = inspectLocalWorkspace(storage({
      [storageKeys.plan]: raw,
      [legacyStorageKeys.plan]: planRaw('Autre implantation'),
    }))

    expect(result).toMatchObject({ phase: 'ready', sourceKey: storageKeys.plan, hasLocations: false, locationsValid: true })
    expect(result.draft?.workspace.rooms).toHaveLength(1)
    expect(result.draft?.workspace.rooms[0]!.plan.name).toBe('Plan choisi')
    expect(result.draft?.workspace.rooms[0]!.plan.workstations).toEqual([])
    expect(result.draft?.workspace.rooms[0]!.plan.furniture).toEqual([])
    expect(result.draft?.locations).toEqual({})
  })

  it('récupère un plan et ses liens Sentinel, y compris les postes devenus absents', () => {
    const legacyPlan = { ...defaultPlan, name: 'Plan historique' }
    Reflect.deleteProperty(legacyPlan, 'display')
    Reflect.deleteProperty(legacyPlan, 'furniture')
    const entries = {
      'sentinel-plan-v1': JSON.stringify(legacyPlan),
      'sentinel-locations-v1': locationsRaw(),
    }
    const result = inspectLocalWorkspace(storage(entries))

    expect(result).toMatchObject({ phase: 'ready', sourceKey: 'sentinel-plan-v1', hasLocations: true, locationsValid: true })
    expect(result.draft?.workspace.rooms[0]!.plan.name).toBe('Plan historique')
    expect(result.draft?.workspace.rooms[0]!.plan.display).toEqual(defaultPlan.display)
    expect(result.draft?.workspace.rooms[0]!.plan.furniture).toEqual(defaultPlan.furniture)
    expect(result.draft?.locations).toEqual({ 42: 'desk-01', 950: 'desk-supprime' })
    expect(result.rawEntries).toEqual(entries)
  })

  it('associe un espace Sureau aux liens historiques quand la nouvelle clé de localisations n’existe pas', () => {
    const result = inspectLocalWorkspace(storage({
      [storageKeys.workspace]: workspaceRaw(),
      [legacyStorageKeys.locations]: locationsRaw({ 73: 'desk-introuvable' }),
    }))

    expect(result).toMatchObject({ phase: 'ready', hasLocations: true, locationsValid: true })
    expect(result.draft?.locations).toEqual({ 73: 'desk-introuvable' })
  })

  it.each(['', '{json corrompu', 'null'])('ne remplace pas une clé Sureau présente et illisible par une autre géométrie (%j)', (raw) => {
    const entries = {
      [storageKeys.workspace]: raw,
      [legacyStorageKeys.workspace]: workspaceRaw('Copie historique valide'),
      [storageKeys.plan]: planRaw('Plan valide'),
    }
    const result = inspectLocalWorkspace(storage(entries))

    expect(result).toMatchObject({ phase: 'invalid', draft: null, hasLocations: false, locationsValid: false })
    expect(result.warning).toBeTruthy()
    expect(result.rawEntries).toEqual(entries)
  })

  it('ne remplace pas non plus un plan Sureau corrompu par un plan Sentinel valide', () => {
    const entries = { [storageKeys.plan]: 'illisible', [legacyStorageKeys.plan]: planRaw() }
    const result = inspectLocalWorkspace(storage(entries))

    expect(result.phase).toBe('invalid')
    expect(result.draft).toBeNull()
    expect(result.rawEntries).toEqual(entries)
  })

  it.each([storageKeys.locations, legacyStorageKeys.locations])('ne fabrique aucun plateau à partir des seules localisations %s', (key) => {
    const raw = locationsRaw()
    const result = inspectLocalWorkspace(storage({ [key]: raw }))

    expect(result).toMatchObject({ phase: 'invalid', draft: null, hasLocations: false, locationsValid: false })
    expect(result.rawEntries).toEqual({ [key]: raw })
    expect(result.warning).toBeTruthy()
  })

  it('garde la géométrie récupérable quand les liens Sureau sont corrompus sans reprendre les anciens liens en silence', () => {
    const entries = {
      [storageKeys.workspace]: workspaceRaw('Géométrie conservée'),
      [storageKeys.locations]: 'mauvais fichier',
      [legacyStorageKeys.locations]: locationsRaw({ 42: 'desk-03' }),
    }
    const result = inspectLocalWorkspace(storage(entries))

    expect(result).toMatchObject({ phase: 'ready', hasLocations: true, locationsValid: false })
    expect(result.draft?.workspace.name).toBe('Géométrie conservée')
    expect(result.draft?.locations).toEqual({})
    expect(result.warning).toBeTruthy()
    expect(result.rawEntries).toEqual(entries)
  })

  it('ne tronque pas des localisations qui dépassent les limites du document partagé', () => {
    const associations = Object.fromEntries(Array.from({ length: 20_001 }, (_, index) => [index + 1, 'desk-absent']))
    const raw = locationsRaw(associations)
    const result = inspectLocalWorkspace(storage({ [storageKeys.plan]: planRaw(), [storageKeys.locations]: raw }))

    expect(result).toMatchObject({ phase: 'ready', hasLocations: true, locationsValid: false })
    expect(result.draft?.locations).toEqual({})
    expect(result.rawEntries[storageKeys.locations]).toBe(raw)
    expect(result.warning).toBeTruthy()
  })

  it('distingue le stockage inaccessible d’une absence de plan', () => {
    const denied = { getItem: vi.fn(() => { throw new DOMException('Access denied', 'SecurityError') }) }

    expect(inspectLocalWorkspace(null)).toMatchObject({ phase: 'unavailable', draft: null, rawEntries: {} })
    const result = inspectLocalWorkspace(denied)
    expect(result).toMatchObject({ phase: 'unavailable', draft: null, hasLocations: false, locationsValid: false })
    expect(result.warning).toBeTruthy()
    expect(denied.getItem).toHaveBeenCalled()
  })

  it('conserve les valeurs déjà lues si le navigateur refuse une lecture ultérieure', () => {
    const raw = workspaceRaw()
    const browserStorage = storage({ [storageKeys.workspace]: raw })
    browserStorage.getItem.mockImplementation((key) => {
      if (key === storageKeys.workspace) return raw
      throw new DOMException('Storage became unavailable', 'SecurityError')
    })
    const result = inspectLocalWorkspace(browserStorage)

    expect(result).toMatchObject({ phase: 'unavailable', draft: null })
    expect(result.rawEntries[storageKeys.workspace]).toBe(raw)
    expect(browserStorage.setItem).not.toHaveBeenCalled()
    expect(browserStorage.removeItem).not.toHaveBeenCalled()
  })
})

describe('copie brute de récupération sans modification du navigateur', () => {
  it('exporte exactement les textes récupérés, même invalides, sans les parser ni les supprimer', () => {
    const entries = {
      [storageKeys.workspace]: '{\n  "cassé": "東京 🪴\\"\n',
      [legacyStorageKeys.workspace]: workspaceRaw('Ancienne copie'),
      [storageKeys.locations]: '\u0000\tvaleurs illisibles\n',
    }
    const browserStorage = storage(entries)
    const inspection = inspectLocalWorkspace(browserStorage)
    const raw = serializeLocalRecovery(inspection)

    expect(JSON.parse(raw)).toEqual({ format: 'sureau-local-recovery', version: 1, entries })
    expect(Object.fromEntries(browserStorage.entries)).toEqual(entries)
    expect(browserStorage.setItem).not.toHaveBeenCalled()
    expect(browserStorage.removeItem).not.toHaveBeenCalled()
    expect(browserStorage.clear).not.toHaveBeenCalled()
  })

  it('limite la copie brute aux six clés de plans prévues sans inclure les préférences ou des données étrangères', () => {
    const entries = { [legacyStorageKeys.plan]: planRaw() }
    const raw = serializeLocalRecovery({ ...entries, [storageKeys.theme]: 'dark', 'unrelated-secret': 'exclure' })

    expect(JSON.parse(raw)).toEqual({ format: 'sureau-local-recovery', version: 1, entries })
    expect(raw).not.toContain('unrelated-secret')
    expect(raw).not.toContain(storageKeys.theme)
  })

  it('détache l’instantané brut de changements ultérieurs du stockage', () => {
    const original = workspaceRaw('Copie originale')
    const browserStorage = storage({ [storageKeys.workspace]: original })
    const inspection = inspectLocalWorkspace(browserStorage)
    browserStorage.entries.set(storageKeys.workspace, workspaceRaw('Modification extérieure'))

    expect(inspection.rawEntries[storageKeys.workspace]).toBe(original)
    expect((JSON.parse(serializeLocalRecovery(inspection)) as { entries: Record<string, string> }).entries[storageKeys.workspace])
      .toBe(original)
  })

  it('n’accède pas au stockage lors de l’import du module', async () => {
    const access = vi.fn(() => { throw new Error('Automatic browser storage access is forbidden') })
    const browser = Object.defineProperty({}, 'localStorage', { get: access })
    vi.stubGlobal('window', browser)
    vi.stubGlobal('localStorage', browser)
    vi.resetModules()

    await import('./local-workspace-recovery')

    expect(access).not.toHaveBeenCalled()
  })
})
