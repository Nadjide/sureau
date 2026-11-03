import { useCallback, useEffect, useRef, useState } from 'react'
import { History, LoaderCircle, RefreshCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { t } from '@/lib/i18n'
import {
  changeLabel,
  changeValue,
  eventAuthor,
  eventDate,
  eventTitle,
  getAssetHistory,
  historyLimit,
  isCreation,
  type AssetEvent,
} from './asset-history'
import type { Asset } from './asset-schema'
import './asset-form.css'

type HistoryState =
  { phase: 'loading' } | { phase: 'error'; message: string } | { phase: 'ready'; events: AssetEvent[] }

function EventChanges({ event }: { event: AssetEvent }) {
  if (event.changes.length === 0) {
    return isCreation(event) ? (
      <p className="asset-history-note">{t('Matériel enregistré avant la tenue de l’historique.')}</p>
    ) : null
  }
  return (
    <ul className="asset-history-changes">
      {event.changes.map((change) => (
        <li key={change.field}>
          <span className="asset-history-field">{changeLabel(change.field)}</span>
          {isCreation(event) ? (
            <span>{changeValue(change.field, change.to)}</span>
          ) : (
            <span>
              <del>{changeValue(change.field, change.from)}</del>
              <span aria-hidden="true"> → </span>
              <span className="sr-only"> devient </span>
              <ins>{changeValue(change.field, change.to)}</ins>
            </span>
          )}
        </li>
      ))}
    </ul>
  )
}

/** Loads the history each time it opens: it reflects changes made since by anyone on the instance. */
export function AssetHistorySheet({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const [state, setState] = useState<HistoryState>({ phase: 'loading' })
  const controller = useRef<AbortController | null>(null)

  const fetchHistory = useCallback(() => {
    controller.current?.abort()
    const request = new AbortController()
    controller.current = request
    getAssetHistory(asset.id, request.signal).then(
      (events) => {
        if (!request.signal.aborted) setState({ phase: 'ready', events })
      },
      (failure: unknown) => {
        if (!request.signal.aborted) {
          setState({
            phase: 'error',
            message: failure instanceof Error ? failure.message : t('L’historique n’a pas pu être chargé.'),
          })
        }
      },
    )
  }, [asset.id])

  useEffect(() => {
    fetchHistory()
    return () => controller.current?.abort()
  }, [fetchHistory])

  function retry() {
    setState({ phase: 'loading' })
    fetchHistory()
  }

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <SheetContent className="asset-form-sheet asset-history-sheet" showCloseButton={false}>
        <SheetHeader>
          <p className="eyebrow">{t('CHAQUE CHANGEMENT, SON AUTEUR')}</p>
          <SheetTitle>{t('Historique')}</SheetTitle>
          <SheetDescription>
            {asset.name} · {asset.assetTag}.{' '}
            {t('Les changements enregistrés sur cette instance, du plus récent au plus ancien.')}
          </SheetDescription>
        </SheetHeader>
        <Button
          variant="ghost"
          size="icon-sm"
          className="absolute top-3 right-3"
          aria-label={t('Fermer l’historique')}
          onClick={onClose}
        >
          <X aria-hidden="true" />
        </Button>
        <div className="asset-entry-scroll">
          {state.phase === 'loading' && (
            <p className="asset-history-status" role="status">
              <LoaderCircle className="animate-spin" size={16} aria-hidden="true" />
              {t('Chargement de l’historique…')}
            </p>
          )}
          {state.phase === 'error' && (
            <div className="asset-form-error" role="alert">
              <p>{state.message}</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={retry}>
                <RefreshCw aria-hidden="true" />
                {t('Réessayer')}
              </Button>
            </div>
          )}
          {state.phase === 'ready' && state.events.length === 0 && (
            <p className="asset-history-status" role="status">
              <History size={16} aria-hidden="true" />
              {t('Aucun changement n’est enregistré pour ce matériel.')}
            </p>
          )}
          {state.phase === 'ready' && state.events.length > 0 && (
            <>
              <ol className="asset-history-list" aria-label={t('Historique de {tag}', { tag: asset.assetTag })}>
                {state.events.map((event) => (
                  <li key={event.id}>
                    <h3>{eventTitle(event)}</h3>
                    <p className="asset-history-meta">
                      <time dateTime={event.occurredAt}>{eventDate(event)}</time> · {eventAuthor(event)}
                    </p>
                    <EventChanges event={event} />
                  </li>
                ))}
              </ol>
              {state.events.length >= historyLimit && (
                <p className="asset-history-note">
                  {t('Seuls les {count} changements les plus récents sont affichés.', { count: historyLimit })}
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
