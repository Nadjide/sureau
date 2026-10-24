import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, HardDrive, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LocalLocations } from './local-locations'
import { sameSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import {
  applySpatialTransfer, parseSpatialTransfer, serializeSpatialDraft, spatialTransferFileSizeLimit,
  type SpatialTransferResult,
} from './shared-workspace-transfer'
import type { WorkspaceDocument } from './workspace-document'
import { getWorkspaceSummary } from './workspace-transfer'

interface Props {
  canEdit?: boolean
  workspace: WorkspaceDocument
  locations: LocalLocations
  persisted: boolean
  onChange: (next: SpatialDraft) => boolean
  onImported: (roomId: string) => void
}

interface Pending {
  source: SpatialDraft
  incoming: SpatialTransferResult
}

export function WorkspaceTransferPanel({ workspace, locations, canEdit = true, persisted, onChange, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [reading, setReading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [includeLocations, setIncludeLocations] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const summary = pending ? getWorkspaceSummary(pending.incoming.draft.workspace) : null

  useEffect(() => () => { generation.current++ }, [])

  function download() {
    try {
      const raw = serializeSpatialDraft({ workspace, locations })
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      const name = workspace.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'espace'
      link.href = url
      link.download = `sureau-espace-${name}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ error: false, text: 'Copie préparée avec les étages, les salles, le mobilier et les localisations appliquées au brouillon. Les saisies non appliquées n’y figurent pas.' })
    } catch {
      setMessage({ error: true, text: 'La copie n’a pas pu être préparée. Votre espace reste disponible ici.' })
    }
  }

  function chooseFile() {
    if (!canEdit) return
    generation.current++
    setReading(false)
    setPending(null)
    setIncludeLocations(false)
    setMessage(null)
    input.current?.click()
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!canEdit || !file) return
    const ticket = ++generation.current
    const source: SpatialDraft = { workspace, locations }
    setPending(null)
    setIncludeLocations(false)
    setMessage(null)
    setReading(false)
    if (file.size > spatialTransferFileSizeLimit) {
      setMessage({ error: true, text: 'Ce fichier est trop volumineux. La limite est de 8 Mo.' })
      return
    }
    setReading(true)
    try {
      const raw = await file.text()
      if (ticket !== generation.current) return
      const incoming = parseSpatialTransfer(raw)
      setPending({ source, incoming })
    } catch (error) {
      if (ticket === generation.current) setMessage({ error: true, text: error instanceof Error ? error.message : 'Ce fichier ne peut pas être lu.' })
    } finally {
      if (ticket === generation.current) setReading(false)
    }
  }

  function confirm() {
    if (!canEdit || !pending) return
    if (pending.source.workspace !== workspace || pending.source.locations !== locations) {
      setPending(null)
      setMessage({ error: true, text: 'L’espace ou ses localisations ont changé pendant cette préparation. Sélectionnez à nouveau le fichier pour conserver vos dernières modifications.' })
      return
    }
    try {
      const current: SpatialDraft = { workspace, locations }
      const imported = applySpatialTransfer(current, pending.incoming, includeLocations)
      if (sameSpatialDraft(current, imported)) {
        setPending(null)
        setMessage({ error: false, text: 'Ce contenu est déjà identique au brouillon courant. Aucun changement n’a été appliqué.' })
        return
      }
      if (!onChange(imported)) {
        setPending(null)
        setMessage({ error: true, text: 'Ce fichier ne peut pas être appliqué. L’espace et ses localisations actuelles sont conservés.' })
        return
      }
      onImported(imported.workspace.rooms[0]!.plan.id)
      setPending(null)
      setMessage({ error: false, text: includeLocations
        ? 'L’espace et les localisations du fichier sont appliqués ensemble au brouillon. Enregistrez l’espace pour les partager. Annuler permet de retrouver la version précédente.'
        : 'L’espace est appliqué au brouillon et vos localisations actuelles sont conservées. Enregistrez l’espace pour le partager. Annuler permet de retrouver la version précédente.' })
    } catch (error) {
      setPending(null)
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Ce fichier ne peut pas être appliqué.' })
    }
  }

  return <section className="plan-transfer-panel" aria-label="Sauvegarde de l’espace" aria-busy={reading}>
    <p className="eyebrow">VOTRE ESPACE À EMPORTER</p>
    <h3>Votre espace et ses localisations</h3>
    <p className="location-help">Conservez ensemble vos étages, vos salles et leurs implantations, avec les noms, les dimensions, le mobilier, les couleurs et les liens du matériel vers les postes.</p>
    <div className="transfer-actions">
      <Button variant="outline" onClick={download}><Download aria-hidden="true" />Exporter l’espace (.json)</Button>
      <Button variant="outline" disabled={!canEdit} onClick={chooseFile}><Upload aria-hidden="true" />{reading ? 'Choisir un autre fichier' : 'Importer un espace'}</Button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Fichier d’espace Sureau" disabled={!canEdit} onChange={readFile} tabIndex={-1} />
    </div>
    {reading && <p className="location-help" role="status">Lecture et vérification du fichier…</p>}
    <p className="location-help">L’inventaire et les comptes ne sont pas inclus dans le fichier. Ils restent dans la base de cette instance. L’export contient uniquement les changements déjà appliqués au brouillon.</p>
    {pending && summary && <div className="editor-delete-confirm" role="alert">
      <h3>Importer cet espace ?</h3>
      <p><strong>{pending.incoming.draft.workspace.name}</strong></p>
      <dl className="asset-specs">
        <div><dt>Étages</dt><dd>{summary.floorCount}</dd></div>
        <div><dt>Salles</dt><dd>{summary.roomCount}</dd></div>
        <div><dt>Postes</dt><dd>{summary.workstationCount}</dd></div>
        <div><dt>Meubles</dt><dd>{summary.furnitureCount}</dd></div>
        <div><dt>Localisations du fichier</dt><dd>{pending.incoming.hasLocations ? Object.keys(pending.incoming.draft.locations).length : 'Non incluses'}</dd></div>
      </dl>
      <fieldset disabled={!canEdit} className="spatial-edit-fields spatial-transfer-options">
        {pending.incoming.hasLocations ? <>
          <label className="spatial-location-import"><input type="checkbox" checked={includeLocations} onChange={(event) => { if (canEdit) setIncludeLocations(event.target.checked) }} aria-describedby="spatial-location-import-warning" /><span>Importer aussi les localisations — fichier provenant de cette instance</span></label>
          <p id="spatial-location-import-warning">Les identifiants de matériel sont propres à chaque instance. Dans une autre instance, les mêmes numéros peuvent désigner d’autres matériels. Cochez cette option uniquement si ce fichier vient de cette instance.</p>
        </> : <p>Ancien format : ce fichier contient uniquement les implantations. Vos localisations actuelles seront conservées.</p>}
        <p>{includeLocations
          ? 'Le brouillon sera remplacé avec les implantations et les localisations du fichier, y compris les liens vers des postes absents.'
          : 'Les implantations du brouillon seront remplacées et vos localisations actuelles resteront inchangées. Les liens vers des postes absents restent récupérables dans l’inventaire.'}</p>
        <p>Cette action prépare le brouillon. Enregistrez ensuite l’espace pour partager les modifications.</p>
        <Button disabled={!canEdit} onClick={confirm}>Importer cet espace</Button>
      </fieldset>
      <Button variant="ghost" onClick={() => setPending(null)}>Conserver l’espace courant</Button>
    </div>}
    {message && <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <p className="local-save-label"><HardDrive size={12} aria-hidden="true" />{persisted ? 'Version enregistrée sur le serveur' : 'Brouillon à enregistrer · exportez pour garder une copie'}</p>
  </section>
}
