import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-client'
import { createWorkspaceFromPlan } from './workspace-document'
import { parseSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { createSharedWorkspaceStore } from './shared-workspace-store'
import type { WorkspaceSnapshot } from './workspace-api'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function draft(name = 'Entreprise'): SpatialDraft {
  const workspace = createWorkspaceFromPlan()
  workspace.name = name
  return parseSpatialDraft({ workspace, locations: { 900: 'desk-removed' } })
}

function snapshot(revision = 4, value = draft()): WorkspaceSnapshot {
  const detached = parseSpatialDraft(value)
  return { ...detached, revision, updatedAt: '2026-10-24T10:00:00Z' }
}

function harness(initial = snapshot()) {
  let canEdit = true
  const getWorkspace = vi.fn<(signal?: AbortSignal) => Promise<WorkspaceSnapshot | null>>()
    .mockResolvedValue(initial)
  const saveWorkspace = vi.fn<(revision: number, value: SpatialDraft, signal?: AbortSignal) => Promise<WorkspaceSnapshot>>()
    .mockImplementation(async (revision, value) => snapshot(revision + 1, value))
  const store = createSharedWorkspaceStore({ getWorkspace, saveWorkspace, canEdit: () => canEdit })
  return { store, getWorkspace, saveWorkspace, setCanEdit: (value: boolean) => { canEdit = value } }
}

function deskId(value: SpatialDraft, index = 0): string {
  return value.workspace.rooms[0]!.plan.workstations[index]!.id
}

describe('chargement et initialisation explicite de l’espace partagé', () => {
  it('ne dispose d’aucun brouillon avant la réponse complète du serveur', async () => {
    const pending = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace, saveWorkspace } = harness()
    getWorkspace.mockReturnValueOnce(pending.promise)
    const started = store.start()

    expect(store.getState()).toMatchObject({ phase: 'loading', loading: true, draft: null, revision: null, dirty: false })
    expect(store.initialize(draft())).toBe(false)
    expect(store.replace(draft().workspace)).toBe(false)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).not.toHaveBeenCalled()

    pending.resolve(snapshot())
    await expect(started).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'ready', loading: false, revision: 4, dirty: false })
    expect(store.getState().draft).toEqual(draft())
  })

  it('ne permet ni initialisation ni enregistrement après un GET en échec', async () => {
    const { store, getWorkspace, saveWorkspace } = harness()
    getWorkspace.mockRejectedValueOnce(new ApiError('http', 'Service indisponible', 500, 'PERSISTENCE_ERROR'))

    await expect(store.start()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ phase: 'error', draft: null, history: null, revision: null, dirty: false })
    expect(store.getState().error).toBeTruthy()
    expect(store.initialize(draft())).toBe(false)
    expect(store.replaceDraft(draft())).toBe(false)
    expect(store.replace(draft().workspace)).toBe(false)
    expect(store.associate(42, deskId(draft()))).toBe(false)
    expect(store.undo()).toBe(false)
    expect(store.redo()).toBe(false)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).not.toHaveBeenCalled()
  })

  it('prépare un brouillon à la révision zéro uniquement après l’absence confirmée, sans PUT automatique', async () => {
    const { store, getWorkspace, saveWorkspace } = harness()
    getWorkspace.mockResolvedValueOnce(null)

    await expect(store.start()).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'missing', draft: null, history: null, revision: 0, dirty: false })
    const prepared = draft('Plateau choisi explicitement')
    expect(store.initialize(prepared)).toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 0, base: null, dirty: true })
    expect(store.getState().draft).toEqual(prepared)
    expect(saveWorkspace).not.toHaveBeenCalled()

    await expect(store.save()).resolves.toBe(true)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
    expect(saveWorkspace.mock.calls[0]![0]).toBe(0)
    expect(saveWorkspace.mock.calls[0]![1]).toEqual(prepared)
    expect(store.getState()).toMatchObject({ revision: 1, dirty: false })
  })

  it('n’autorise pas une deuxième initialisation à écraser le brouillon déjà préparé', async () => {
    const { store, getWorkspace } = harness()
    getWorkspace.mockResolvedValueOnce(null)
    await store.start()
    expect(store.initialize(draft('Premier choix'))).toBe(true)

    expect(store.initialize(draft('Autre choix'))).toBe(false)
    expect(store.getState().draft?.workspace.name).toBe('Premier choix')
  })

  it('ne réinitialise jamais un espace déjà présent sur le serveur', async () => {
    const { store } = harness()
    await store.start()

    expect(store.initialize(draft('Autre entreprise'))).toBe(false)
    expect(store.getState().revision).toBe(4)
    expect(store.getState().draft).toEqual(draft())
  })

  it('refuse un document invalide sans perdre le chargement initial ni créer un historique', async () => {
    const { store } = harness()
    await store.start()
    const before = store.getState()
    const invalid = draft()
    invalid.workspace.name = ''

    expect(store.replaceDraft(invalid)).toBe(false)
    expect(store.getState().draft).toEqual(before.draft)
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().revision).toBe(4)
  })
})

