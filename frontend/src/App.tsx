import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'
import { InventoryPanel } from '@/features/inventory/inventory-panel'
import { useInventory } from '@/features/inventory/use-inventory'
import { SpatialViewer } from '@/features/spatial/spatial-viewer'
import { findWorkstation, type SpatialView } from '@/features/spatial/room-model'
import { useLocalLocations } from '@/features/spatial/use-local-locations'
import { getWorkstationAssetIds } from '@/features/spatial/local-locations'
import { AssetLocationActions } from '@/features/spatial/asset-location-actions'
import { SpatialInspector } from '@/features/spatial/spatial-inspector'
import { usePlanDocument } from '@/features/spatial/use-plan-document'
import { WorkstationEditor } from '@/features/spatial/workstation-editor'
import { clampWorkstation } from '@/features/spatial/plan-geometry'

function currentTab(): WorkspaceTab {
  return window.location.hash === '#inventory' ? 'inventory' : 'spaces'
}

function App() {
  const [tab, setTab] = useState<WorkspaceTab>(currentTab)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [selectedWorkstationId, setSelectedWorkstationId] = useState<string | null>('desk-04')
  const [spatialView, setSpatialView] = useState<SpatialView>('3d')
  const [editing, setEditing] = useState(false)
  const inventory = useInventory()
  const planStore = usePlanDocument()
  const { plan, undo, redo } = planStore

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
      if (workstationId && !findWorkstation(workstationId, plan.workstations)) return
      locationStore.associate(id, workstationId)
      if (id === selectedAssetId && workstationId) setSelectedWorkstationId(workstationId)
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
      if (workstationId) setSelectedWorkstationId(workstationId)
    }
  }

  function selectWorkstation(id: string | null) {
    setSelectedWorkstationId(id)
    setSelectedAssetId(null)
  }

  function showInPlan(id: number) {
    if (!local.locations[id] || !findWorkstation(local.locations[id], plan.workstations)) return
    setSelectedWorkstationId(local.locations[id])
    setSelectedAssetId(id)
    navigate('spaces')
  }

  return (
    <AppShell tab={tab} onTabChange={navigate} planName={plan.name}>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            {tab === 'spaces' ? 'ESPACE LOCAL / ÉTAGE 1' : 'PARC INFORMATIQUE'}
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
      {tab === 'spaces' && planStore.warning && <p className="storage-warning px-8 pb-4" role="alert">{planStore.warning}</p>}
      {tab === 'inventory' ? (
        <InventoryPanel
          inventory={inventory}
          selectedAssetId={selectedAssetId}
          onSelect={selectAsset}
          locationLabel={(id) =>
            findWorkstation(local.locations[id] || null, plan.workstations)?.label || (local.locations[id] ? 'Poste absent du plan' : 'Non localisé')
          }
          renderAssetActions={(asset) => (
            <AssetLocationActions asset={asset} local={local} onShowInPlan={showInPlan} plan={plan} />
          )}
        />
      ) : (
        <SpatialViewer
          plan={plan}
          history={planStore}
          editing={editing}
          onEditingChange={(value) => { setEditing(value); setSelectedAssetId(null) }}
          onMove={(id, x, z) => {
            const station = findWorkstation(id, plan.workstations)
            if (!station) return
            const moved = clampWorkstation(plan, { ...station, position: [x, 0, z] })
            planStore.replace({ ...plan, workstations: plan.workstations.map((item) => item.id === id ? moved : item) })
          }}
          view={spatialView}
          onViewChange={setSpatialView}
          selectedWorkstationId={selectedWorkstationId}
          onSelectWorkstation={selectWorkstation}
          localizedCounts={localizedCounts}
          inspector={
            editing ? <WorkstationEditor plan={plan} selectedId={selectedWorkstationId} onChange={planStore.replace} onSelect={selectWorkstation} /> :
            <SpatialInspector
              plan={plan}
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
