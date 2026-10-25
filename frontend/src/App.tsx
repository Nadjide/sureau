import { useEffect, useState } from 'react'
import { LoaderCircle, MapPin, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'
import { LazyPanel } from '@/components/lazy-panel'
import { useSession } from '@/features/auth/use-session'
import { useInventory } from '@/features/inventory/use-inventory'
import { SpatialViewer } from '@/features/spatial/spatial-viewer'
import { type SpatialPlan, type SpatialView } from '@/features/spatial/room-model'
import { getWorkstationAssetIds, type LocalLocations } from '@/features/spatial/local-locations'
import { AssetLocationActions } from '@/features/spatial/asset-location-actions'
import { SpatialInspector } from '@/features/spatial/spatial-inspector'
import { useSharedWorkspace } from '@/features/spatial/use-shared-workspace'
import { WorkspaceConnectionBar } from '@/features/spatial/workspace-connection-bar'
import { WorkspaceStartPanel } from '@/features/spatial/workspace-start-panel'
import { createInitialSpatialDraft, serializeSpatialDraft, type InitialWorkspaceKind } from '@/features/spatial/shared-workspace-transfer'
import { selectIds, translateSelection } from '@/features/spatial/plan-selection'
import { FurnitureSummary } from '@/features/spatial/furniture-summary'
import { findWorkspaceStation, prepareRoomReplacement } from '@/features/spatial/workspace-rooms'
import '@/features/spatial/workspace-connection.css'
import type { SpatialDraft } from '@/features/spatial/shared-workspace-model'

const loadInventoryPanel = () => import('@/features/inventory/inventory-panel').then((module) => ({ default: module.InventoryPanel }))
const loadWorkstationEditor = () => import('@/features/spatial/workstation-editor').then((module) => ({ default: module.WorkstationEditor }))
const loadWorkspaceManager = () => import('@/features/spatial/workspace-manager').then((module) => ({ default: module.WorkspaceManager }))
const emptyLocations: LocalLocations = Object.freeze({})

function PanelStatus({ label, retry, persisted = false }: { label: string; retry?: () => void; persisted?: boolean }) {
  return <div className="inventory-empty" role={retry ? 'alert' : 'status'}>
    {!retry && <LoaderCircle className="animate-spin" size={24} aria-hidden="true" />}
    <h2>{label}</h2>
    {retry && <>
      <p>Le reste de votre espace reste accessible. Réessayez après avoir vérifié votre connexion.</p>
      <Button variant="outline" onClick={retry}>Réessayer le chargement</Button>
      <p>{persisted ? 'Votre dernière version enregistrée reste sur cette instance.' : 'Votre brouillon reste disponible pendant cette session. Exportez une copie avant de quitter.'}</p>
    </>}
  </div>
}

function ManagerStatus({ open, onOpenChange, retry, persisted }: { open: boolean; onOpenChange: (open: boolean) => void; retry?: () => void; persisted: boolean }) {
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" showCloseButton={false} className="workspace-manager">
      <SheetHeader><p className="eyebrow">VOTRE ESPACE, À VOTRE MESURE</p><SheetTitle>Organiser vos espaces</SheetTitle><SheetDescription>Des étages aux salles, composez un lieu qui vous ressemble.</SheetDescription></SheetHeader>
      <SheetClose asChild><Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Fermer la gestion des espaces"><X /></Button></SheetClose>
      <div className="workspace-manager-body"><PanelStatus label={retry ? 'La gestion des espaces n’a pas pu être chargée.' : 'Préparation de vos outils…'} persisted={persisted} {...(retry ? { retry } : {})} /></div>
    </SheetContent>
  </Sheet>
}

function currentTab(): WorkspaceTab {
  return window.location.hash === '#inventory' ? 'inventory' : 'spaces'
}

function App() {
  const [tab, setTab] = useState<WorkspaceTab>(currentTab)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [selection, setSelection] = useState<string[]>([])
  const [spatialView, setSpatialView] = useState<SpatialView>('3d')
  const [editing, setEditing] = useState(false)
  const [activeRoomId, setActiveRoomId] = useState('')
  const [organizing, setOrganizing] = useState(false)
  const [managerRequested, setManagerRequested] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const [exportNotice, setExportNotice] = useState<{ error: boolean; text: string } | null>(null)
  const { canEdit } = useSession()
  const inventory = useInventory()
  const workspaceStore = useSharedWorkspace()
  const workspace = workspaceStore.draft?.workspace ?? null
  const activeRoom = workspace?.rooms.find((room) => room.plan.id === activeRoomId) ?? workspace?.rooms[0] ?? null
  const plan = activeRoom?.plan ?? null
  const floorName = workspace?.floors.find((floor) => floor.id === activeRoom?.floorId)?.name ?? 'Vos espaces'
  const editable = canEdit && !workspaceStore.loading && workspace !== null
  const persisted = !workspaceStore.dirty && !workspaceStore.saving && !workspaceStore.loading && !workspaceStore.blocked && (workspaceStore.revision ?? 0) > 0
  const selectedIds = selection.filter((id) => plan && [...plan.workstations, ...plan.furniture].some((item) => item.id === id))
  const selectedWorkstationId = selectedIds.at(-1) ?? null
  const selectedFurniture = plan?.furniture.find((item) => item.id === selectedWorkstationId)
  const { undo, redo } = workspaceStore
  const planStore = { ...workspaceStore, persisted, replace: replacePlan }
  const local = {
    locations: workspaceStore.draft?.locations ?? emptyLocations,
    warning: workspaceStore.warning,
    persisted,
    associate(id: number, workstationId: string | null) {
      if (!editable || !workspace) return
      const target = workstationId ? findWorkspaceStation(workspace, workstationId) : undefined
      if (workstationId && !target) return
      if (!workspaceStore.associate(id, workstationId)) return
      if (id === selectedAssetId && workstationId && target) { setActiveRoomId(target.room.plan.id); setSelection([workstationId]) }
    },
  }
  const localizedCounts = Object.fromEntries((plan?.workstations ?? []).map((station) => [station.id, getWorkstationAssetIds(local.locations, station.id).length]))
  const hasOpenForms = editing || organizing
  const needsDepartureGuard = workspaceStore.dirty || hasOpenForms

  useEffect(() => {
    if (tab !== 'spaces' || !editing || !editable) return
    const shortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || (!event.ctrlKey && !event.metaKey)) return
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z') {
        event.preventDefault()
        if (event.shiftKey) redo()
        else undo()
      } else if (key === 'y') { event.preventDefault(); redo() }
    }
    window.addEventListener('keydown', shortcut)
    return () => window.removeEventListener('keydown', shortcut)
  }, [tab, editing, editable, undo, redo])

  useEffect(() => {
    const update = () => {
      if (window.location.hash === '#inventory' || window.location.hash === '#spaces') setTab(currentTab())
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  useEffect(() => {
    if (!needsDepartureGuard && !workspaceStore.saving) return
    const warnDeparture = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warnDeparture)
    return () => window.removeEventListener('beforeunload', warnDeparture)
  }, [needsDepartureGuard, workspaceStore.saving])

  function replacePlan(next: SpatialPlan): boolean {
    if (!editable || !workspace || !plan) return false
    try {
      const applied = workspaceStore.replaceRoom(plan.id, prepareRoomReplacement(workspace, plan.id, next))
      if (applied) setRoomError(null)
      return applied
    } catch (error) { setRoomError(error instanceof Error ? error.message : 'Le plan ne peut pas être appliqué à cette salle.'); return false }
  }

  function navigate(next: WorkspaceTab) {
    setTab(next)
    window.location.hash = next
  }

  function selectAsset(id: number | null) {
    setSelectedAssetId(id)
    if (id !== null && workspace) {
      const workstationId = local.locations[id]
      const target = workstationId ? findWorkspaceStation(workspace, workstationId) : undefined
      if (target) { setActiveRoomId(target.room.plan.id); setSelection([target.station.id]) }
    }
  }

  function selectWorkstation(id: string | null, additive = false, preserve = false) {
    setSelection((current) => id ? selectIds(current, id, additive, preserve) : [])
    setSelectedAssetId(null)
  }

  function showInPlan(id: number) {
    if (!workspace) return
    const target = findWorkspaceStation(workspace, local.locations[id] || null)
    if (!target) return
    setActiveRoomId(target.room.plan.id); setSelection([target.station.id]); setSelectedAssetId(id)
    navigate('spaces')
  }

  function selectRoom(id: string) {
    setActiveRoomId(id); setSelection([]); setSelectedAssetId(null); setRoomError(null)
    navigate('spaces')
  }

  function initialize(kind: InitialWorkspaceKind) {
    const draft = createInitialSpatialDraft(kind)
    if (workspaceStore.initialize(draft)) { setActiveRoomId(draft.workspace.rooms[0]!.plan.id); setSelection([]); setRoomError(null) }
  }

  function recoverInitialWorkspace(draft: SpatialDraft): boolean {
    if (!canEdit || workspaceStore.loading || workspaceStore.phase !== 'missing') return false
    if (!workspaceStore.initialize(draft)) return false
    setActiveRoomId(draft.workspace.rooms[0]!.plan.id); setSelection([]); setRoomError(null)
    return true
  }

  async function reloadWorkspace(confirmed = false): Promise<boolean> {
    const loaded = await workspaceStore.reload(confirmed)
    if (loaded) {
      setEditing(false); setOrganizing(false); setManagerRequested(false)
      setSelection([]); setSelectedAssetId(null); setActiveRoomId(''); setRoomError(null); setExportNotice(null)
    }
    return loaded
  }

  function exportDraft(): boolean {
    if (!workspaceStore.draft) return false
    try {
      const raw = serializeSpatialDraft(workspaceStore.draft)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      const name = workspaceStore.draft.workspace.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'espace'
      link.href = url; link.download = `sureau-${name}-brouillon.json`
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setExportNotice({ error: false, text: 'Copie préparée avec les étages, les salles, le mobilier et les localisations. L’inventaire et les comptes restent dans la base de cette instance.' })
      return true
    } catch {
      const text = 'La copie n’a pas pu être préparée. Votre brouillon est conservé dans cette session.'
      setExportNotice({ error: true, text })
      return false
    }
  }

  return <AppShell tab={tab} onTabChange={navigate} workspace={workspace} activeRoomId={plan?.id ?? ''} onRoomChange={selectRoom}
    onManageSpaces={() => { if (editable) { setManagerRequested(true); setOrganizing(true) } }}
    {...(workspaceStore.draft ? { departureGuard: { dirty: needsDepartureGuard, saving: workspaceStore.saving, exportDraft } } : {})}>
    {managerRequested && workspace && plan && <LazyPanel
      load={loadWorkspaceManager}
      panelProps={{ open: organizing, onOpenChange: setOrganizing, workspace, locations: local.locations, activeRoomId: plan.id, onSelectRoom: selectRoom, onChange: workspaceStore.replace, onSpatialChange: workspaceStore.replaceDraft, persisted, history: workspaceStore, canEdit: editable }}
      loading={<ManagerStatus open={organizing} onOpenChange={setOrganizing} persisted={persisted} />}
      failure={(retry) => <ManagerStatus open={organizing} onOpenChange={setOrganizing} retry={retry} persisted={persisted} />}
    />}
    <div className="workspace-heading"><div><p className="eyebrow">{tab === 'spaces' ? `ESPACE PARTAGÉ / ${floorName.toLocaleUpperCase('fr')}` : 'PARC INFORMATIQUE'}</p><h1>{tab === 'spaces' ? plan?.name ?? 'Vos espaces' : 'Matériel'}</h1><p className="workspace-description">{tab === 'spaces' ? 'Votre matériel, dans son environnement.' : 'Une vue commune sur tous vos équipements.'}</p></div><Badge variant="outline">{tab === 'spaces' ? workspaceStore.dirty ? 'Brouillon' : 'Espace partagé' : 'Inventaire'}</Badge></div>
    <WorkspaceConnectionBar store={workspaceStore} canEdit={canEdit} hasOpenForms={hasOpenForms} onReload={reloadWorkspace} onExport={exportDraft} exportNotice={exportNotice} />
    {roomError && tab === 'spaces' && <p className="storage-warning px-8 pb-4" role="alert">{roomError}</p>}
    {tab === 'inventory' ? <LazyPanel
      load={loadInventoryPanel}
      loading={<PanelStatus label="Préparation de l’inventaire…" />}
      failure={(retry) => <PanelStatus label="L’inventaire n’a pas pu être chargé." retry={retry} persisted={persisted} />}
      panelProps={{
        inventory, selectedAssetId, onSelect: selectAsset,
        locationLabel: (id) => {
          if (!workspace) return 'Localisation indisponible'
          const target = findWorkspaceStation(workspace, local.locations[id] || null)
          return target ? `${target.station.label} · ${target.room.plan.name} · ${target.floor.name}` : local.locations[id] ? 'Poste absent des salles' : 'Non localisé'
        },
        renderAssetActions: (asset) => workspace && plan
          ? <AssetLocationActions asset={asset} local={local} onShowInPlan={showInPlan} plan={plan} workspace={workspace} canEdit={editable} />
          : <section className="workspace-location-unavailable" aria-label={`Localisation de ${asset.assetTag}`}><h3><MapPin size={13} aria-hidden="true" />Localisation dans le plan</h3><select disabled aria-label="Poste de travail indisponible" value=""><option value="">Localisation indisponible</option></select><p>Chargez ou préparez l’espace partagé pour retrouver les postes et modifier les localisations. La fiche du matériel reste accessible.</p></section>,
      }}
    /> : workspace && plan ? <SpatialViewer
      key={plan.id}
      plan={plan} history={planStore} editing={editing} canEdit={editable} persisted={persisted}
      onEditingChange={(value) => { if (!value || editable) { setEditing(value); setSelectedAssetId(null) } }}
      onMove={(id, x, z) => { if (editable) replacePlan(translateSelection(plan, selectedIds.includes(id) ? selectedIds : [id], id, x, z, false)) }}
      view={spatialView} onViewChange={setSpatialView} selectedWorkstationId={selectedWorkstationId} selectedIds={selectedIds}
      onSelectionChange={(ids) => { setSelection(ids); setSelectedAssetId(null) }} onSelectWorkstation={selectWorkstation} localizedCounts={localizedCounts}
      inspector={editing ? <LazyPanel
        key={plan.id}
        load={loadWorkstationEditor}
        panelProps={{ plan, persisted, selectedId: selectedWorkstationId, selectedIds, onChange: replacePlan, onSelect: selectWorkstation, onSelectionChange: setSelection, workspace, onWorkspaceChange: workspaceStore.replace, onSelectionMoved: (roomId, ids) => { setActiveRoomId(roomId); setSelection(ids); setSelectedAssetId(null) }, canEdit: editable }}
        loading={<aside className="asset-inspector plan-editor" aria-label="Chargement de l’éditeur"><PanelStatus label="Préparation de l’atelier…" /></aside>}
        failure={(retry) => <aside className="asset-inspector plan-editor" aria-label="Éditeur indisponible"><PanelStatus label="L’atelier n’a pas pu être chargé." retry={retry} persisted={persisted} /></aside>}
      /> : selectedFurniture ? <aside className="asset-inspector" aria-label="Fiche du mobilier"><FurnitureSummary item={selectedFurniture} /></aside> : <SpatialInspector
        plan={plan} workspace={workspace} selectedWorkstationId={selectedWorkstationId} selectedAssetId={selectedAssetId}
        onSelectAsset={selectAsset} onOpenInventory={() => navigate('inventory')} onShowInPlan={showInPlan} inventory={inventory} local={local} canEdit={editable}
      />}
    /> : <WorkspaceStartPanel store={workspaceStore} canEdit={canEdit} onInitialize={initialize} onRecover={recoverInitialWorkspace} onRetry={() => { void reloadWorkspace() }} onOpenInventory={() => navigate('inventory')} />}
  </AppShell>
}

export default App
