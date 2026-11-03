import { useState } from 'react'
import { MoveRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural, t } from '@/lib/i18n'
import type { WorkspaceDocument } from './workspace-document'
import { moveSelectionToRoom } from './workspace-object-transfer'

interface Props {
  workspace: WorkspaceDocument
  sourceRoomId: string
  ids: readonly string[]
  onChange: (next: WorkspaceDocument) => boolean
  onMoved: (roomId: string, ids: string[]) => void
}
interface Pending {
  source: WorkspaceDocument
  result: WorkspaceDocument
  targetId: string
  ids: string[]
}

export function SelectionRoomTransfer({ workspace, sourceRoomId, ids, onChange, onMoved }: Props) {
  const destinations = workspace.rooms.filter((room) => room.plan.id !== sourceRoomId)
  const [targetId, setTargetId] = useState(destinations[0]?.plan.id || '')
  const [pending, setPending] = useState<Pending | null>(null)
  const [error, setError] = useState<string | null>(null)
  const target = destinations.find((room) => room.plan.id === targetId) || destinations[0]
  if (!target || ids.length === 0) return null
  const targetName = pending?.source.rooms.find((room) => room.plan.id === pending.targetId)?.plan.name

  function prepare() {
    try {
      const result = moveSelectionToRoom(workspace, sourceRoomId, target!.plan.id, ids)
      setPending({ source: workspace, result: result.workspace, targetId: target!.plan.id, ids: result.selectedIds })
      setError(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : t('Ce déplacement ne peut pas être préparé.'))
      setPending(null)
    }
  }

  return (
    <section className="object-room-transfer" aria-label={t('Déplacer les objets vers une autre salle')}>
      <div className="manager-divider" />
      <h3>{t('Changer de salle')}</h3>
      <p className="location-help">
        {plural(
          ids.length,
          'Déplacez cet objet avec leurs positions relatives. Le matériel localisé suit les postes.',
          'Déplacez ces {count} objets avec leurs positions relatives. Le matériel localisé suit les postes.',
        )}
      </p>
      <label className="manager-room-picker">
        {t('Salle de destination')}
        <select
          value={target.plan.id}
          onChange={(event) => {
            setTargetId(event.target.value)
            setPending(null)
            setError(null)
          }}
        >
          {workspace.floors.map((floor) => (
            <optgroup key={floor.id} label={floor.name}>
              {destinations
                .filter((room) => room.floorId === floor.id)
                .map((room) => (
                  <option key={room.plan.id} value={room.plan.id}>
                    {room.plan.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      <Button variant="outline" className="w-full mt-3" onClick={prepare}>
        <MoveRight />
        {t('Préparer le déplacement')}
      </Button>
      {pending && (
        <div className="editor-delete-confirm" role="alert">
          <p>
            {plural(
              pending.ids.length,
              'Déplacer {count} objet vers « {room} » ? Une zone libre a été trouvée. Annuler rétablira les deux salles.',
              'Déplacer {count} objets vers « {room} » ? Une zone libre a été trouvée. Annuler rétablira les deux salles.',
              { room: targetName ?? '' },
            )}
          </p>
          <Button
            onClick={() => {
              if (pending.source !== workspace) {
                setError(
                  t(
                    'L’espace a changé. Préparez de nouveau le déplacement pour conserver les dernières modifications.',
                  ),
                )
                setPending(null)
                return
              }
              if (!onChange(pending.result)) {
                setError(t('Le déplacement n’a pas pu être appliqué. Les objets restent dans leur salle.'))
                setPending(null)
                return
              }
              onMoved(pending.targetId, pending.ids)
            }}
          >
            {t('Déplacer vers cette salle')}
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t('Conserver dans la salle actuelle')}
          </Button>
        </div>
      )}
      {error && (
        <p className="storage-warning" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
