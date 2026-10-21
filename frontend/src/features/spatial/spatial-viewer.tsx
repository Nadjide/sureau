import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'
import { Box, Grid2X2, LoaderCircle, Magnet, MousePointer2, Pencil, Redo2, RotateCcw, Undo2 } from 'lucide-react'
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
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }
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
  history,
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
  const dense = plan.workstations.length + plan.furniture.length > 16

  function selectWorkstation(id: string) {
    setSelected(id)
    if (view === '3d' && !editing) setFocusToken((value) => value + 1)
  }

  function changeView(next: SpatialView) {
    if (next !== '3d') setFocusToken(0)
    setView(next)
  }

  return (
    <div className="spatial-layout">
      <section className="spatial-workspace" aria-label={`Exploration de ${plan.name}`}>
        <div className="spatial-toolbar">
          <div className="view-switch" role="group" aria-label="Mode de représentation">
            <button
              className={view === '3d' ? 'is-active' : ''}
              aria-pressed={view === '3d'}
              onClick={() => changeView('3d')}
            >
              <Box size={14} />
              Vue 3D
            </button>
            <button
              className={view === '2d' ? 'is-active' : ''}
              aria-pressed={view === '2d'}
              onClick={() => changeView('2d')}
            >
              <Grid2X2 size={14} />
              Plan 2D
            </button>
          </div>
          <span className="spatial-local-label">Votre plan · dans ce navigateur</span>
          <Button variant={editing ? 'default' : 'outline'} aria-pressed={editing} onClick={() => onEditingChange(!editing)}><Pencil />{editing ? 'Terminer' : 'Modifier'}</Button>
          {editing && <Button variant={snap ? 'secondary' : 'outline'} size="icon" aria-label="Aimantation à la grille de 25 cm" aria-pressed={snap} onClick={() => setSnap(!snap)} title="Aimantation à la grille de 25 cm"><Magnet /></Button>}
          {editing && <div className="editor-history" role="group" aria-label="Historique du plan">
            <Button variant="outline" size="icon" aria-label="Annuler la dernière modification" title="Annuler · Ctrl / ⌘ Z" disabled={!history.canUndo} onClick={history.undo}><Undo2 /></Button>
            <Button variant="outline" size="icon" aria-label="Rétablir la modification" title="Rétablir · Ctrl / ⌘ Maj Z" disabled={!history.canRedo} onClick={history.redo}><Redo2 /></Button>
          </div>}
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              if (sceneFailed) {
                setFocusToken(0)
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
              onFallback={() => changeView('2d')}
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
            {editing ? (view === '3d' ? 'Glisser un objet pour le déplacer · Échap pour annuler' : 'Glisser un objet · flèches au clavier · Échap pour annuler') : view === '3d'
              ? 'Cliquer pour approcher · glisser pour tourner · molette pour zoomer'
              : 'Sélectionner un objet · Tab puis Entrée au clavier'}
          </div>
          <span className="scene-plan-mark" aria-hidden="true">
            {plan.name.toLocaleUpperCase('fr')}
          </span>
        </div>
        {dense && <p className="dense-plan-note">Les repères numérotés correspondent aux listes des objets.</p>}
        <div className={`workstation-strip${dense ? ' is-dense' : ''}`} role="group" aria-label="Sélectionner un poste">
          {plan.workstations.map((item, index) => (
            <button
              key={item.id}
              aria-pressed={selected === item.id}
              className={selected === item.id ? 'is-selected' : ''}
              title={dense ? `${index + 1}. ${item.label}` : item.label}
              onClick={() => selectWorkstation(item.id)}
            >
              {dense && <span className="workstation-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}.</span>}
              <span className="workstation-label">{item.label}</span>
              {!!localizedCounts[item.id] && (
                <span className="desk-asset-count">{localizedCounts[item.id]}</span>
              )}
            </button>
          ))}
        </div>
        <div className="spatial-caption">
          <span>
            <span className="local-indicator" />
            {plan.workstations.length} postes · {plan.furniture.length} meubles
          </span>
          <span>
            {plan.width} × {plan.depth} m
          </span>
        </div>
        {plan.furniture.length > 0 && <div className="furniture-strip" role="group" aria-label="Sélectionner un meuble">
          {plan.furniture.map((item, index) => <button key={item.id} aria-pressed={selected === item.id} title={item.label} onClick={() => selectWorkstation(item.id)}>{dense && <span aria-hidden="true">{String(plan.workstations.length + index + 1).padStart(2, '0')}. </span>}{item.label}</button>)}
        </div>}
      </section>
      {inspector}
    </div>
  )
}
