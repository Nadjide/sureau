import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, FilePlus2, HardDrive, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { parsePlan, planFileSizeLimit, type SpatialPlan } from './plan-document'
import { createEmptyPlan, createExamplePlan, serializePlan } from './plan-transfer'

interface Props { plan: SpatialPlan; persisted: boolean; onChange: (plan: SpatialPlan) => boolean }
interface Pending { plan: SpatialPlan; source: SpatialPlan; kind: 'import' | 'empty' | 'example' }

export function PlanTransferPanel({ plan, persisted, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [reading, setReading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  useEffect(() => () => { generation.current++ }, [])

  function download() {
    try {
      const raw = serializePlan(plan)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      const name = plan.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'plateau'
      link.href = url
      link.download = `sentinel-${name}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ error: false, text: 'Export préparé. Conservez ce fichier pour retrouver votre implantation.' })
    } catch { setMessage({ error: true, text: 'L’export n’a pas pu être préparé. Votre plan reste disponible ici.' }) }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const ticket = ++generation.current
    setMessage(null)
    setPending(null)
    if (file.size > planFileSizeLimit) { setMessage({ error: true, text: 'Ce fichier est trop volumineux. La limite est de 256 ko.' }); return }
    setReading(true)
    try {
      const candidate = parsePlan(await file.text())
      if (ticket !== generation.current) return
      setPending({ plan: candidate, source: plan, kind: 'import' })
    } catch (error) {
      if (ticket === generation.current) setMessage({ error: true, text: error instanceof Error ? error.message : 'Ce fichier ne peut pas être lu.' })
    } finally { if (ticket === generation.current) setReading(false) }
  }

  function prepare(kind: 'empty' | 'example') {
    generation.current++
    setReading(false)
    setMessage(null)
    setPending({ plan: kind === 'empty' ? createEmptyPlan(plan) : createExamplePlan(), source: plan, kind })
  }

  function confirm() {
    if (!pending) return
    if (pending.source !== plan) {
      setMessage({ error: true, text: 'Le plateau a changé pendant cette préparation. Relancez cette action pour conserver vos dernières modifications.' })
      setPending(null)
      return
    }
    if (serializePlan(pending.plan) === serializePlan(plan)) {
      setPending(null)
      setMessage({ error: false, text: 'Ce plan est déjà identique au plateau courant. Aucun changement n’a été appliqué.' })
      return
    }
    if (!onChange(pending.plan)) {
      setMessage({ error: true, text: 'Ce plan ne peut pas être appliqué à cette salle. L’implantation actuelle est conservée.' })
      setPending(null)
      return
    }
    setPending(null)
    setMessage({ error: false, text: 'Le plateau est prêt. Annuler permet de retrouver l’implantation précédente pendant cette session.' })
  }

  return <div className="plan-transfer-panel">
    <p className="location-help">Gardez une copie de votre travail, transportez un plan ou commencez une nouvelle implantation.</p>
    <div className="transfer-actions">
      <Button variant="outline" onClick={download}><Download />Exporter le plan (.json)</Button>
      <Button variant="outline" disabled={reading} onClick={() => input.current?.click()}><Upload />{reading ? 'Lecture du plan…' : 'Importer un plan'}</Button>
      <input ref={input} type="file" accept=".json,application/json" className="sr-only" aria-label="Fichier de plan Sentinel" onChange={readFile} tabIndex={-1} />
    </div>
    <p className="location-help">Le fichier contient l’implantation, les dimensions et les couleurs. L’inventaire et les localisations du matériel restent dans leur environnement actuel.</p>
    <div className="editor-section-title"><h3>Commencer autrement</h3></div>
    <div className="transfer-actions">
      <Button variant="outline" disabled={reading} onClick={() => prepare('empty')}><FilePlus2 />Partir d’un plateau vide</Button>
      <Button variant="ghost" disabled={reading} onClick={() => prepare('example')}><RotateCcw />Reprendre l’exemple initial</Button>
    </div>
    {pending && <div className="editor-delete-confirm" role="alert">
      <h3>{pending.kind === 'import' ? 'Importer cette implantation ?' : pending.kind === 'empty' ? 'Vider l’implantation ?' : 'Reprendre le plateau initial ?'}</h3>
      <p><strong>{pending.plan.name}</strong> · {pending.plan.width} × {pending.plan.depth} m · {pending.plan.workstations.length} postes</p>
      <p>Le plan courant sera remplacé. Les localisations de matériel sont conservées et suivent les identifiants de postes retrouvés. Les autres liens restent récupérables dans l’inventaire.</p>
      <Button onClick={confirm}>{pending.kind === 'import' ? 'Importer ce plateau' : pending.kind === 'empty' ? 'Créer le plateau vide' : 'Reprendre cet exemple'}</Button>
      <Button variant="ghost" onClick={() => setPending(null)}>Annuler</Button>
    </div>}
    {message && <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
    <p className="local-save-label"><HardDrive size={12} />{persisted ? 'Plan conservé dans ce navigateur' : 'Session uniquement · exportez pour garder une copie'}</p>
  </div>
}
