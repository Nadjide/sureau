import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, FilePlus2, HardDrive, RotateCcw, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { plural, t } from '@/lib/i18n'
import { parsePlan, planFileSizeLimit, type SpatialPlan } from './plan-document'
import { createEmptyPlan, createExamplePlan, isSameRoomPlan, serializePlan } from './plan-transfer'

interface Props {
  plan: SpatialPlan
  canEdit?: boolean
  persisted: boolean
  onChange: (plan: SpatialPlan) => boolean
}
interface Pending {
  plan: SpatialPlan
  source: SpatialPlan
  kind: 'import' | 'empty' | 'example'
}

export function PlanTransferPanel({ plan, canEdit = true, persisted, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const [reading, setReading] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)

  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  function download() {
    try {
      const raw = serializePlan(plan)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      const name =
        plan.name
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '') || 'plateau'
      link.href = url
      link.download = `sureau-${name}.json`
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ error: false, text: t('Export préparé. Conservez ce fichier pour retrouver votre implantation.') })
    } catch {
      setMessage({ error: true, text: t('L’export n’a pas pu être préparé. Votre plan reste disponible ici.') })
    }
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!canEdit || !file) return
    const ticket = ++generation.current
    setMessage(null)
    setPending(null)
    if (file.size > planFileSizeLimit) {
      setMessage({ error: true, text: t('Ce fichier est trop volumineux. La limite est de 256 ko.') })
      return
    }
    setReading(true)
    try {
      const candidate = parsePlan(await file.text())
      if (ticket !== generation.current) return
      setPending({ plan: candidate, source: plan, kind: 'import' })
    } catch (error) {
      if (ticket === generation.current)
        setMessage({ error: true, text: error instanceof Error ? error.message : t('Ce fichier ne peut pas être lu.') })
    } finally {
      if (ticket === generation.current) setReading(false)
    }
  }

  function prepare(kind: 'empty' | 'example') {
    if (!canEdit) return
    generation.current++
    setReading(false)
    setMessage(null)
    setPending({ plan: kind === 'empty' ? createEmptyPlan(plan) : createExamplePlan(), source: plan, kind })
  }

  function confirm() {
    if (!canEdit || !pending) return
    if (pending.source !== plan) {
      setMessage({
        error: true,
        text: t(
          'Le plateau a changé pendant cette préparation. Relancez cette action pour conserver vos dernières modifications.',
        ),
      })
      setPending(null)
      return
    }
    if (isSameRoomPlan(plan, pending.plan)) {
      setPending(null)
      setMessage({
        error: false,
        text: t('Ce plan est déjà identique au plateau courant. Aucun changement n’a été appliqué.'),
      })
      return
    }
    if (!onChange(pending.plan)) {
      setMessage({
        error: true,
        text: t('Ce plan ne peut pas être appliqué à cette salle. L’implantation actuelle est conservée.'),
      })
      setPending(null)
      return
    }
    setPending(null)
    setMessage({
      error: false,
      text: t(
        'Le plan est appliqué au brouillon. Enregistrez l’espace pour le partager. Annuler permet de retrouver l’implantation précédente.',
      ),
    })
  }

  return (
    <div className="plan-transfer-panel">
      <p className="location-help">
        {t('Gardez une copie de votre travail, transportez un plan ou commencez une nouvelle implantation.')}
      </p>
      <div className="transfer-actions">
        <Button variant="outline" onClick={download}>
          <Download />
          {t('Exporter le plan (.json)')}
        </Button>
        <Button
          variant="outline"
          disabled={!canEdit || reading}
          onClick={() => {
            if (canEdit) input.current?.click()
          }}
        >
          <Upload />
          {reading ? t('Lecture du plan…') : t('Importer un plan')}
        </Button>
        <input
          ref={input}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          aria-label={t('Fichier de plan Sureau')}
          disabled={!canEdit}
          onChange={readFile}
          tabIndex={-1}
        />
      </div>
      <p className="location-help">
        {t(
          'Le fichier contient l’implantation, les dimensions et les couleurs. L’inventaire et les localisations du matériel restent dans leur environnement actuel.',
        )}
      </p>
      <div className="editor-section-title">
        <h3>{t('Commencer autrement')}</h3>
      </div>
      <div className="transfer-actions">
        <Button variant="outline" disabled={!canEdit || reading} onClick={() => prepare('empty')}>
          <FilePlus2 />
          {t('Partir d’un plateau vide')}
        </Button>
        <Button variant="ghost" disabled={!canEdit || reading} onClick={() => prepare('example')}>
          <RotateCcw />
          {t('Reprendre l’exemple initial')}
        </Button>
      </div>
      {pending && (
        <div className="editor-delete-confirm" role="alert">
          <h3>
            {pending.kind === 'import'
              ? t('Importer cette implantation ?')
              : pending.kind === 'empty'
                ? t('Vider l’implantation ?')
                : t('Reprendre le plateau initial ?')}
          </h3>
          <p>
            <strong>{pending.plan.name}</strong> · {pending.plan.width} × {pending.plan.depth} m ·{' '}
            {plural(pending.plan.workstations.length, '{count} poste', '{count} postes')}
          </p>
          <p>
            {t(
              'Le plan courant sera remplacé. Les localisations de matériel sont conservées et suivent les identifiants de postes retrouvés. Les autres liens restent récupérables dans l’inventaire.',
            )}
          </p>
          <Button disabled={!canEdit} onClick={confirm}>
            {pending.kind === 'import'
              ? t('Importer ce plateau')
              : pending.kind === 'empty'
                ? t('Créer le plateau vide')
                : t('Reprendre cet exemple')}
          </Button>
          <Button variant="ghost" onClick={() => setPending(null)}>
            {t('Annuler')}
          </Button>
        </div>
      )}
      {message && (
        <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>
          {message.text}
        </p>
      )}
      <p className="local-save-label">
        <HardDrive size={12} />
        {persisted
          ? t('Version enregistrée sur le serveur')
          : t('Brouillon à enregistrer · exportez pour garder une copie')}
      </p>
    </div>
  )
}