describe('droits et historique atomique', () => {
  it('charge les données d’un lecteur mais refuse toutes ses mutations', async () => {
    const { store, saveWorkspace, setCanEdit } = harness()
    setCanEdit(false)
    await expect(store.start()).resolves.toBe(true)
    const before = store.getState()
    const room = before.draft!.workspace.rooms[0]!
    const plan = structuredClone(room.plan)
    plan.name = 'Nouvelle salle'

    expect(store.initialize(draft())).toBe(false)
    expect(store.replace(draft('Nom interdit').workspace)).toBe(false)
    expect(store.replaceDraft(draft('Document interdit'))).toBe(false)
    expect(store.replaceRoom(room.plan.id, plan)).toBe(false)
    expect(store.associate(42, deskId(before.draft!))).toBe(false)
    expect(store.associate(900, null)).toBe(false)
    expect(store.undo()).toBe(false)
    expect(store.redo()).toBe(false)
    expect(await store.save()).toBe(false)
    expect(store.getState().history).toEqual(before.history)
    expect(saveWorkspace).not.toHaveBeenCalled()
  })

  it('refuse aussi l’initialisation d’un lecteur lorsque le serveur est vide', async () => {
    const { store, getWorkspace, saveWorkspace, setCanEdit } = harness()
    getWorkspace.mockResolvedValueOnce(null)
    setCanEdit(false)
    await store.start()

    expect(store.initialize(draft())).toBe(false)
    expect(await store.save()).toBe(false)
    expect(store.getState()).toMatchObject({ phase: 'missing', draft: null, dirty: false })
    expect(saveWorkspace).not.toHaveBeenCalled()
  })

  it('revérifie les droits lors d’un undo, redo, placement et enregistrement déjà disponibles', async () => {
    const { store, saveWorkspace, setCanEdit } = harness()
    await store.start()
    store.replace(draft('Brouillon 1').workspace)
    store.replace(draft('Brouillon 2').workspace)
    store.undo()
    const before = store.getState()
    expect(before).toMatchObject({ canUndo: true, canRedo: true, dirty: true })
    setCanEdit(false)

    expect(store.undo()).toBe(false)
    expect(store.redo()).toBe(false)
    expect(store.associate(42, deskId(before.draft!))).toBe(false)
    expect(store.replace(draft('Modification interdite').workspace)).toBe(false)
    expect(await store.save()).toBe(false)
    expect(store.getState().history).toEqual(before.history)
    expect(saveWorkspace).not.toHaveBeenCalled()
  })

  it('conserve les associations orphelines quand les salles ou les postes sont modifiés', async () => {
    const { store, saveWorkspace } = harness()
    await store.start()
    const initial = store.getState().draft!
    expect(store.associate(42, deskId(initial))).toBe(true)
    const plan = structuredClone(initial.workspace.rooms[0]!.plan)
    plan.workstations = []

    expect(store.replaceRoom(plan.id, plan)).toBe(true)
    expect(store.getState().draft?.locations).toEqual({ 42: deskId(initial), 900: 'desk-removed' })
    await expect(store.save()).resolves.toBe(true)
    expect(saveWorkspace.mock.calls[0]![1].locations).toEqual({ 42: deskId(initial), 900: 'desk-removed' })
    expect(store.associate(900, null)).toBe(true)
    expect(store.getState().draft?.locations).toEqual({ 42: deskId(initial) })
    expect(store.undo()).toBe(true)
    expect(store.getState().draft?.locations).toEqual({ 42: deskId(initial), 900: 'desk-removed' })
  })

  it('ne crée pas de nouvelle association vers un poste inexistant', async () => {
    const { store } = harness()
    await store.start()
    const before = store.getState().history

    expect(store.associate(42, 'desk-never-created')).toBe(false)
    expect(store.associate(Number.MAX_SAFE_INTEGER + 1, deskId(store.getState().draft!))).toBe(false)
    expect(store.getState().history).toEqual(before)
  })

  it('annule et rétablit ensemble le plan et ses localisations importées', async () => {
    const { store } = harness()
    await store.start()
    const initial = store.getState().draft!
    const replacement = { ...draft('Étage importé'), locations: { 42: 'desk-foreign' } }

    expect(store.replaceDraft(replacement)).toBe(true)
    expect(store.getState().draft).toEqual(replacement)
    expect(store.undo()).toBe(true)
    expect(store.getState().draft).toEqual(initial)
    expect(store.redo()).toBe(true)
    expect(store.getState().draft).toEqual(replacement)
  })
})

