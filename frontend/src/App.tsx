import { useEffect, useState } from 'react'
import { LoaderCircle, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'
import { LazyPanel } from '@/components/lazy-panel'
import { useInventory } from '@/features/inventory/use-inventory'
import { SpatialViewer } from '@/features/spatial/spatial-viewer'
import { type SpatialPlan, type SpatialView } from '@/features/spatial/room-model'
import { useLocalLocations } from '@/features/spatial/use-local-locations'
import { getWorkstationAssetIds } from '@/features/spatial/local-locations'
import { AssetLocationActions } from '@/features/spatial/asset-location-actions'
import { SpatialInspector } from '@/features/spatial/spatial-inspector'
import { useWorkspaceDocument } from '@/features/spatial/use-workspace-document'
import { selectIds, translateSelection } from '@/features/spatial/plan-selection'
import { FurnitureSummary } from '@/features/spatial/furniture-summary'
import { findWorkspaceStation, prepareRoomReplacement } from '@/features/spatial/workspace-rooms'

const loadInventoryPanel = () => import('@/features/inventory/inventory-panel').then((module) => ({ default: module.InventoryPanel }))
const loadWorkstationEditor = () => import('@/features/spatial/workstation-editor').then((module) => ({ default: module.WorkstationEditor }))
const loadWorkspaceManager = () => import('@/features/spatial/workspace-manager').then((module) => ({ default: module.WorkspaceManager }))

function PanelStatus({ label, retry, persisted = false }: { label: string; retry?: () => void; persisted?: boolean }) {
  return <div className="inventory-empty" role={retry ? 'alert' : 'status'}>
    {!retry && <LoaderCircle className="animate-spin" size={24} aria-hidden="true" />}
    <h2>{label}</h2>
    {retry && <>
      <p>Le reste de votre espace reste accessible. Réessayez après avoir vérifié votre connexion.</p>
      <Button variant="outline" onClick={retry}>Réessayer le chargement</Button>
      {persisted ? <>
        <p>Si l’erreur persiste, rechargez la page. Votre espace enregistré sera repris ; l’historique et les saisies non appliquées seront perdus.</p>
        <Button variant="ghost" onClick={() => window.location.reload()}>Recharger la page</Button>
      </> : <p>Un rechargement peut être nécessaire. Exportez d’abord vos changements : ceux de cette session ne sont pas enregistrés.</p>}
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
  const [selection, setSelection] = useState<string[]>(['desk-04'])
  const [spatialView, setSpatialView] = useState<SpatialView>('3d')
  const [editing, setEditing] = useState(false)
  const [activeRoomId, setActiveRoomId] = useState('plateau-a')
  const [organizing, setOrganizing] = useState(false)
  const [managerRequested, setManagerRequested] = useState(false)
  const [roomError, setRoomError] = useState<string | null>(null)
  const inventory = useInventory()
  const workspaceStore = useWorkspaceDocument()
  const workspace = workspaceStore.workspace
  const activeRoom = workspace.rooms.find((room) => room.plan.id === activeRoomId) || workspace.rooms[0]!
  const plan = activeRoom.plan
  const { undo, redo } = workspaceStore
  const planStore = { ...workspaceStore, plan, replace: (next: SpatialPlan) => {
    try {
      const result = workspaceStore.replaceRoom(plan.id, prepareRoomReplacement(workspace, plan.id, next))
      setRoomError(null); return result
    } catch (error) { setRoomError(error instanceof Error ? error.message : 'Le plan ne peut pas être appliqué à cette salle.'); return false }
  } }
  const floorName = workspaceStore.workspace.floors.find((floor) => floor.id === activeRoom.floorId)!.name
  const selectedIds = selection.filter((id) => [...plan.workstations, ...plan.furniture].some((item) => item.id === id))
  const selectedWorkstationId = selectedIds.at(-1) || null
  function setSelectedWorkstationId(id: string | null) { setSelection(id ? [id] : []) }
  const selectedFurniture = plan.furniture.find((item) => item.id === selectedWorkstationId)

  useEffect(() => {
    if (tab !== 'spaces' || !editing) return
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
  }, [tab, editing, undo, redo])
  const locationStore = useLocalLocations()
  const local = {
    ...locationStore,
    associate(id: number, workstationId: string | null) {
      const target = workstationId ? findWorkspaceStation(workspace, workstationId) : undefined
      if (workstationId && !target) return
      locationStore.associate(id, workstationId)
      if (id === selectedAssetId && workstationId && target) { setActiveRoomId(target.room.plan.id); setSelectedWorkstationId(workstationId) }
    },
  }
  const localizedCounts = Object.fromEntries(
    plan.workstations.map((station) => [
      station.id,
      getWorkstationAssetIds(local.locations, station.id).length,
    ]),
  )

  useEffect(() => {
    const update = () => {
      if (window.location.hash === '#inventory' || window.location.hash === '#spaces')
        setTab(currentTab())
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  function navigate(next: WorkspaceTab) {
    setTab(next)
    window.location.hash = next
  }

  function selectAsset(id: number | null) {
    setSelectedAssetId(id)
    if (id !== null) {
      const workstationId = local.locations[id]
      const target = workstationId ? findWorkspaceStation(workspace, workstationId) : undefined
      if (target) { setActiveRoomId(target.room.plan.id); setSelectedWorkstationId(target.station.id) }
    }
  }

  function selectWorkstation(id: string | null, additive = false, preserve = false) {
    setSelection((current) => id ? selectIds(current, id, additive, preserve) : [])
    setSelectedAssetId(null)
  }

  function showInPlan(id: number) {
    const target = findWorkspaceStation(workspace, local.locations[id] || null)
    if (!target) return
    setActiveRoomId(target.room.plan.id)
    setSelectedWorkstationId(target.station.id)
    setSelectedAssetId(id)
    navigate('spaces')
  }

  function selectRoom(id: string) {
    setActiveRoomId(id); setSelection([]); setSelectedAssetId(null); setRoomError(null)
    navigate('spaces')
  }

  return (
    <AppShell tab={tab} onTabChange={navigate} workspace={workspace} activeRoomId={plan.id} onRoomChange={selectRoom} onManageSpaces={() => { setManagerRequested(true); setOrganizing(true) }}>
      {managerRequested && <LazyPanel
        load={loadWorkspaceManager}
        panelProps={{ open: organizing, onOpenChange: setOrganizing, workspace, activeRoomId: plan.id, onSelectRoom: selectRoom, onChange: workspaceStore.replace, persisted: workspaceStore.persisted, history: workspaceStore }}
        loading={<ManagerStatus open={organizing} onOpenChange={setOrganizing} persisted={workspaceStore.persisted} />}
        failure={(retry) => <ManagerStatus open={organizing} onOpenChange={setOrganizing} retry={retry} persisted={workspaceStore.persisted} />}
      />}
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            {tab === 'spaces' ? `ESPACE LOCAL / ${floorName.toLocaleUpperCase('fr')}` : 'PARC INFORMATIQUE'}
          </p>
          <h1>{tab === 'spaces' ? plan.name : 'Matériel'}</h1>
          <p className="workspace-description">
            {tab === 'spaces'
              ? 'Votre matériel, dans son environnement.'
              : 'Une vue commune sur tous vos équipements.'}
          </p>
        </div>
        <Badge variant="outline">{tab === 'spaces' ? (planStore.persisted ? 'Plan local' : 'Plan de session') : 'Inventaire'}</Badge>
      </div>
      {tab === 'spaces' && (planStore.warning || roomError) && <p className="storage-warning px-8 pb-4" role="alert">{roomError || planStore.warning}</p>}
      {tab === 'inventory' ? (
        <LazyPanel
          load={loadInventoryPanel}
          loading={<PanelStatus label="Préparation de l’inventaire…" />}
          failure={(retry) => <PanelStatus label="L’inventaire n’a pas pu être chargé." retry={retry} persisted={workspaceStore.persisted} />}
          panelProps={{
            inventory,
            selectedAssetId,
            onSelect: selectAsset,
            locationLabel: (id) => {
              const target = findWorkspaceStation(workspace, local.locations[id] || null)
              return target ? `${target.station.label} · ${target.room.plan.name} · ${target.floor.name}` : local.locations[id] ? 'Poste absent des salles' : 'Non localisé'
            },
            renderAssetActions: (asset) => (
              <AssetLocationActions asset={asset} local={local} onShowInPlan={showInPlan} plan={plan} workspace={workspace} />
            ),
          }}
        />
      ) : (
        <SpatialViewer
          key={plan.id}
          plan={plan}
          history={planStore}
          editing={editing}
          onEditingChange={(value) => { setEditing(value); setSelectedAssetId(null) }}
          onMove={(id, x, z) => {
            planStore.replace(translateSelection(plan, selectedIds.includes(id) ? selectedIds : [id], id, x, z, false))
          }}
          view={spatialView}
          onViewChange={setSpatialView}
          selectedWorkstationId={selectedWorkstationId}
          selectedIds={selectedIds}
          onSelectionChange={(ids) => { setSelection(ids); setSelectedAssetId(null) }}
          onSelectWorkstation={selectWorkstation}
          localizedCounts={localizedCounts}
          inspector={
            editing ? <LazyPanel
              key={plan.id}
              load={loadWorkstationEditor}
              panelProps={{ plan, persisted: planStore.persisted, selectedId: selectedWorkstationId, selectedIds, onChange: planStore.replace, onSelect: selectWorkstation, onSelectionChange: setSelection, workspace, onWorkspaceChange: workspaceStore.replace, onSelectionMoved: (roomId, ids) => { setActiveRoomId(roomId); setSelection(ids); setSelectedAssetId(null) } }}
              loading={<aside className="asset-inspector plan-editor" aria-label="Chargement de l’éditeur"><PanelStatus label="Préparation de l’atelier…" /></aside>}
              failure={(retry) => <aside className="asset-inspector plan-editor" aria-label="Éditeur indisponible"><PanelStatus label="L’atelier n’a pas pu être chargé." retry={retry} persisted={workspaceStore.persisted} /></aside>}
            /> :
            selectedFurniture ? <aside className="asset-inspector" aria-label="Fiche du mobilier"><FurnitureSummary item={selectedFurniture} /></aside> : <SpatialInspector
              plan={plan}
              workspace={workspace}
              selectedWorkstationId={selectedWorkstationId}
              selectedAssetId={selectedAssetId}
              onSelectAsset={selectAsset}
              onOpenInventory={() => navigate('inventory')}
              onShowInPlan={showInPlan}
              inventory={inventory}
              local={local}
            />
          }
        />
      )}
    </AppShell>
  )
}

export default App
