import { useState, type FormEvent } from 'react'
import { ArrowDown, ArrowUp, DoorOpen, Layers, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural, t } from '@/lib/i18n'
import { workspaceFloorLimit, workspaceRoomLimit, type WorkspaceDocument } from './workspace-document'
import { createFloor, removeFloor, renameFloor, renameWorkspace, reorderFloor } from './workspace-floors'

interface Props {
  workspace: WorkspaceDocument
  onChange: (next: WorkspaceDocument) => boolean
  onSelectRoom: (id: string) => void
  onCreateRoom: (floorId: string) => void
}

interface Deletion {
  source: WorkspaceDocument
  floorId: string
  destinationId: string
}

export function WorkspaceFloorPanel({ workspace, onChange, onSelectRoom, onCreateRoom }: Props) {
  const [floorId, setFloorId] = useState(workspace.floors[0]!.id)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [deleting, setDeleting] = useState<Deletion | null>(null)
  const floor = workspace.floors.find((item) => item.id === floorId) || workspace.floors[0]!
  const floorIndex = workspace.floors.indexOf(floor)
  const rooms = workspace.rooms.filter((room) => room.floorId === floor.id)
  const removedFloor = deleting?.source.floors.find((item) => item.id === deleting.floorId)
  const removedRooms = deleting?.source.rooms.filter((room) => room.floorId === deleting.floorId) || []
  let nextNumber = 1
  while (workspace.floors.some((item) => item.name === t('Étage {number}', { number: nextNumber }))) nextNumber++

  function apply(run: () => { workspace: WorkspaceDocument; floorId?: string }, text: string) {
    try {
      const result = run()
      if (!onChange(result.workspace))
        throw new Error(t('Cette modification ne peut pas être appliquée. Vérifiez les limites de l’espace.'))
      if (result.floorId) setFloorId(result.floorId)
      setDeleting(null)
      setMessage({ error: false, text })
    } catch (error) {
      setMessage({
        error: true,
        text: error instanceof Error ? error.message : t('Cette action ne peut pas être appliquée.'),
      })
    }
  }

  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = String(new FormData(event.currentTarget).get('name') || '')
    apply(() => createFloor(workspace, name), t('L’étage est créé. Ajoutez-y les salles de votre choix.'))
  }

  function confirmRemoval() {
    if (!deleting) return
    if (deleting.source !== workspace || deleting.floorId !== floor.id) {
      setDeleting(null)
      setMessage({ error: true, text: t('L’espace a changé. Vérifiez l’étage avant de relancer la suppression.') })
      return
    }
    apply(
      () => {
        const next = removeFloor(workspace, deleting.floorId, removedRooms.length ? deleting.destinationId : undefined)
        return {
          workspace: next,
          floorId: removedRooms.length ? deleting.destinationId : next.floors[0]!.id,
        }
      },
      removedRooms.length
        ? t('L’étage est supprimé. Ses salles et leur contenu ont été transférés.')
        : t('L’étage vide est supprimé.'),
    )
  }

  return (
    <section aria-label={t('Gestion des étages')}>
      <p className="eyebrow">{t('VOTRE ORGANISATION')}</p>
      <h3>{t('L’espace de travail')}</h3>
      <form
        key={workspace.name}
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault()
          const name = String(new FormData(event.currentTarget).get('name') || '')
          apply(
            () => ({ workspace: renameWorkspace(workspace, name) }),
            t('Le nom de l’espace est appliqué au brouillon.'),
          )
        }}
      >
        <label>
          {t('Nom de l’espace')}
          <input name="name" defaultValue={workspace.name} maxLength={60} required />
        </label>
        <Button variant="outline" type="submit">
          {t('Renommer l’espace')}
        </Button>
      </form>

      <div className="manager-divider" />
      <label className="manager-room-picker">
        {t('Étage à organiser')}
        <select
          value={floor.id}
          onChange={(event) => {
            setFloorId(event.target.value)
            setDeleting(null)
            setMessage(null)
          }}
        >
          {workspace.floors.map((item) => {
            const count = workspace.rooms.filter((room) => room.floorId === item.id).length
            return (
              <option key={item.id} value={item.id}>
                {item.name} · {plural(count, '{count} salle', '{count} salles')}
              </option>
            )
          })}
        </select>
      </label>
      <div className="manager-room-card">
        <Layers size={24} aria-hidden="true" />
        <div>
          <h3>{floor.name}</h3>
          <p>
            {t('Étage {number} sur {count}', { number: floorIndex + 1, count: workspace.floors.length })} ·{' '}
            {plural(rooms.length, '{count} salle', '{count} salles')}
          </p>
        </div>
      </div>
      <form
        key={`${floor.id}/${floor.name}`}
        className="editor-form"
        onSubmit={(event) => {
          event.preventDefault()
          const name = String(new FormData(event.currentTarget).get('name') || '')
          apply(
            () => ({ workspace: renameFloor(workspace, floor.id, name) }),
            t('Le nom de l’étage est appliqué au brouillon.'),
          )
        }}
      >
        <label>
          {t('Nom de l’étage')}
          <input name="name" defaultValue={floor.name} maxLength={60} required />
        </label>
        <Button variant="outline" type="submit">
          {t('Renommer l’étage')}
        </Button>
      </form>
      <div className="editor-actions" role="group" aria-label={t('Ordre des étages')}>
        <Button
          variant="outline"
          disabled={floorIndex === 0}
          onClick={() =>
            apply(
              () => ({ workspace: reorderFloor(workspace, floor.id, -1) }),
              t('L’ordre des étages est appliqué au brouillon.'),
            )
          }
        >
          <ArrowUp aria-hidden="true" />
          {t('Monter l’étage')}
        </Button>
        <Button
          variant="outline"
          disabled={floorIndex === workspace.floors.length - 1}
          onClick={() =>
            apply(
              () => ({ workspace: reorderFloor(workspace, floor.id, 1) }),
              t('L’ordre des étages est appliqué au brouillon.'),
            )
          }
        >
          <ArrowDown aria-hidden="true" />
          {t('Descendre l’étage')}
        </Button>
      </div>

      <h3>{t('Salles de cet étage')}</h3>
      {rooms.length ? (
        <ul className="space-room-list space-tree" aria-label={t('Salles de {floor}', { floor: floor.name })}>
          {rooms.map(({ plan }) => (
            <li key={plan.id}>
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-2 whitespace-normal text-left"
                onClick={() => onSelectRoom(plan.id)}
              >
                <DoorOpen aria-hidden="true" />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{plan.name}</span>
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="location-help">{t('Cet étage attend sa première salle.')}</p>
      )}
      <Button
        variant="outline"
        className="w-full mt-3"
        disabled={workspace.rooms.length >= workspaceRoomLimit}
        onClick={() => onCreateRoom(floor.id)}
      >
        <Plus aria-hidden="true" />
        {t('Créer une salle ici')}
      </Button>

      {deleting && removedFloor ? (
        <div className="editor-delete-confirm" role="alert">
          <p>
            {t('Supprimer l’étage « {name} » ?', { name: removedFloor.name })}{' '}
            {removedRooms.length
              ? removedRooms.length === 1
                ? t('Sa salle sera déplacée avec son plan, son mobilier et ses localisations.')
                : t('Ses {count} salles seront déplacées avec leurs plans, leur mobilier et leurs localisations.', {
                    count: removedRooms.length,
                  })
              : t('Cet étage ne contient aucune salle.')}
          </p>
          {removedRooms.length > 0 && (
            <label className="manager-room-picker">
              {t('Transférer les salles vers')}
              <select
                value={deleting.destinationId}
                onChange={(event) => {
                  const destinationId = event.target.value
                  setDeleting((current) => (current ? { ...current, destinationId } : null))
                }}
              >
                {workspace.floors
                  .filter((item) => item.id !== deleting.floorId)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <Button variant="destructive" onClick={confirmRemoval}>
            {t('Confirmer la suppression de l’étage')}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            {t('Conserver l’étage')}
          </Button>
        </div>
      ) : (
        <Button
          variant="ghost"
          className="editor-delete"
          disabled={workspace.floors.length === 1}
          onClick={() => {
            setDeleting({
              source: workspace,
              floorId: floor.id,
              destinationId: workspace.floors.find((item) => item.id !== floor.id)?.id || '',
            })
            setMessage(null)
          }}
        >
          <Trash2 aria-hidden="true" />
          {t('Supprimer cet étage')}
        </Button>
      )}
      {workspace.floors.length === 1 && (
        <p className="location-help">{t('Conservez au moins un étage dans votre espace de travail.')}</p>
      )}

      <div className="manager-divider" />
      <p className="eyebrow">{t('UN NOUVEL ÉTAGE')}</p>
      <h3>{t('Créer un étage')}</h3>
      <form key={workspace.floors.length} className="editor-form" onSubmit={add}>
        <label>
          {t('Nom du nouvel étage')}
          <input name="name" defaultValue={t('Étage {number}', { number: nextNumber })} maxLength={60} required />
        </label>
        <Button type="submit" disabled={workspace.floors.length >= workspaceFloorLimit}>
          <Plus aria-hidden="true" />
          {t('Créer l’étage')}
        </Button>
      </form>
      <p className="location-help">
        {t('{count} / {limit} étages', { count: workspace.floors.length, limit: workspaceFloorLimit })} ·{' '}
        {t('La suppression d’un étage conserve toujours le contenu de ses salles.')}
      </p>
      {message && (
        <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
    </section>
  )
}
