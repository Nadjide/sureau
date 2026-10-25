import { useState } from 'react'
import { ArchiveRestore, Download, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  inspectLocalWorkspace, serializeLocalRecovery, type LocalWorkspaceInspection,
} from './local-workspace-recovery'
import { parseSpatialDraft, sameSpatialDraft, type SpatialDraft } from './shared-workspace-model'
import { getWorkspaceSummary } from './workspace-transfer'

interface Props {
  current: SpatialDraft | null
  canEdit: boolean
  onRecover: (draft: SpatialDraft) => boolean
  onRecovered?: (roomId: string) => void
}

interface SearchResult {
  inspection: LocalWorkspaceInspection
  source: SpatialDraft | null
}

function sourceLabel(key: string): string {
  const kind = key.includes('workspace') ? 'Espace complet' : key.includes('locations') ? 'Localisations' : 'Plan de salle'
  return `${kind} · ${key.startsWith('sentinel-') ? 'avant le renommage' : 'Sureau'}`
}

function sameSource(first: SpatialDraft | null, second: SpatialDraft | null): boolean {
  return first === null ? second === null
    : second !== null && first.workspace === second.workspace && first.locations === second.locations
}

export function LocalWorkspaceRecoveryPanel({ current, canEdit, onRecover, onRecovered }: Props) {
  const [result, setResult] = useState<SearchResult | null>(null)
  const [includeLocations, setIncludeLocations] = useState(false)
  const [applied, setApplied] = useState(false)
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null)
  if (!canEdit && !result) return null
  const inspection = result?.inspection
  const rawKeys = inspection ? Object.keys(inspection.rawEntries) : []
  const summary = inspection?.phase === 'ready' ? getWorkspaceSummary(inspection.draft.workspace) : null

  function search() {
    if (!canEdit) return
    const source = current
    let storage: Storage | null = null
    try { storage = window.localStorage } catch { /* The inspection reports unavailable browser storage. */ }
    setResult({ source, inspection: inspectLocalWorkspace(storage) })
    setIncludeLocations(false)
    setApplied(false)
    setMessage(null)
  }

  function exportRaw() {
    if (!result || rawKeys.length === 0) return
    try {
      const raw = serializeLocalRecovery(result.inspection)
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url; link.download = 'sureau-copie-locale-brute.json'
      document.body.append(link); link.click(); link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage({ error: false, text: 'Copie brute préparée avec les valeurs d’origine, y compris celles qui sont illisibles. Les données du navigateur sont conservées.' })
    } catch {
      setMessage({ error: true, text: 'La copie brute n’a pas pu être préparée. Les données d’origine restent dans ce navigateur.' })
    }
  }

  function confirm() {
    if (!canEdit || !result || result.inspection.phase !== 'ready' || applied) return
    if (!sameSource(result.source, current)) {
      setMessage({ error: true, text: 'Le brouillon ou ses localisations ont changé depuis la recherche. Relancez la recherche avant de récupérer ce plan.' })
      return
    }
    const recovered = result.inspection
    if (includeLocations && (!recovered.hasLocations || !recovered.locationsValid)) {
      setMessage({ error: true, text: 'Les localisations anciennes ne peuvent pas être récupérées. Vous pouvez conserver une copie brute et récupérer uniquement le plan.' })
      return
    }
    try {
      const draft = parseSpatialDraft({
        workspace: recovered.draft.workspace,
        locations: includeLocations ? recovered.draft.locations : current?.locations ?? {},
      })
      if (current && sameSpatialDraft(current, draft)) {
        setMessage({ error: false, text: 'Ce contenu est déjà identique au brouillon courant. Aucun changement n’a été appliqué.' })
        return
      }
      if (!onRecover(draft)) {
        setMessage({ error: true, text: 'Ce plan ne peut pas être appliqué dans l’état actuel. Votre travail et les données d’origine sont conservés.' })
        return
      }
      setApplied(true)
      onRecovered?.(draft.workspace.rooms[0]!.plan.id)
      setMessage({ error: false, text: includeLocations
        ? 'Le plan et les localisations récupérées sont appliqués au brouillon. Enregistrez l’espace pour les partager avec votre équipe.'
        : 'Le plan récupéré est appliqué au brouillon. Les localisations actuelles sont conservées. Enregistrez l’espace pour le partager avec votre équipe.' })
    } catch (error) {
      setMessage({ error: true, text: error instanceof Error ? error.message : 'Ce plan ne peut pas être récupéré. Les données d’origine sont conservées.' })
    }
  }

  return <section className="local-recovery-panel" aria-label="Récupérer un ancien plan de ce navigateur">
    <div className="local-recovery-heading"><ArchiveRestore size={20} strokeWidth={1.4} aria-hidden="true" /><h3>Retrouver vos anciens plans</h3></div>
    <p className="location-help">Vous utilisiez déjà Sureau dans ce navigateur ? Lancez une recherche pour retrouver les espaces enregistrés à cette adresse, y compris avant le renommage.</p>
    {canEdit && <Button variant="outline" onClick={search}><Search />{result ? 'Relancer la recherche des anciens plans' : 'Chercher mes anciens plans'}</Button>}
    {!canEdit && result && <p className="location-help" role="status">L’aperçu est conservé. Vos droits actuels permettent uniquement de consulter et de copier les données trouvées.</p>}
    {inspection?.phase === 'absent' && <p className="location-help" role="status">Aucun ancien espace, plan ou fichier de localisations n’a été trouvé à cette adresse dans ce navigateur.</p>}
    {inspection?.phase === 'unavailable' && <p className="storage-warning" role="alert">Le stockage de ce navigateur n’a pas pu être lu complètement. Vous pouvez conserver une copie des valeurs déjà accessibles.</p>}
    {inspection?.phase === 'invalid' && <p className="storage-warning" role="alert">Les données trouvées ne contiennent pas de plan récupérable. Conservez une copie brute pour examiner les valeurs d’origine.</p>}
    {inspection?.warning && <p className="storage-warning" role="alert">{inspection.warning}</p>}
    {rawKeys.length > 0 && <div className="local-recovery-sources"><p className="location-help">Données trouvées :</p><ul>{rawKeys.map((key) => <li key={key}>{sourceLabel(key)}</li>)}</ul><Button variant="outline" onClick={exportRaw}><Download />Exporter les données brutes d’origine</Button><p className="location-help">Cette copie brute garde les textes d’origine. Elle s’examine séparément et ne constitue pas un fichier d’espace à importer, ni une sauvegarde de l’inventaire ou des comptes.</p></div>}
    {inspection?.phase === 'ready' && summary && <div className="editor-delete-confirm">
      <h3>Récupérer ce plan dans votre brouillon ?</h3>
      <p><strong>{inspection.draft.workspace.name}</strong></p>
      {inspection.sourceKey && <p>Plan retenu : {sourceLabel(inspection.sourceKey)}.</p>}
      <dl className="asset-specs"><div><dt>Étages</dt><dd>{summary.floorCount}</dd></div><div><dt>Salles</dt><dd>{summary.roomCount}</dd></div><div><dt>Postes</dt><dd>{summary.workstationCount}</dd></div><div><dt>Meubles</dt><dd>{summary.furnitureCount}</dd></div><div><dt>Localisations anciennes</dt><dd>{!inspection.hasLocations ? 'Aucune donnée trouvée' : inspection.locationsValid ? Object.keys(inspection.draft.locations).length : 'Illisibles · copie brute conservée'}</dd></div></dl>
      <fieldset disabled={!canEdit || applied} className="spatial-edit-fields spatial-transfer-options">
        {inspection.hasLocations && inspection.locationsValid && <><label className="spatial-location-import"><input type="checkbox" checked={includeLocations} onChange={(event) => { if (canEdit && !applied) setIncludeLocations(event.target.checked) }} /><span>Récupérer aussi les localisations — données provenant de cette instance</span></label><p>Les identifiants de matériel sont propres à chaque instance. Les mêmes numéros peuvent désigner d’autres matériels ailleurs. Cochez cette option uniquement si ces données correspondent à cette instance.</p></>}
        {inspection.hasLocations && !inspection.locationsValid && <p>Le plan reste récupérable seul. Les anciennes localisations illisibles sont conservées dans la copie brute pour une récupération séparée.</p>}
        <p>{includeLocations ? 'Le plan et ses localisations anciennes remplaceront ensemble le brouillon actuel.' : current ? 'Le plan remplacera celui du brouillon. Vos localisations actuelles, y compris les liens vers des postes absents, resteront inchangées.' : 'Le plan préparera un premier brouillon, sans localisation ajoutée automatiquement.'}</p>
        <p>Les données d’origine resteront dans ce navigateur. Enregistrez ensuite l’espace pour le partager.</p>
        <Button disabled={!canEdit || applied} onClick={confirm}><ArchiveRestore />{applied ? 'Plan récupéré dans le brouillon' : 'Récupérer ce plan'}</Button>
      </fieldset>
    </div>}
    {message && <p className={message.error ? 'storage-warning' : 'transfer-success'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
  </section>
}
