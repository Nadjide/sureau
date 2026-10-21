import { useEffect, useState } from 'react'
import { Grid2X2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'
import { InventoryPanel } from '@/features/inventory/inventory-panel'
import { useInventory } from '@/features/inventory/use-inventory'

function currentTab(): WorkspaceTab {
  return window.location.hash === '#inventory' ? 'inventory' : 'spaces'
}

function App() {
  const [tab, setTab] = useState<WorkspaceTab>(currentTab)
  const [selectedAssetId, setSelectedAssetId] = useState<number | null>(null)
  const inventory = useInventory()

  useEffect(() => {
    const update = () => {
      if (window.location.hash === '#inventory' || window.location.hash === '#spaces') setTab(currentTab())
    }
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])

  function navigate(next: WorkspaceTab) {
    setTab(next)
    window.location.hash = next
  }

  return (
    <AppShell tab={tab} onTabChange={navigate}>
      <div className="workspace-heading">
        <div>
          <p className="eyebrow">{tab === 'spaces' ? 'ESPACE LOCAL / ÉTAGE 1' : 'PARC INFORMATIQUE'}</p>
          <h1>{tab === 'spaces' ? 'Plateau A' : 'Matériel'}</h1>
          <p className="workspace-description">{tab === 'spaces' ? 'Votre matériel, dans son environnement.' : 'Une vue commune sur tous vos équipements.'}</p>
        </div>
        <Badge variant="outline">{tab === 'spaces' ? 'Atelier spatial' : 'Lecture seule'}</Badge>
      </div>
      {tab === 'inventory' ? <InventoryPanel inventory={inventory} selectedAssetId={selectedAssetId} onSelect={setSelectedAssetId} /> : <section className="foundation-stage" aria-label="Espace d’exploration">
        <div className="foundation-intro">
          <span className="foundation-icon"><Grid2X2 size={30} strokeWidth={1.2} /></span>
          <p className="eyebrow">VOTRE ESPACE DE TRAVAIL</p>
          <h2>Le parc prend forme.</h2>
          <p>Un point de vue partagé sur vos espaces, vos postes et votre matériel.</p>
        </div>
        <span className="stage-caption">SENTINEL / ATELIER SPATIAL</span>
      </section>}
    </AppShell>
  )
}

export default App
