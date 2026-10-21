import { lazy, Suspense, useState, useSyncExternalStore } from 'react'
import { Armchair, Box, Grid2X2, LoaderCircle, Maximize2, MousePointer2, RotateCcw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { findWorkstation, room, workstations, type SpatialView } from './room-model'
import { RoomPlan } from './room-plan'
import { SceneBoundary } from './scene-boundary'

const RoomScene = lazy(() => import('./room-scene'))

function subscribeTheme(callback: () => void) {
  const observer = new MutationObserver(callback)
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
  return () => observer.disconnect()
}
const getTheme = () => document.documentElement.classList.contains('dark')

interface Props {
  view: SpatialView
  onViewChange: (view: SpatialView) => void
  selectedWorkstationId: string | null
  onSelectWorkstation: (id: string) => void
}

export function SpatialViewer({ view, onViewChange: setView, selectedWorkstationId: selected, onSelectWorkstation: setSelected }: Props) {
  const [resetToken, setResetToken] = useState(0)
  const [retryToken, setRetryToken] = useState(0)
  const [sceneFailed, setSceneFailed] = useState(false)
  const dark = useSyncExternalStore(subscribeTheme, getTheme)
  const station = findWorkstation(selected)

  return (
    <div className="spatial-layout">
      <section className="spatial-workspace" aria-label="Exploration du Plateau A">
        <div className="spatial-toolbar">
          <div className="view-switch" role="group" aria-label="Mode de représentation"><button className={view === '3d' ? 'is-active' : ''} aria-pressed={view === '3d'} onClick={() => setView('3d')}><Box size={14} />Vue 3D</button><button className={view === '2d' ? 'is-active' : ''} aria-pressed={view === '2d'} onClick={() => setView('2d')}><Grid2X2 size={14} />Plan 2D</button></div>
          <span className="spatial-local-label">Plan d’exemple local</span>
          <Button variant="outline" size="icon" onClick={() => { if (sceneFailed) { setRetryToken(value => value + 1); setSceneFailed(false) } else setResetToken(value => value + 1) }} disabled={view === '2d'} aria-label={sceneFailed ? 'Réessayer la vue 3D' : 'Recentrer la vue 3D'}><RotateCcw /></Button>
        </div>
        <div className="spatial-stage">
          {view === '2d' ? <RoomPlan selectedWorkstationId={selected} onSelect={setSelected} /> : <SceneBoundary key={retryToken} onFailure={() => setSceneFailed(true)} onFallback={() => setView('2d')}><Suspense fallback={<div className="scene-loading" role="status"><LoaderCircle className="animate-spin" size={24} /><span>Préparation de votre espace…</span></div>}><RoomScene selectedWorkstationId={selected} onSelect={setSelected} resetToken={resetToken} dark={dark} /></Suspense></SceneBoundary>}
          <div className="scene-instructions"><MousePointer2 size={12} aria-hidden="true" />{view === '3d' ? 'Glisser pour tourner · molette pour zoomer' : 'Sélectionner un poste · Tab puis Entrée au clavier'}</div>
          <span className="scene-plan-mark" aria-hidden="true">PLATEAU A</span>
        </div>
        <div className="workstation-strip" role="group" aria-label="Sélectionner un poste">{workstations.map(item => <button key={item.id} aria-pressed={selected === item.id} className={selected === item.id ? 'is-selected' : ''} onClick={() => setSelected(item.id)}>{item.label}</button>)}</div>
        <div className="spatial-caption"><span><span className="local-indicator" />Mobilier illustratif · {workstations.length} postes</span><span>{room.width} × {room.depth} m</span></div>
      </section>
      <aside className="asset-inspector workstation-inspector" aria-label="Fiche du poste">
        <p className="eyebrow">IMPLANTATION LOCALE</p><div className="inspector-hero"><Armchair size={34} strokeWidth={1.3} /></div>
        <p className="asset-tag">{station?.id.toUpperCase().replace('DESK', 'POSTE') || 'POSTE'}</p><h2>{station?.label || 'Sélectionnez un poste'}</h2><Badge variant="secondary">Mobilier d’exemple</Badge>
        <dl className="asset-specs mt-6"><div><dt>Salle</dt><dd>{room.name}</dd></div><div><dt>Bureau</dt><dd>200 × 100 cm</dd></div><div><dt>Position</dt><dd>{station ? `${station.position[0].toFixed(2)} / ${station.position[2].toFixed(2)} m` : '—'}</dd></div></dl>
        <div className="local-explanation"><Maximize2 size={16} aria-hidden="true" /><p>Ce plan illustre une implantation. Les objets représentés ne sont pas encore reliés à votre inventaire.</p></div>
      </aside>
    </div>
  )
}
