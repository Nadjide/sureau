import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Box, Grid2X2, LoaderCircle, Magnet, MousePointer2, Pencil, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { SpatialView, SpatialPlan } from './room-model'
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
  plan: SpatialPlan
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onMove: (id: string, x: number, z: number) => void
  view: SpatialView
  onViewChange: (view: SpatialView) => void
  selectedWorkstationId: string | null
  onSelectWorkstation: (id: string) => void
  inspector: ReactNode
  localizedCounts: Readonly<Record<string, number>>
}

export function SpatialViewer({
  plan,
  editing,
  onEditingChange,
  onMove,
  view,
  onViewChange: setView,
  selectedWorkstationId: selected,
  onSelectWorkstation: setSelected,
  inspector,
  localizedCounts,
}: Props) {
  const [resetToken, setResetToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)
  const [retryToken, setRetryToken] = useState(0)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [snap, setSnap] = useState(true)
  const dark = useSyncExternalStore(subscribeTheme, getTheme)

  function selectWorkstation(id: string) {
    setSelected(id)
    if (view === '3d' && !editing) setFocusToken((value) => value + 1)
  }

  return (
    <div className="spatial-layout">
      <section className="spatial-workspace" aria-label={`Exploration de ${plan.name}`}>
        <div className="spatial-toolbar">
          <div className="view-switch" role="group" aria-label="Mode de représentation">
            <button
              className={view === '3d' ? 'is-active' : ''}
              aria-pressed={view === '3d'}
              onClick={() => setView('3d')}
            >
              <Box size={14} />
              Vue 3D
            </button>
            <button
              className={view === '2d' ? 'is-active' : ''}
              aria-pressed={view === '2d'}
              onClick={() => setView('2d')}
            >
              <Grid2X2 size={14} />
              Plan 2D
            </button>
          </div>
          <span className="spatial-local-label">Votre plan · dans ce navigateur</span>
          <Button variant={editing ? 'default' : 'outline'} aria-pressed={editing} onClick={() => onEditingChange(!editing)}><Pencil />{editing ? 'Terminer' : 'Modifier'}</Button>
          {editing && <Button variant={snap ? 'secondary' : 'outline'} size="icon" aria-label="Aimantation à la grille de 25 cm" aria-pressed={snap} onClick={() => setSnap(!snap)} title="Aimantation à la grille de 25 cm"><Magnet /></Button>}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (sceneFailed) {
                setRetryToken((value) => value + 1)
                setSceneFailed(false)
              } else setResetToken((value) => value + 1)
            }}
            disabled={view === '2d'}
            aria-label={sceneFailed ? 'Réessayer la vue 3D' : 'Recentrer la vue 3D'}
          >
            <RotateCcw />
          </Button>
        </div>
        <div className="spatial-stage">
          {view === '2d' ? (
            <RoomPlan plan={plan} editing={editing} snap={snap} onMove={onMove} selectedWorkstationId={selected} onSelect={selectWorkstation} />
          ) : (
            <SceneBoundary
              key={retryToken}
              onFailure={() => setSceneFailed(true)}
              onFallback={() => setView('2d')}
            >
              <Suspense
                fallback={
                  <div className="scene-loading" role="status">
                    <LoaderCircle className="animate-spin" size={24} />
                    <span>Préparation de votre espace…</span>
                  </div>
                }
              >
                <RoomScene
                  plan={plan}
                  editing={editing}
                  snap={snap}
                  onMove={onMove}
                  selectedWorkstationId={selected}
                  onSelect={selectWorkstation}
                  resetToken={resetToken}
                  focusToken={focusToken}
                  dark={dark}
                  localizedCounts={localizedCounts}
                />
              </Suspense>
            </SceneBoundary>
          )}
          <div className="scene-instructions">
            <MousePointer2 size={12} aria-hidden="true" />
            {editing ? (view === '3d' ? 'Glisser un poste pour le déplacer · Échap pour annuler' : 'Glisser un poste · flèches au clavier · Échap pour annuler') : view === '3d'
              ? 'Cliquer pour approcher · glisser pour tourner · molette pour zoomer'
              : 'Sélectionner un poste · Tab puis Entrée au clavier'}
          </div>
          <span className="scene-plan-mark" aria-hidden="true">
            {plan.name.toLocaleUpperCase('fr')}
          </span>
        </div>
        <div className="workstation-strip" role="group" aria-label="Sélectionner un poste">
          {plan.workstations.map((item) => (
            <button
              key={item.id}
              aria-pressed={selected === item.id}
              className={selected === item.id ? 'is-selected' : ''}
              onClick={() => selectWorkstation(item.id)}
            >
              {item.label}
              {!!localizedCounts[item.id] && (
                <span className="desk-asset-count">{localizedCounts[item.id]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="spatial-caption">
          <span>
            <span className="local-indicator" />
            Mobilier du plan · {plan.workstations.length} postes
          </span>
          <span>
            {plan.width} × {plan.depth} m
          </span>
        </div>
      </section>
      {inspector}
    </div>
  )
}