describe('confirmation et échecs d’enregistrement', () => {
  it('ne renvoie pas un document inchangé au serveur', async () => {
    const { store, saveWorkspace } = harness()
    await store.start()

    await store.save()

    expect(saveWorkspace).not.toHaveBeenCalled()
    expect(store.getState().dirty).toBe(false)
  })

  it.each([401, 403])('garde le brouillon, l’historique et la révision après un refus %i', async (status) => {
    const { store, saveWorkspace, setCanEdit } = harness()
    await store.start()
    store.replace(draft('Saisie conservée').workspace)
    const before = store.getState()
    saveWorkspace.mockRejectedValueOnce(new ApiError('http', 'Session ou droits refusés', status, 'ACCESS_DENIED'))

    await expect(store.save()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, saving: false, blocked: null })
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().base).toEqual(before.base)
    expect(store.getState().error).toBeTruthy()
    expect(saveWorkspace).toHaveBeenCalledTimes(1)

    setCanEdit(false)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
    setCanEdit(true)
    await expect(store.save()).resolves.toBe(true)
    expect(store.getState().dirty).toBe(false)
  })

  it('bloque un nouvel envoi après un conflit et conserve tout l’historique', async () => {
    const { store, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Premier changement').workspace)
    store.replace(draft('Changement final').workspace)
    store.undo()
    const before = store.getState()
    saveWorkspace.mockRejectedValueOnce(new ApiError('http', 'L’espace a changé', 409, 'WORKSPACE_CONFLICT'))

    await expect(store.save()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ blocked: 'conflict', revision: 4, dirty: true, saving: false })
    expect(store.getState().history).toEqual(before.history)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
  })

  it.each([
    new ApiError('network', 'Connexion perdue'),
    new ApiError('invalid-response', 'Réponse illisible'),
    new ApiError('http', 'Panne serveur', 503, 'PERSISTENCE_ERROR'),
  ])('bloque un résultat incertain sans effacer le brouillon ($kind/$status)', async (error) => {
    const { store, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Résultat à vérifier').workspace)
    const before = store.getState()
    saveWorkspace.mockRejectedValueOnce(error)

    await expect(store.save()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ blocked: 'uncertain', revision: 4, dirty: true, saving: false })
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().base).toEqual(before.base)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
  })

  it('ne transforme pas une validation refusée en succès ni en conflit de version', async () => {
    const { store, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Saisie à corriger').workspace)
    saveWorkspace.mockRejectedValueOnce(new ApiError('http', 'Données invalides', 400, 'WORKSPACE_INVALID'))

    await expect(store.save()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, saving: false, blocked: null })
    expect(store.getState().draft?.workspace.name).toBe('Saisie à corriger')
  })

  it('envoie un seul snapshot malgré un double déclenchement pendant la requête', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Envoi unique').workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)

    const first = store.save()
    const second = store.save()
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
    expect(store.getState().saving).toBe(true)
    pending.resolve(snapshot(5, draft('Envoi unique')))

    await first
    await second
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
    expect(store.getState()).toMatchObject({ revision: 5, dirty: false, saving: false })
  })

  it('conserve un succès déjà confirmé même si la session perd ses droits pendant la requête', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace, setCanEdit } = harness()
    await store.start()
    const sent = draft('Déjà enregistré')
    store.replace(sent.workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    setCanEdit(false)
    pending.resolve(snapshot(5, sent))

    await expect(saving).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ revision: 5, dirty: false, saving: false, blocked: null })
    expect(store.getState().draft).toEqual(sent)
    expect(store.associate(42, deskId(sent))).toBe(false)
  })

  it.each([
    { label: 'une autre révision', value: (sent: SpatialDraft) => snapshot(6, sent) },
    { label: 'des localisations différentes', value: (sent: SpatialDraft) => ({
      ...snapshot(5, sent), locations: { ...sent.locations, 42: 'desk-other' },
    }) },
    { label: 'une date absente', value: (sent: SpatialDraft) => ({ ...snapshot(5, sent), updatedAt: '' }) },
  ])('ne considère pas $label comme la confirmation de ce brouillon', async ({ value }) => {
    const { store, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Instantané exact à confirmer')
    store.replace(sent.workspace)
    const before = store.getState()
    saveWorkspace.mockResolvedValueOnce(value(sent))

    await expect(store.save()).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, saving: false, blocked: 'uncertain' })
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().base).toEqual(before.base)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
  })
})

