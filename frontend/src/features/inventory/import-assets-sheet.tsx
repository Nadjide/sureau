import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, FileUp, LoaderCircle, Upload, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { ApiError } from '@/lib/api-client'
import { decodeText } from '@/lib/csv'
import { plural, t } from '@/lib/i18n'
import {
  attachServerErrors,
  importAssets,
  importFieldLabels,
  importLimit,
  importTemplate,
  planImport,
  type ImportPlan,
} from './asset-import'
import type { AssetFormField } from './asset-form-model'
import { categoryLabels, statusLabels, type Asset } from './asset-schema'
import './asset-form.css'

const maxFileBytes = 5_000_000
const shownErrors = 50

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([importTemplate()], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = t('sureau-modele-import.csv')
  document.body.append(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function ImportAssetsSheet({
  canEdit,
  onImported,
}: {
  canEdit: boolean
  onImported: (assets: Asset[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [fileName, setFileName] = useState('')
  const [pending, setPending] = useState<'read' | 'import' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const controller = useRef<AbortController | null>(null)

  useEffect(
    () => () => {
      controller.current?.abort()
    },
    [],
  )

  const rows = plan?.rows ?? []
  const invalid = rows.filter((row) => Object.keys(row.errors).length > 0)
  const ready = plan !== null && plan.problems.length === 0 && invalid.length === 0 && rows.length > 0
  const messages = invalid.flatMap((row) =>
    Object.entries(row.errors).map(([field, message]) => ({
      key: `${row.line}-${field}`,
      text: t('Ligne {line} · {column} : {message}', {
        line: row.line,
        column: t(importFieldLabels[field as AssetFormField]),
        message,
      }),
    })),
  )

  function reset() {
    setPlan(null)
    setFileName('')
    setError(null)
  }
  function requestOpen(next: boolean) {
    if (next) {
      if (canEdit) setOpen(true)
      return
    }
    if (pending === 'import') return
    setOpen(false)
    reset()
  }
  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    reset()
    setFileName(file.name)
    if (file.size > maxFileBytes) {
      setPlan({
        rows: [],
        problems: [t('Le fichier dépasse 5 Mo : découpez-le en plusieurs fichiers.')],
        ignoredColumns: [],
      })
      return
    }
    setPending('read')
    try {
      setPlan(planImport(decodeText(await file.arrayBuffer())))
    } catch {
      setPlan({
        rows: [],
        problems: [t('Le fichier n’a pas pu être lu. Enregistrez-le au format CSV et réessayez.')],
        ignoredColumns: [],
      })
    } finally {
      setPending(null)
    }
  }
  async function submit() {
    if (!plan || !ready || controller.current || !canEdit) return
    const request = new AbortController()
    controller.current = request
    setPending('import')
    setError(null)
    try {
      const assets = await importAssets(
        rows.map((row) => row.input!),
        request.signal,
      )
      if (request.signal.aborted) return
      onImported(assets)
      setOpen(false)
      reset()
    } catch (failure) {
      if (request.signal.aborted) return
      if (failure instanceof ApiError && Object.keys(failure.fieldErrors).length > 0) {
        setPlan({ ...plan, rows: attachServerErrors(plan.rows, failure.fieldErrors) })
        setError(
          t(
            'Aucun matériel n’a été importé. Corrigez les lignes signalées dans votre fichier, puis choisissez-le à nouveau.',
          ),
        )
      } else {
        setError(
          failure instanceof Error
            ? failure.message
            : t('L’import n’a pas pu être terminé. Aucun matériel n’a été importé.'),
        )
      }
    } finally {
      if (controller.current === request) {
        controller.current = null
        setPending(null)
      }
    }
  }

  return (
    <>
      {canEdit && (
        <Button variant="outline" className="inventory-import-button" onClick={() => requestOpen(true)}>
          <FileUp aria-hidden="true" />
          {t('Importer')}
        </Button>
      )}
      <Sheet open={open} onOpenChange={requestOpen}>
        <SheetContent
          className="asset-form-sheet asset-import-sheet"
          showCloseButton={false}
          onEscapeKeyDown={(event) => {
            if (pending === 'import') event.preventDefault()
          }}
          onInteractOutside={(event) => {
            if (pending === 'import') event.preventDefault()
          }}
        >
          <SheetHeader>
            <p className="eyebrow">{t('TOUT VOTRE PARC EN UNE FOIS')}</p>
            <SheetTitle>{t('Importer du matériel')}</SheetTitle>
            <SheetDescription>
              {t(
                'Un fichier CSV exporté de votre tableur suffit. Rien n’est enregistré tant que toutes ses lignes ne sont pas valides.',
              )}
            </SheetDescription>
          </SheetHeader>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute top-3 right-3"
            aria-label={t('Fermer l’import')}
            disabled={pending === 'import'}
            onClick={() => requestOpen(false)}
          >
            <X aria-hidden="true" />
          </Button>
          <div className="asset-entry-scroll">
            <section className="asset-import-step" aria-labelledby="asset-import-prepare">
              <h3 id="asset-import-prepare">
                <span aria-hidden="true">1</span>
                {t('Préparez le fichier')}
              </h3>
              <p>
                {t('Une ligne par matériel, avec au moins les colonnes')}{' '}
                <strong>{t(importFieldLabels.assetTag)}</strong> {t('et')} <strong>{t(importFieldLabels.name)}</strong>.{' '}
                {t(
                  'Les autres sont facultatives : Catégorie, État, Numéro de série, Marque, Modèle, Date d’achat (jj/mm/aaaa), Personne, E-mail et Service.',
                )}
              </p>
              <p>
                {t(
                  'Catégories : {categories} (Autre par défaut). États : {statuses} (Disponible par défaut, Affecté si une personne est nommée).',
                  {
                    categories: Object.values(categoryLabels)
                      .map((label) => t(label))
                      .join(', '),
                    statuses: Object.values(statusLabels)
                      .map((label) => t(label))
                      .join(', '),
                  },
                )}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={downloadTemplate}>
                <Download aria-hidden="true" />
                {t('Télécharger le modèle')}
              </Button>
            </section>
            <section className="asset-import-step" aria-labelledby="asset-import-choose">
              <h3 id="asset-import-choose">
                <span aria-hidden="true">2</span>
                {t('Choisissez-le')}
              </h3>
              <label className="asset-import-file" htmlFor="asset-import-file">
                <Upload size={18} aria-hidden="true" />
                <span>
                  {fileName ? (
                    <>
                      {t('Fichier choisi :')} <strong>{fileName}</strong>. {t('Choisir un autre fichier')}
                    </>
                  ) : (
                    t('Choisir un fichier CSV ({limit} lignes au plus)', { limit: importLimit })
                  )}
                </span>
                <input
                  id="asset-import-file"
                  type="file"
                  accept=".csv,text/csv"
                  disabled={pending !== null}
                  onChange={(event) => {
                    void choose(event)
                  }}
                />
              </label>
              {pending === 'read' && (
                <p className="asset-history-status" role="status">
                  <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
                  {t('Lecture du fichier…')}
                </p>
              )}
            </section>
            {plan && (
              <section className="asset-import-step" aria-labelledby="asset-import-check">
                <h3 id="asset-import-check">
                  <span aria-hidden="true">3</span>
                  {t('Vérifiez')}
                </h3>
                {plan.problems.length > 0 && (
                  <ul className="asset-form-error asset-import-problems" role="alert">
                    {plan.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                )}
                {plan.problems.length === 0 && (
                  <p
                    className={invalid.length ? 'asset-import-summary is-invalid' : 'asset-import-summary'}
                    role="status"
                  >
                    {invalid.length
                      ? plural(
                          invalid.length,
                          '{count} ligne sur {total} à corriger dans votre fichier avant l’import.',
                          '{count} lignes sur {total} à corriger dans votre fichier avant l’import.',
                          { total: rows.length },
                        )
                      : plural(rows.length, '{count} matériel prêt à importer.', '{count} matériels prêts à importer.')}
                  </p>
                )}
                {plan.ignoredColumns.length > 0 && (
                  <p className="asset-history-note">
                    {t('Colonnes ignorées : {columns}.', { columns: plan.ignoredColumns.join(', ') })}
                  </p>
                )}
                {messages.length > 0 && (
                  <ul className="asset-import-errors" aria-label={t('Lignes à corriger')}>
                    {messages.slice(0, shownErrors).map((message) => (
                      <li key={message.key}>{message.text}</li>
                    ))}
                    {messages.length > shownErrors && (
                      <li>
                        {plural(
                          messages.length - shownErrors,
                          '… et {count} autre problème.',
                          '… et {count} autres problèmes.',
                        )}
                      </li>
                    )}
                  </ul>
                )}
                {ready && (
                  <div className="asset-import-preview">
                    <table>
                      <caption className="sr-only">{t('Premières lignes du fichier')}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t(importFieldLabels.assetTag)}</th>
                          <th scope="col">{t(importFieldLabels.name)}</th>
                          <th scope="col">{t('État')}</th>
                          <th scope="col">{t('Personne')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.slice(0, 5).map((row) => (
                          <tr key={row.line}>
                            <td>{row.values.assetTag}</td>
                            <td>{row.values.name}</td>
                            <td>{t(statusLabels[row.values.status])}</td>
                            <td>{row.values.assigneeName || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {rows.length > 5 && (
                      <p className="asset-history-note">
                        {plural(rows.length - 5, '… et {count} autre.', '… et {count} autres.')}
                      </p>
                    )}
                  </div>
                )}
              </section>
            )}
            {error && (
              <p className="asset-form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="asset-form-footer">
            <Button type="button" variant="outline" disabled={pending === 'import'} onClick={() => requestOpen(false)}>
              {t('Annuler')}
            </Button>
            <Button
              type="button"
              disabled={!ready || pending !== null || !canEdit}
              onClick={() => {
                void submit()
              }}
            >
              {pending === 'import' ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <FileUp aria-hidden="true" />
              )}
              {pending === 'import'
                ? t('Import en cours…')
                : ready
                  ? plural(rows.length, 'Importer {count} matériel', 'Importer {count} matériels')
                  : t('Importer')}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
