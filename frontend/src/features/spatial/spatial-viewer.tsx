import { lazy, Suspense, useState, useSyncExternalStore, type ReactNode } from 'react'
import {
  Box,
  Grid2X2,
  LoaderCircle,
  Magnet,
  MousePointer2,
  Pencil,
  Redo2,
  RotateCcw,
  Undo2,
  ListChecks,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural, t } from '@/lib/i18n'
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
  canEdit?: boolean
  persisted?: boolean
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onMove: (id: string, x: number, z: number) => void
  history: { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void }
  view: SpatialView
  onViewChange: (view: SpatialView) => void
  selectedWorkstationId: string | null
  selectedIds: readonly string[]
  onSelectionChange: (ids: string[]) => void
  onSelectWorkstation: (id: string, additive?: boolean, preserve?: boolean) => void
  inspector: ReactNode
  localizedCounts: Readonly<Record<string, number>>
}

export function SpatialViewer({
  plan,
  canEdit = true,
  persisted = false,
  editing,
  onEditingChange,
  onMove,
  history,
  view,
  onViewChange: setView,
  selectedWorkstationId: selected,
  selectedIds,
  onSelectionChange,
  onSelectWorkstation: setSelected,
  inspector,
  localizedCounts,
}: Props) {
  const [resetToken, setResetToken] = useState(0)
  const [focusToken, setFocusToken] = useState(0)
  const [retryToken, setRetryToken] = useState(0)
  const [sceneFailed, setSceneFailed] = useState(false)
  const [snap, setSnap] = useState(true)
  const [multipleMode, setMultipleMode] = useState(false)
  const dark = useSyncExternalStore(subscribeTheme, getTheme, () => false)
  const effectiveEditing = editing && canEdit
  const dense = plan.workstations.length + plan.furniture.length > 16

  function selectWorkstation(id: string, additive = false, preserve = false) {
    setSelected(id, effectiveEditing && (additive || multipleMode), preserve)
    if (view === '3d' && !effectiveEditing) setFocusToken((value) => value + 1)
  }

  function move(id: string, x: number, z: number) {
    if (effectiveEditing) onMove(id, x, z)
  }

  function changeView(next: SpatialView) {
    if (next !== '3d') setFocusToken(0)
    setView(next)
  }

  return (
    <div className="spatial-layout">
      <section className="spatial-workspace" aria-label={t('Exploration de {name}', { name: plan.name })}>
        <div className="spatial-toolbar">
          <div className="view-switch" role="group" aria-label={t('Mode de représentation')}>
            <button
              className={view === '3d' ? 'is-active' : ''}
              aria-pressed={view === '3d'}
              onClick={() => changeView('3d')}
            >
              <Box size={14} />
              {t('Vue 3D')}
            </button>
            <button
              className={view === '2d' ? 'is-active' : ''}
              aria-pressed={view === '2d'}
              onClick={() => changeView('2d')}
            >
              <Grid2X2 size={14} />
              {t('Plan 2D')}
            </button>
          </div>
          <span className="spatial-local-label">
            {persisted ? t('Version enregistrée sur le serveur') : t('Brouillon · enregistrer pour partager')}
          </span>
          {(canEdit || editing) && (
            <Button
              variant={editing ? 'default' : 'outline'}
              aria-pressed={editing}
              onClick={() => {
                if (editing || canEdit) onEditingChange(!editing)
              }}
            >
              <Pencil />
              {editing ? t('Terminer') : t('Modifier')}
            </Button>
          )}
          {effectiveEditing && (
            <Button
              variant={snap ? 'secondary' : 'outline'}
              size="icon"
              aria-label={t('Aimantation à la grille de 25 cm')}
              aria-pressed={snap}
              onClick={() => setSnap(!snap)}
              title={t('Aimantation à la grille de 25 cm')}
            >
              <Magnet />
            </Button>
          )}
          {effectiveEditing && (
            <Button
              variant={multipleMode ? 'secondary' : 'outline'}
              aria-pressed={multipleMode}
              onClick={() => setMultipleMode(!multipleMode)}
            >
              <ListChecks />
              {t('Sélection multiple')}
            </Button>
          )}
          {effectiveEditing && (
            <div className="editor-history" role="group" aria-label={t('Historique du plan')}>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('Annuler la dernière modification')}
                title={t('Annuler · Ctrl / ⌘ Z')}
                disabled={!history.canUndo}
                onClick={() => {
                  if (canEdit) history.undo()
                }}
              >
                <Undo2 />
              </Button>
              <Button
                variant="outline"
                size="icon"
                aria-label={t('Rétablir la modification')}
                title={t('Rétablir · Ctrl / ⌘ Maj Z')}
                disabled={!history.canRedo}
                onClick={() => {
                  if (canEdit) history.redo()
                }}
              >
                <Redo2 />
              </Button>
            </div>
          )}
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
            aria-label={sceneFailed ? t('Réessayer la vue 3D') : t('Recentrer la vue 3D')}
          >
            <RotateCcw />
          </Button>
        </div>
        <div className="spatial-stage">
          {view === '2d' ? (
            <RoomPlan
              plan={plan}
              editing={effectiveEditing}
              canEdit={canEdit}
              snap={snap}
              onMove={move}
              selectedWorkstationId={selected}
              selectedIds={selectedIds}
              multipleMode={effectiveEditing && multipleMode}
              onSelect={selectWorkstation}
            />
          ) : (
            <SceneBoundary key={retryToken} onFailure={() => setSceneFailed(true)} onFallback={() => changeView('2d')}>
              <Suspense
                fallback={
                  <div className="scene-loading" role="status">
                    <LoaderCircle className="animate-spin" size={24} />
                    <span>{t('Préparation de votre espace…')}</span>
                  </div>
                }
              >
                <RoomScene
                  plan={plan}
                  editing={effectiveEditing}
                  snap={snap}
                  onMove={move}
                  selectedWorkstationId={selected}
                  selectedIds={selectedIds}
                  multipleMode={effectiveEditing && multipleMode}
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
            {effectiveEditing
              ? view === '3d'
                ? t('Glisser un objet pour le déplacer · Échap pour annuler')
                : t('Glisser un objet · flèches au clavier · Échap pour annuler')
              : view === '3d'
                ? t('Cliquer pour approcher · glisser pour tourner · molette pour zoomer')
                : t('Sélectionner un objet · Tab puis Entrée au clavier')}
          </div>
          <span className="scene-plan-mark" aria-hidden="true">
            {plan.name.toLocaleUpperCase()}
          </span>
        </div>
        {dense && <p className="dense-plan-note">{t('Les repères numérotés correspondent aux listes des objets.')}</p>}
        <div
          className={`workstation-strip${dense ? ' is-dense' : ''}`}
          role="group"
          aria-label={t('Sélectionner un poste')}
        >
          {plan.workstations.map((item, index) => (
            <button
              key={item.id}
              aria-pressed={selectedIds.includes(item.id)}
              className={selectedIds.includes(item.id) ? 'is-selected' : ''}
              title={dense ? `${index + 1}. ${item.label}` : item.label}
              onClick={(event) => selectWorkstation(item.id, event.shiftKey || event.ctrlKey || event.metaKey)}
            >
              {dense && (
                <span className="workstation-number" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}.
                </span>
              )}
              <span className="workstation-label">{item.label}</span>
              {!!localizedCounts[item.id] && <span className="desk-asset-count">{localizedCounts[item.id]}</span>}
            </button>
          ))}
        </div>
        <div className="spatial-caption">
          <span>
            <span className="local-indicator" />
            {plan.workstations.length} poste{plan.workstations.length === 1 ? '' : 's'} · {plan.furniture.length} meuble
            {plan.furniture.length === 1 ? '' : 's'}
          </span>
          <span>
            {plan.width} × {plan.depth} m
          </span>
        </div>
        {plan.furniture.length > 0 && (
          <div className="furniture-strip" role="group" aria-label={t('Sélectionner un meuble')}>
            {plan.furniture.map((item, index) => (
              <button
                key={item.id}
                aria-pressed={selectedIds.includes(item.id)}
                title={item.label}
                onClick={(event) => selectWorkstation(item.id, event.shiftKey || event.ctrlKey || event.metaKey)}
              >
                {dense && (
                  <span aria-hidden="true">{String(plan.workstations.length + index + 1).padStart(2, '0')}. </span>
                )}
                {item.label}
              </button>
            ))}
          </div>
        )}
        {effectiveEditing && (
          <div className="selection-bar" role="group" aria-label={t('Sélection des objets')}>
            <span role="status">
              {plural(selectedIds.length, '{count} objet sélectionné', '{count} objets sélectionnés')}
            </span>
            <button onClick={() => onSelectionChange([...plan.workstations, ...plan.furniture].map((item) => item.id))}>
              {t('Tout sélectionner')}
            </button>
            <button onClick={() => onSelectionChange([])} disabled={selectedIds.length === 0}>
              {t('Désélectionner')}
            </button>
            <small>{t('Maj / Ctrl / ⌘ + clic pour ajouter ou retirer')}</small>
          </div>
        )}
      </section>
      {inspector}
    </div>
  )
}