describe('modifications et historique pendant un enregistrement', () => {
  it('préserve les nouvelles modifications et calcule dirty par rapport au snapshot confirmé', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Version envoyée')
    store.replace(sent.workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    store.replace(draft('Modification pendant l’envoi').workspace)
    store.associate(42, deskId(sent))
    const latest = store.getState().draft
    const history = store.getState().history
    pending.resolve(snapshot(5, sent))

    await expect(saving).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ revision: 5, dirty: true, saving: false })
    expect(store.getState().base).toEqual(sent)
    expect(store.getState().draft).toEqual(latest)
    expect(store.getState().history).toEqual(history)
    expect(saveWorkspace.mock.calls[0]![0]).toBe(4)
    expect(saveWorkspace.mock.calls[0]![1]).toEqual(sent)

    expect(store.undo()).toBe(true)
    expect(store.getState().dirty).toBe(true)
    expect(store.undo()).toBe(true)
    expect(store.getState().draft).toEqual(sent)
    expect(store.getState().dirty).toBe(false)
    expect(store.undo()).toBe(true)
    expect(store.getState().draft).toEqual(draft())
    expect(store.getState().dirty).toBe(true)
    expect(store.redo()).toBe(true)
    expect(store.getState().dirty).toBe(false)
  })

  it('ne perd pas un undo qui revient à l’ancienne version pendant l’envoi', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Version en cours d’envoi')
    store.replace(sent.workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    expect(store.undo()).toBe(true)
    expect(store.getState().dirty).toBe(false)
    pending.resolve(snapshot(5, sent))

    await expect(saving).resolves.toBe(true)
    expect(store.getState().draft).toEqual(draft())
    expect(store.getState()).toMatchObject({ revision: 5, dirty: true, canRedo: true })
    expect(store.redo()).toBe(true)
    expect(store.getState().draft).toEqual(sent)
    expect(store.getState().dirty).toBe(false)
  })

  it('ne perd pas un redo effectué après la capture de la version envoyée', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Première modification')
    const latest = draft('Modification rétablie')
    store.replace(sent.workspace)
    store.replace(latest.workspace)
    store.undo()
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    expect(store.redo()).toBe(true)
    pending.resolve(snapshot(5, sent))

    await expect(saving).resolves.toBe(true)
    expect(store.getState().draft).toEqual(latest)
    expect(store.getState()).toMatchObject({ revision: 5, dirty: true, canUndo: true, canRedo: false })
    expect(store.undo()).toBe(true)
    expect(store.getState().draft).toEqual(sent)
    expect(store.getState().dirty).toBe(false)
  })

  it('reconnaît un brouillon égal au snapshot confirmé après des modifications puis un undo', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Version envoyée')
    store.replace(sent.workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    store.replace(draft('Changement annulé').workspace)
    store.undo()
    pending.resolve(snapshot(5, sent))

    await expect(saving).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ revision: 5, dirty: false, canRedo: true })
    expect(store.getState().draft).toEqual(sent)
  })
})

