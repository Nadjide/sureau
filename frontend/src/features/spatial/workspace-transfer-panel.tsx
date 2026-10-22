import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, HardDrive, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parseWorkspace, workspaceFileSizeLimit, type WorkspaceDocument } from './workspace-document'
import { getWorkspaceSummary, isSameWorkspace, serializeWorkspace } from './workspace-transfer'

interface Props {
  workspace: WorkspaceDocument
  persisted: boolean
  onChange: (next: WorkspaceDocument) => boolean
  onImported: (roomId: string) => void
}

interface Pending {
  source: WorkspaceDocument
  workspace: WorkspaceDocument
}

export function WorkspaceTransferPanel({ workspace, persisted, onChange, onImported }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [reading, setReading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  const summary = pending ? getWorkspaceSummary(pending.workspace) : null

  useEffect(() => () => { generation.current++ }, [])

  function download() {
    try {
      const raw = serializeWorkspace(workspace)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      const name = workspace.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'espace'
      link.href = url
      link.download = `sureau-espace-${name}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ error: false, text: 'Sauvegarde préparée. Conservez ce fichier pour retrouver l’ensemble de votre espace.' })
    } catch {
      setMessage({ error: true, text: 'La sauvegarde n’a pas pu être préparée. Votre espace reste disponible ici.' })
    }
  }

  function chooseFile() {
    generation.current++
    setReading(false)
    setPending(null)
    setMessage(null)
    input.current?.click()
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const ticket = ++generation.current
    const source = workspace
    setPending(null)
    setMessage(null)
    setReading(false)
    if (file.size > workspaceFileSizeLimit) {
      setMessage({ error: true, text: 'Ce fichier est trop volumineux. La limite est de 2 Mo.' })
      return
    }
    setReading(true)
    try {
      const raw = await file.text()
      if (ticket !== generation.current) return
      const candidate = parseWorkspace(raw)
      setPending({ source, workspace: candidate })
    } catch (error) {
      if (ticket === generation.current) setMessage({ error: true, text: error instanceof Error ? error.message : 'Ce fichier ne peut pas être lu.' })
    } finally {
      if (ticket === generation.current) setReading(false)
    }
  }

  function confirm() {
    if (!pending) return
    if (pending.source !== workspace) {
      setPending(null)
      setMessage({ error: true, text: 'L’espace a changé pendant cette préparation. Sélectionnez à nouveau le fichier pour conserver vos dernières modifications.' })
      return
    }
    try {
      if (isSameWorkspace(workspace, pending.workspace)) {
        setPending(null)
        setMessage({ error: false, text: 'Cette sauvegarde est déjà identique à l’espace courant. Aucun changement n’a été appliqué.' })
        return
      }
      if (!onChange(pending.workspace)) {
        setPending(null)
        setMessage({ error: true, text: 'Cette sauvegarde ne peut pas être appliquée. L’espace actuel est conservé.' })
        return
      }
      onImported(pending.workspace.rooms[0]!.plan.id)
      setPending(null)
      setMessage({ error: false, text: 'L’espace est importé. Annuler permet de retrouver l’espace précédent pendant cette session.' })
    } catch (error) {
      setPending(null)
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Cette sauvegarde ne peut pas être appliquée.' })
    }
  }

  return <section className="plan-transfer-panel" aria-label="Sauvegarde de l’espace" aria-busy={reading}>
    <p className="eyebrow">VOTRE ESPACE À EMPORTER</p>
    <h3>Sauvegarder tout l’espace</h3>
    <p className="location-help">Conservez ensemble vos étages, vos salles et leurs implantations, avec les noms, les dimensions, le mobilier et les couleurs.</p>
    <div className="transfer-actions">
      <Button variant="outline" onClick={download}><Download aria-hidden="true" />Exporter l’espace (.json)</Button>
      <Button variant="outline" onClick={chooseFile}><Upload aria-hidden="true" />{reading ? 'Choisir un autre fichier' : 'Importer un espace'}</Button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Fichier d’espace Sureau" onChange={readFile} tabIndex={-1} />
    </div>
    {reading && <p className="location-help" role="status">Lecture et vérification de la sauvegarde…</p>}
    <p className="location-help">L’inventaire et les localisations du matériel ne sont pas inclus dans le fichier et restent dans leur environnement actuel. Les identifiants des postes et des meubles sont conservés.</p>
    {pending && summary && <div className="editor-delete-confirm" role="alert">
      <h3>Importer cet espace ?</h3>
      <p><strong>{pending.workspace.name}</strong></p>
      <dl className="asset-specs">
        <div><dt>Étages</dt><dd>{summary.floorCount}</dd></div>
        <div><dt>Salles</dt><dd>{summary.roomCount}</dd></div>
        <div><dt>Postes</dt><dd>{summary.workstationCount}</dd></div>
        <div><dt>Meubles</dt><dd>{summary.furnitureCount}</dd></div>
      </dl>
      <p>L’espace courant sera remplacé dans son ensemble. Les localisations existantes restent inchangées et retrouvent les postes portant le même identifiant. Les liens vers des postes absents restent récupérables dans l’inventaire.</p>
      <Button onClick={confirm}>Importer cet espace</Button>
      <Button variant="ghost" onClick={() => setPending(null)}>Conserver l’espace courant</Button>
    </div>}
    {message && <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <p className="local-save-label"><HardDrive size={12} aria-hidden="true" />{persisted ? 'Espace conservé dans ce navigateur' : 'Session uniquement · exportez pour garder une copie'}</p>
  </section>
}
