import { useEffect, useState } from 'react'
import { Boxes, Grid2X2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { AppShell, type WorkspaceTab } from '@/components/app-shell'

function currentTab(): WorkspaceTab {
  return window.location.hash === '#inventory' ? 'inventory' : 'spaces'
}

function App() {
  const [tab, setTab] = useState<WorkspaceTab>(currentTab)

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
        <Badge variant="outline">Atelier spatial</Badge>
      </div>
      <section className="foundation-stage" aria-label={tab === 'spaces' ? 'Espace d’exploration' : 'Inventaire'}>
        <div className="foundation-intro">
          <span className="foundation-icon">{tab === 'spaces' ? <Grid2X2 size={30} strokeWidth={1.2} /> : <Boxes size={30} strokeWidth={1.2} />}</span>
          <p className="eyebrow">{tab === 'spaces' ? 'VOTRE ESPACE DE TRAVAIL' : 'VOTRE INVENTAIRE'}</p>
          <h2>{tab === 'spaces' ? 'Le parc prend forme.' : 'Chaque équipement compte.'}</h2>
          <p>{tab === 'spaces' ? 'Un point de vue partagé sur vos espaces, vos postes et votre matériel.' : 'L’inventaire regroupera les informations de votre matériel et son état.'}</p>
        </div>
        <span className="stage-caption">SENTINEL / ATELIER SPATIAL</span>
      </section>
    </AppShell>
  )
}

export default App
