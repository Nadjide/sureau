import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  LoaderCircle,
  RefreshCw,
  Search,
  SearchX,
  CheckCircle2,
  X,
  Pencil,
  Archive,
  History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssetDetails, AssetIcon, AssetStatus } from './asset-details'
import { categoryLabels, statusLabels, type Asset, type AssetStatus as Status } from './asset-schema'
import type { useInventory } from './use-inventory'
import { useSession } from '@/features/auth/use-session'
import { plural, t } from '@/lib/i18n'
import { CreateAssetSheet } from './create-asset-sheet'
import { ImportAssetsSheet } from './import-assets-sheet'
import { EditAssetSheet } from './edit-asset-sheet'
import { AssetHistorySheet } from './asset-history-sheet'
import { RetireAssetDialog } from './retire-asset-dialog'

type Props = {
  inventory: ReturnType<typeof useInventory>
  selectedAssetId: number | null
  onSelect: (id: number | null) => void
  locationLabel: (id: number) => string
  renderAssetActions: (asset: Asset) => ReactNode
}

export function InventoryPanel({ inventory, selectedAssetId, onSelect, locationLabel, renderAssetActions }: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [confirmation, setConfirmation] = useState<{ asset: Asset; action: 'created' | 'updated' | 'retired' } | null>(
    null,
  )
  const [imported, setImported] = useState<number | null>(null)
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null)
  const [retiringAsset, setRetiringAsset] = useState<Asset | null>(null)
  const [historyAsset, setHistoryAsset] = useState<Asset | null>(null)
  const { canEdit } = useSession()
  const { assets, status: requestStatus, error, reload } = inventory
  const selected = assets?.find((asset) => asset.id === selectedAssetId)
  const normalized = query.trim().toLocaleLowerCase('fr')
  const filtered =
    assets?.filter(
      (asset) =>
        (!status || asset.status === status) &&
        (!normalized ||
          [
            asset.name,
            asset.assetTag,
            asset.serialNumber,
            asset.brand,
            asset.model,
            asset.assignee?.name,
            asset.assignee?.email,
            asset.assignee?.department,
          ].some((value) => value?.toLocaleLowerCase('fr').includes(normalized))),
    ) ?? []

  return (
    <div className="inventory-layout">
      <section
        className="inventory-content"
        aria-label={t('Inventaire du matériel')}
        aria-busy={requestStatus === 'loading'}
      >
        <div className="inventory-toolbar">
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label={t('Rechercher du matériel')}
              placeholder={t('Rechercher un nom, un identifiant, une personne…')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="status-filter"
            aria-label={t('Filtrer par état')}
            value={status}
            onChange={(event) => setStatus(event.target.value as Status | '')}
          >
            <option value="">{t('Tous les états')}</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {t(label)}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            disabled={requestStatus === 'loading'}
            aria-label={t('Actualiser l’inventaire')}
          >
            <RefreshCw className={requestStatus === 'loading' ? 'animate-spin' : ''} />
          </Button>
          <ImportAssetsSheet
            canEdit={canEdit}
            onImported={(assets) => {
              setConfirmation(null)
              setImported(assets.length)
              setQuery('')
              setStatus('')
              reload()
            }}
          />
          <CreateAssetSheet
            canEdit={canEdit}
            onCreated={(asset) => {
              setImported(null)
              setConfirmation({ asset, action: 'created' })
              setQuery('')
              setStatus('')
              inventory.refreshAfterMutation(asset)
              onSelect(asset.id)
            }}
          />
        </div>
        {imported !== null && (
          <div className="inventory-success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <p>
              {plural(
                imported,
                '{count} matériel a été importé dans l’inventaire partagé.',
                '{count} matériels ont été importés dans l’inventaire partagé.',
              )}
              {requestStatus === 'loading' ? ` ${t('Actualisation du parc…')}` : ''}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Masquer la confirmation de l’import')}
              onClick={() => setImported(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        {confirmation && (
          <div className="inventory-success" role="status">
            <CheckCircle2 size={16} aria-hidden="true" />
            <p>
              <strong>{confirmation.asset.name}</strong> ({confirmation.asset.assetTag}){' '}
              {confirmation.action === 'created'
                ? t('a été enregistré dans l’inventaire partagé.')
                : confirmation.action === 'updated'
                  ? t('a été mis à jour dans l’inventaire partagé.')
                  : t('a été retiré du parc dans l’inventaire partagé.')}
              {requestStatus === 'loading' ? ` ${t('Actualisation du parc…')}` : ''}
            </p>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t('Masquer la confirmation')}
              onClick={() => setConfirmation(null)}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        )}
        {error && (
          <div className="inventory-alert" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <div>
              <strong>{t('Inventaire indisponible')}</strong>
              <p>
                {error.message}
                {assets ? ` ${t('Les dernières données reçues restent affichées.')}` : ''}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={reload} disabled={requestStatus === 'loading'}>
              {t('Réessayer')}
            </Button>
          </div>
        )}
        {assets && requestStatus === 'ready' && selectedAssetId !== null && !selected && (
          <p className="selection-notice" role="status">
            {t('Le matériel sélectionné n’est plus présent dans l’inventaire.')}{' '}
            <button onClick={() => onSelect(null)}>{t('Effacer la sélection')}</button>
          </p>
        )}
        {requestStatus === 'loading' && !assets && (
          <div className="inventory-empty" role="status">
            <LoaderCircle className="animate-spin" size={25} />
            <h2>{t('Lecture de l’inventaire')}</h2>
            <p>{t('Récupération de votre matériel…')}</p>
          </div>
        )}
        {requestStatus === 'error' && !assets && (
          <div className="inventory-empty">
            <Boxes size={32} strokeWidth={1.2} />
            <h2>{t('Le matériel reste à portée.')}</h2>
            <p>
              {t(
                'La connexion à l’inventaire est momentanément indisponible. Vous pouvez continuer à parcourir votre espace.',
              )}
            </p>
          </div>
        )}
        {assets && assets.length === 0 && (
          <div className="inventory-empty">
            <Boxes size={32} strokeWidth={1.2} />
            <h2>{t('Votre inventaire est vide.')}</h2>
            <p>{t('Les équipements enregistrés dans votre inventaire apparaîtront ici.')}</p>
          </div>
        )}
        {assets && assets.length > 0 && (
          <>
            <div className="inventory-count" role="status">
              {query || status
                ? plural(filtered.length, '{count} équipement sur {total}', '{count} équipements sur {total}', {
                    total: assets.length,
                  })
                : plural(filtered.length, '{count} équipement', '{count} équipements')}
              <span>
                {requestStatus === 'error'
                  ? t('Dernières données reçues')
                  : requestStatus === 'loading'
                    ? t('Actualisation…')
                    : t('Inventaire connecté')}
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="inventory-empty">
                <SearchX size={30} strokeWidth={1.2} />
                <h2>{t('Aucun résultat')}</h2>
                <p>{t('Essayez un autre nom ou modifiez les filtres.')}</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('')
                    setStatus('')
                  }}
                >
                  {t('Effacer les filtres')}
                </Button>
              </div>
            ) : (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>{t('Matériel')}</th>
                      <th>{t('Catégorie')}</th>
                      <th>{t('État')}</th>
                      <th>
                        <span className="sr-only">{t('Fiche')}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((asset) => (
                      <tr key={asset.id} className={asset.id === selectedAssetId ? 'is-selected' : ''}>
                        <td>
                          <button
                            className="asset-select"
                            onClick={() => onSelect(asset.id)}
                            aria-pressed={asset.id === selectedAssetId}
                          >
                            <span className="asset-row-icon">
                              <AssetIcon category={asset.category} />
                            </span>
                            <span>
                              <strong>{asset.name}</strong>
                              <small>
                                {asset.assetTag}
                                {asset.assignee && <span className="asset-row-assignee"> · {asset.assignee.name}</span>}
                                <span className="asset-row-location"> · {locationLabel(asset.id)}</span>
                              </small>
                            </span>
                          </button>
                        </td>
                        <td className="category-cell">{t(categoryLabels[asset.category])}</td>
                        <td>
                          <AssetStatus asset={asset} />
                        </td>
                        <td>
                          <ArrowUpRight size={14} aria-hidden="true" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </section>
      <AssetDetails asset={selected} onClose={() => onSelect(null)}>
        {selected && canEdit && (
          <Button variant="outline" className="asset-edit-button" onClick={() => setEditingAsset(selected)}>
            <Pencil aria-hidden="true" />
            {t('Modifier la fiche')}
          </Button>
        )}
        {selected && (
          <Button variant="outline" className="asset-history-button" onClick={() => setHistoryAsset(selected)}>
            <History aria-hidden="true" />
            {t('Voir l’historique')}
          </Button>
        )}
        {selected && renderAssetActions(selected)}
        {selected && canEdit && selected.status !== 'RETIRED' && (
          <div className="asset-retire-action">
            <Button
              variant="ghost"
              disabled={selected.status === 'ASSIGNED'}
              onClick={() => setRetiringAsset(selected)}
            >
              <Archive aria-hidden="true" />
              {t('Retirer du parc')}
            </Button>
            {selected.status === 'ASSIGNED' && (
              <p>{t('Ce matériel est affecté. Désaffectez-le dans sa fiche avant de le retirer du parc.')}</p>
            )}
          </div>
        )}
      </AssetDetails>
      {editingAsset && (
        <EditAssetSheet
          key={editingAsset.id}
          asset={editingAsset}
          canEdit={canEdit}
          onClose={() => setEditingAsset(null)}
          onReloaded={inventory.refreshAfterMutation}
          onSaved={(asset) => {
            setConfirmation({ asset, action: 'updated' })
            setQuery('')
            setStatus('')
            inventory.refreshAfterMutation(asset)
            onSelect(asset.id)
          }}
        />
      )}
      {historyAsset && (
        <AssetHistorySheet key={historyAsset.id} asset={historyAsset} onClose={() => setHistoryAsset(null)} />
      )}
      {retiringAsset && (
        <RetireAssetDialog
          key={retiringAsset.id}
          asset={retiringAsset}
          canEdit={canEdit}
          onClose={() => setRetiringAsset(null)}
          onReloaded={inventory.refreshAfterMutation}
          onRetired={(asset) => {
            setConfirmation({ asset, action: 'retired' })
            setQuery('')
            setStatus('')
            inventory.refreshAfterMutation(asset)
            onSelect(asset.id)
          }}
        />
      )}
    </div>
  )
}