describe('rechargement confirmé et cycle de vie', () => {
  it('refuse le rechargement destructif sans confirmation lorsque le brouillon a changé', async () => {
    const { store, getWorkspace } = harness()
    await store.start()
    store.replace(draft('À conserver').workspace)
    const before = store.getState()

    await expect(store.reload()).resolves.toBe(false)
    expect(getWorkspace).toHaveBeenCalledTimes(1)
    expect(store.getState().history).toEqual(before.history)
  })

  it('refuse également un reload non confirmé après un conflit, même si undo revient à la base', async () => {
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Conflit').workspace)
    saveWorkspace.mockRejectedValueOnce(new ApiError('http', 'Conflit', 409, 'WORKSPACE_CONFLICT'))
    await store.save()
    store.undo()
    expect(store.getState()).toMatchObject({ dirty: false, blocked: 'conflict' })

    await expect(store.reload()).resolves.toBe(false)
    expect(getWorkspace).toHaveBeenCalledTimes(1)
  })

  it('conserve le brouillon et son historique si le GET de remplacement échoue', async () => {
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Brouillon récupérable').workspace)
    saveWorkspace.mockRejectedValueOnce(new ApiError('http', 'Conflit', 409, 'WORKSPACE_CONFLICT'))
    await store.save()
    const before = store.getState()
    getWorkspace.mockRejectedValueOnce(new ApiError('http', 'Service indisponible', 503))

    await expect(store.reload(true)).resolves.toBe(false)
    expect(store.getState().draft).toEqual(before.draft)
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().base).toEqual(before.base)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, blocked: 'conflict', loading: false })
    expect(store.getState().error).toBeTruthy()
  })

  it('conserve aussi les données si un espace déjà chargé disparaît du serveur', async () => {
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Travail à récupérer').workspace)
    const before = store.getState()
    getWorkspace.mockResolvedValueOnce(null)

    await expect(store.reload(true)).resolves.toBe(false)
    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 4, dirty: true, blocked: 'uncertain' })
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState().base).toEqual(before.base)
    expect(store.initialize(draft('Nouvel espace'))).toBe(false)
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).not.toHaveBeenCalled()
  })

  it('permet de relancer explicitement le chargement après une panne initiale', async () => {
    const { store, getWorkspace } = harness()
    getWorkspace.mockRejectedValueOnce(new ApiError('http', 'Panne temporaire', 500))
    await store.start()
    getWorkspace.mockResolvedValueOnce(snapshot(8, draft('Données retrouvées')))

    await expect(store.reload()).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 8, dirty: false, blocked: null, error: null })
    expect(store.getState().draft?.workspace.name).toBe('Données retrouvées')
    expect(getWorkspace).toHaveBeenCalledTimes(2)
  })

  it('remplace le brouillon uniquement après confirmation et réception de la nouvelle version', async () => {
    const pending = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Ancien brouillon').workspace)
    saveWorkspace.mockRejectedValueOnce(new ApiError('network', 'Résultat inconnu'))
    await store.save()
    const before = store.getState()
    const server = snapshot(9, draft('Version du serveur'))
    getWorkspace.mockReturnValueOnce(pending.promise)

    const reloading = store.reload(true)
    expect(store.getState().draft).toEqual(before.draft)
    expect(store.getState().history).toEqual(before.history)
    pending.resolve(server)

    await expect(reloading).resolves.toBe(true)
    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 9, dirty: false, loading: false, blocked: null })
    expect(store.getState().draft).toEqual(draft('Version du serveur'))
    expect(store.getState().base).toEqual(draft('Version du serveur'))
    expect(store.getState().history?.past).toEqual([])
    expect(store.getState().history?.future).toEqual([])
    expect(store.getState().error).toBeNull()
  })

  it('suspend les mutations pendant un rechargement confirmé pour ne pas perdre de nouvelles saisies', async () => {
    const pending = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    store.replace(draft('Avant rechargement').workspace)
    store.replace(draft('Dernier brouillon').workspace)
    store.undo()
    const before = store.getState()
    const room = before.draft!.workspace.rooms[0]!
    getWorkspace.mockReturnValueOnce(pending.promise)
    const loading = store.reload(true)

    expect(store.initialize(draft())).toBe(false)
    expect(store.replace(draft('Nouvelle saisie').workspace)).toBe(false)
    expect(store.replaceDraft(draft('Nouveau document'))).toBe(false)
    expect(store.replaceRoom(room.plan.id, { ...room.plan, name: 'Autre salle' })).toBe(false)
    expect(store.associate(42, deskId(before.draft!))).toBe(false)
    expect(store.undo()).toBe(false)
    expect(store.redo()).toBe(false)
    expect(await store.save()).toBe(false)
    expect(store.getState().history).toEqual(before.history)
    expect(saveWorkspace).not.toHaveBeenCalled()
    pending.resolve(snapshot(9, draft('Version rechargée')))

    await expect(loading).resolves.toBe(true)
    expect(store.getState().draft?.workspace.name).toBe('Version rechargée')
  })

  it('ne lance qu’un GET lorsque start est appelé plusieurs fois pendant le chargement', async () => {
    const pending = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace } = harness()
    getWorkspace.mockReturnValueOnce(pending.promise)
    const first = store.start()
    const second = store.start()
    expect(getWorkspace).toHaveBeenCalledTimes(1)
    pending.resolve(snapshot())

    await first
    await second
    expect(getWorkspace).toHaveBeenCalledTimes(1)
    await store.start()
    expect(getWorkspace).toHaveBeenCalledTimes(1)
  })

  it('annule un ancien chargement et ignore sa réponse après un nouveau démarrage', async () => {
    const old = deferred<WorkspaceSnapshot | null>()
    const current = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace } = harness()
    getWorkspace.mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const first = store.start()
    const signal = getWorkspace.mock.calls[0]![0]!
    store.dispose()
    expect(signal.aborted).toBe(true)
    const second = store.start()
    const expected = snapshot(8, draft('Nouvelle session'))
    current.resolve(expected)
    await expect(second).resolves.toBe(true)
    old.resolve(snapshot(2, draft('Ancienne réponse')))
    await first

    expect(getWorkspace).toHaveBeenCalledTimes(2)
    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 8, dirty: false })
    expect(store.getState().draft).toEqual(draft('Nouvelle session'))
  })

  it('ignore un ancien rejet après le succès du nouveau cycle', async () => {
    const old = deferred<WorkspaceSnapshot | null>()
    const { store, getWorkspace } = harness()
    getWorkspace.mockReturnValueOnce(old.promise).mockResolvedValueOnce(snapshot(8, draft('Chargement actif')))
    const first = store.start()
    store.dispose()
    await store.start()
    old.reject(new ApiError('http', 'Panne de l’ancienne requête', 500))
    await first

    expect(store.getState()).toMatchObject({ phase: 'ready', revision: 8, error: null })
    expect(store.getState().draft?.workspace.name).toBe('Chargement actif')
  })

  it('conserve le brouillon après dispose/start et n’accepte pas un ancien accusé d’enregistrement', async () => {
    const pending = deferred<WorkspaceSnapshot>()
    const { store, getWorkspace, saveWorkspace } = harness()
    await store.start()
    const sent = draft('Envoi interrompu')
    store.replace(sent.workspace)
    saveWorkspace.mockReturnValueOnce(pending.promise)
    const saving = store.save()
    const signal = saveWorkspace.mock.calls[0]![2]!
    store.dispose()
    expect(signal.aborted).toBe(true)
    await store.start()
    const before = store.getState()
    pending.resolve(snapshot(5, sent))
    await saving

    expect(getWorkspace).toHaveBeenCalledTimes(1)
    expect(store.getState().draft).toEqual(sent)
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, saving: false, blocked: 'uncertain' })
    expect(await store.save()).toBe(false)
    expect(saveWorkspace).toHaveBeenCalledTimes(1)
  })

  it('conserve un brouillon au redémarrage sans le remplacer par un nouveau GET', async () => {
    const { store, getWorkspace } = harness()
    await store.start()
    store.replace(draft('Travail en cours').workspace)
    const before = store.getState()
    store.dispose()

    await expect(store.start()).resolves.toBe(true)
    expect(getWorkspace).toHaveBeenCalledTimes(1)
    expect(store.getState().history).toEqual(before.history)
    expect(store.getState()).toMatchObject({ revision: 4, dirty: true, blocked: null })
  })

  it('retire un abonnement sans empêcher les autres lecteurs de suivre les changements', async () => {
    const { store } = harness()
    const first = vi.fn()
    const second = vi.fn()
    const unsubscribe = store.subscribe(first)
    store.subscribe(second)
    await store.start()
    unsubscribe()
    const firstCount = first.mock.calls.length
    const secondCount = second.mock.calls.length

    store.replace(draft('Nouvel état').workspace)

    expect(first).toHaveBeenCalledTimes(firstCount)
    expect(second.mock.calls.length).toBeGreaterThan(secondCount)
  })
})
