import { useState, type FormEvent } from 'react'
import { Copy, DoorOpen, Plus, Redo2, Trash2, Undo2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { createRoom, deleteRoom, duplicateRoom, renameRoom } from './workspace-rooms'
import { workspaceRoomLimit, type WorkspaceDocument } from './workspace-document'
import { moveRoomToFloor } from './workspace-floors'
import { WorkspaceFloorPanel } from './workspace-floor-panel'

interface Props {
  open: boolean; onOpenChange: (open: boolean) => void
  workspace: WorkspaceDocument; activeRoomId: string; onSelectRoom: (id: string) => void
  onChange: (next: WorkspaceDocument) => boolean; persisted: boolean
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean }
}

export function WorkspaceManager({ open, onOpenChange, workspace, activeRoomId, onSelectRoom, onChange, persisted, history }: Props) {
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const [deleting, setDeleting] = useState<{ source: WorkspaceDocument; roomId: string } | null>(null)
  const [section, setSection] = useState<'rooms' | 'floors'>('rooms')
  const [creationFloorId, setCreationFloorId] = useState<string | null>(null)
  const room = workspace.rooms.find((item) => item.plan.id === activeRoomId) || workspace.rooms[0]!
  const newFloorId = workspace.floors.some((floor) => floor.id === creationFloorId) ? creationFloorId! : room.floorId
  function apply(run: () => { workspace: WorkspaceDocument; roomId?: string }, text: string) {
    try {
      const result = run()
      if (!onChange(result.workspace)) throw new Error('Cette modification ne peut pas être appliquée. Vérifiez les limites de l’espace.')
      if (result.roomId) onSelectRoom(result.roomId)
      setMessage({ error: false, text }); setDeleting(null)
    } catch (error) { setMessage({ error: true, text: error instanceof Error ? error.message : 'Cette action ne peut pas être appliquée.' }) }
  }
  function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    apply(() => createRoom(workspace, String(data.get('floor')), String(data.get('name')), room.plan), 'La nouvelle salle est prête à être composée.')
  }
  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent side="right" showCloseButton={false} className="workspace-manager">
      <SheetHeader><p className="eyebrow">VOTRE ESPACE, À VOTRE MESURE</p><SheetTitle>Organiser vos espaces</SheetTitle><SheetDescription>Des étages aux salles, composez un lieu qui vous ressemble.</SheetDescription></SheetHeader>
      <SheetClose asChild><Button variant="ghost" size="icon-sm" className="absolute top-3 right-3" aria-label="Fermer la gestion des espaces"><X /></Button></SheetClose>
      <div className="workspace-manager-body">
        <div className="editor-tabs" role="group" aria-label="Organisation des espaces"><button aria-pressed={section === 'rooms'} onClick={() => setSection('rooms')}>Salles</button><button aria-pressed={section === 'floors'} onClick={() => setSection('floors')}>Étages</button></div>
        {section === 'floors' ? <WorkspaceFloorPanel workspace={workspace} onChange={onChange} onSelectRoom={(id) => { onSelectRoom(id); setSection('rooms') }} onCreateRoom={(id) => { setCreationFloorId(id); setSection('rooms'); setMessage(null) }} /> : <>
        <label className="manager-room-picker">Salle à organiser<select value={room.plan.id} onChange={(event) => { onSelectRoom(event.target.value); setDeleting(null); setMessage(null) }}>
          {workspace.floors.map((floor) => <optgroup key={floor.id} label={floor.name}>{workspace.rooms.filter((item) => item.floorId === floor.id).map((item) => <option key={item.plan.id} value={item.plan.id}>{item.plan.name}</option>)}</optgroup>)}
        </select></label>
        <div className="manager-room-card"><DoorOpen size={24} /><div><h3>{room.plan.name}</h3><p>{room.plan.width} × {room.plan.depth} m · {room.plan.workstations.length} postes · {room.plan.furniture.length} meubles</p></div></div>
        <form key={`${room.plan.id}/${room.plan.name}`} className="editor-form" onSubmit={(event) => {
          event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name'))
          apply(() => ({ workspace: renameRoom(workspace, room.plan.id, name) }), 'Le nom de la salle est enregistré.')
        }}>
          <label>Nom de la salle<input name="name" defaultValue={room.plan.name} maxLength={60} required /></label>
          <Button variant="outline" type="submit">Renommer la salle</Button>
        </form>
        <form key={`${room.plan.id}/${room.floorId}`} className="editor-form" onSubmit={(event) => {
          event.preventDefault(); const floorId = String(new FormData(event.currentTarget).get('floor'))
          apply(() => ({ workspace: moveRoomToFloor(workspace, room.plan.id, floorId) }), 'L’étage de la salle est enregistré.')
        }}>
          <label>Étage de cette salle<select name="floor" defaultValue={room.floorId}>{workspace.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
          <Button variant="outline" type="submit" disabled={workspace.floors.length === 1}>Déplacer la salle</Button>
        </form>
        <div className="editor-actions">
          <Button variant="outline" disabled={workspace.rooms.length >= workspaceRoomLimit} onClick={() => apply(() => duplicateRoom(workspace, room.plan.id), 'La copie est prête. Les localisations du matériel restent sur les postes d’origine.')}><Copy />Dupliquer la salle</Button>
          <Button variant="ghost" disabled={workspace.rooms.length === 1} onClick={() => { setDeleting({ source: workspace, roomId: room.plan.id }); setMessage(null) }}><Trash2 />Supprimer la salle</Button>
        </div>
        {deleting && <div className="editor-delete-confirm" role="alert"><p>Supprimer cette salle et son implantation ? Annuler permet de la retrouver avec les mêmes postes et liens de matériel.</p>
          <Button variant="destructive" onClick={() => {
            if (deleting.source !== workspace || deleting.roomId !== room.plan.id) { setDeleting(null); setMessage({ error: true, text: 'L’espace a changé. Vérifiez la salle avant de relancer la suppression.' }); return }
            apply(() => { const next = deleteRoom(workspace, deleting.roomId); return { workspace: next, roomId: next.rooms[0]!.plan.id } }, 'La salle a été supprimée. Annuler permet de la restaurer.')
          }}>Confirmer la suppression de la salle</Button><Button variant="ghost" onClick={() => setDeleting(null)}>Conserver la salle</Button>
        </div>}
        <div className="manager-divider" />
        <p className="eyebrow">UN NOUVEL ESPACE À COMPOSER</p><h3>Créer une salle</h3>
        <form key={`${workspace.rooms.length}/${newFloorId}`} className="editor-form" onSubmit={add}>
          <label>Nom de la nouvelle salle<input name="name" defaultValue={`Salle ${String(workspace.rooms.length + 1).padStart(2, '0')}`} maxLength={60} required autoFocus={creationFloorId !== null} /></label>
          <label>Étage de la nouvelle salle<select name="floor" defaultValue={newFloorId}>{workspace.floors.map((floor) => <option key={floor.id} value={floor.id}>{floor.name}</option>)}</select></label>
          <p className="location-help">La salle commence vide, avec les dimensions et l’ambiance de la salle affichée. Ajustez ensuite son plan dans l’atelier.</p>
          <Button type="submit" disabled={workspace.rooms.length >= workspaceRoomLimit}><Plus />Créer la salle</Button>
        </form>
        {message && <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
        </>}
        <div className="manager-divider" />
        <div className="manager-history"><Button variant="outline" size="sm" disabled={!history.canUndo} onClick={() => { history.undo(); setMessage(null); setDeleting(null) }} aria-label="Annuler la dernière modification de l’espace"><Undo2 />Annuler</Button><Button variant="outline" size="sm" disabled={!history.canRedo} onClick={() => { history.redo(); setMessage(null); setDeleting(null) }} aria-label="Rétablir la modification de l’espace"><Redo2 />Rétablir</Button></div>
        <p className="location-help">{workspace.rooms.length} / {workspaceRoomLimit} salles · {persisted ? 'Conservé dans ce navigateur' : 'Cette session uniquement'}</p>
      </div>
    </SheetContent>
  </Sheet>
}
