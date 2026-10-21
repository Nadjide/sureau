import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'
import { InventoryPanel } from '@/features/inventory/inventory-panel'
import { useInventory } from '@/features/inventory/use-inventory'
import { SpatialViewer } from '@/features/spatial/spatial-viewer'
import { findWorkstation, workstations, type SpatialView } from '@/features/spatial/room-model'
import { useLocalLocations } from '@/features/spatial/use-local-locations'
import { getWorkstationAssetIds } from '@/features/spatial/local-locations'
import { AssetLocationActions } from '@/features/spatial/asset-location-actions'
import { SpatialInspector } from '@/features/spatial/spatial-inspector'

function currentTab(): WorkspaceTab {
  return window.location.hash === '#inventory' ? 'inventory' : 'spaces'
}

function App() {
  const [tab, setTab] = useState<WorkspaceTab>(currentTab)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const [selectedWorkstationId, setSelectedWorkstationId] = useState<string | null>('desk-04')
  const [spatialView, setSpatialView] = useState<SpatialView>('3d')
  const inventory = useInventory()
  const locationStore = useLocalLocations()
  const local = {
    ...locationStore,
    associate(id: number, workstationId: string | null) {
      locationStore.associate(id, workstationId)
      if (id === selectedAssetId && workstationId) setSelectedWorkstationId(workstationId)
    },
  }
  const localizedCounts = Object.fromEntries(
    workstations.map((station) => [
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

  function selectWorkstation(id: string) {
    setSelectedWorkstationId(id)
    setSelectedAssetId(null)
  }

  function showInPlan(id: number) {
    if (!local.locations[id]) return
    setSelectedWorkstationId(local.locations[id])
    setSelectedAssetId(id)
    navigate('spaces')
  }

  return (
    <AppShell tab={tab} onTabChange={navigate}>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">
            {tab === 'spaces' ? 'ESPACE LOCAL / ÉTAGE 1' : 'PARC INFORMATIQUE'}
          </p>
          <h1>{tab === 'spaces' ? 'Plateau A' : 'Matériel'}</h1>
          <p className="workspace-description">
            {tab === 'spaces'
              ? 'Votre matériel, dans son environnement.'
              : 'Une vue commune sur tous vos équipements.'}
          </p>
        </div>
        <Badge variant="outline">{tab === 'spaces' ? 'Plan local' : 'Inventaire'}</Badge>
      </div>
      {tab === 'inventory' ? (
        <InventoryPanel
          inventory={inventory}
          selectedAssetId={selectedAssetId}
          onSelect={selectAsset}
          locationLabel={(id) =>
            findWorkstation(local.locations[id] || null)?.label || 'Non localisé'
          }
          renderAssetActions={(asset) => (
            <AssetLocationActions asset={asset} local={local} onShowInPlan={showInPlan} />
          )}
        />
      ) : (
        <SpatialViewer
          view={spatialView}
          onViewChange={setSpatialView}
          selectedWorkstationId={selectedWorkstationId}
          onSelectWorkstation={selectWorkstation}
          localizedCounts={localizedCounts}
          inspector={
            <SpatialInspector
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
