import { useState, type ReactNode } from 'react'
import {
  AlertCircle,
  ArrowUpRight,
  Boxes,
  LoaderCircle,
  RefreshCw,
  Search,
  SearchX,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AssetDetails, AssetIcon, AssetStatus } from './asset-details'
import {
  categoryLabels,
  statusLabels,
  type Asset,
  type AssetStatus as Status,
} from './asset-schema'
import type { useInventory } from './use-inventory'

type Props = {
  inventory: ReturnType<typeof useInventory>
  selectedAssetId: number | null
  onSelect: (id: number | null) => void
  locationLabel: (id: number) => string
  renderAssetActions: (asset: Asset) => ReactNode
}

export function InventoryPanel({
  inventory,
  selectedAssetId,
  onSelect,
  locationLabel,
  renderAssetActions,
}: Props) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const { assets, status: requestStatus, error, reload } = inventory
  const selected = assets?.find((asset) => asset.id === selectedAssetId)
  const normalized = query.trim().toLocaleLowerCase('fr')
  const filtered =
    assets?.filter(
      (asset) =>
        (!status || asset.status === status) &&
        (!normalized ||
          [asset.name, asset.assetTag, asset.serialNumber, asset.brand, asset.model].some((value) =>
            value?.toLocaleLowerCase('fr').includes(normalized),
          )),
    ) ?? []

  return (
    <div className="inventory-layout">
      <section
        className="inventory-content"
        aria-label="Inventaire du matériel"
        aria-busy={requestStatus === 'loading'}
      >
        <div className="inventory-toolbar">
          <label className="search-field">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="Rechercher du matériel"
              placeholder="Rechercher un nom, un identifiant…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="status-filter"
            aria-label="Filtrer par état"
            value={status}
            onChange={(event) => setStatus(event.target.value as Status | '')}
          >
            <option value="">Tous les états</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={reload}
            disabled={requestStatus === 'loading'}
            aria-label="Actualiser l’inventaire"
          >
            <RefreshCw className={requestStatus === 'loading' ? 'animate-spin' : ''} />
          </Button>
        </div>
        {error && (
          <div className="inventory-alert" role="alert">
            <AlertCircle size={17} aria-hidden="true" />
            <div>
              <strong>Inventaire indisponible</strong>
              <p>
                {error.message}
                {assets ? ' Les dernières données reçues restent affichées.' : ''}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={reload}
              disabled={requestStatus === 'loading'}
            >
              Réessayer
            </Button>
          </div>
        )}
        {assets && selectedAssetId !== null && !selected && (
          <p className="selection-notice" role="status">
            Le matériel sélectionné n’est plus présent dans l’inventaire.{' '}
            <button onClick={() => onSelect(null)}>Effacer la sélection</button>
          </p>
        )}
        {requestStatus === 'loading' && !assets && (
          <div className="inventory-empty" role="status">
            <LoaderCircle className="animate-spin" size={25} />
            <h2>Lecture de l’inventaire</h2>
            <p>Récupération de votre matériel…</p>
          </div>
        )}
        {requestStatus === 'error' && !assets && (
          <div className="inventory-empty">
            <Boxes size={32} strokeWidth={1.2} />
            <h2>Le matériel reste à portée.</h2>
            <p>
              La connexion à l’inventaire est momentanément indisponible. Vous pouvez continuer à
              parcourir votre espace local.
            </p>
          </div>
        )}
        {assets && assets.length === 0 && (
          <div className="inventory-empty">
            <Boxes size={32} strokeWidth={1.2} />
            <h2>Votre inventaire est vide.</h2>
            <p>Les équipements enregistrés dans votre inventaire apparaîtront ici.</p>
          </div>
        )}
        {assets && assets.length > 0 && (
          <>
            <div className="inventory-count" role="status">
              {filtered.length} équipement{filtered.length > 1 ? 's' : ''}
              {query || status ? ` sur ${assets.length}` : ''}
              <span>
                {requestStatus === 'error'
                  ? 'Dernières données reçues'
                  : requestStatus === 'loading'
                    ? 'Actualisation…'
                    : 'Inventaire connecté'}
              </span>
            </div>
            {filtered.length === 0 ? (
              <div className="inventory-empty">
                <SearchX size={30} strokeWidth={1.2} />
                <h2>Aucun résultat</h2>
                <p>Essayez un autre nom ou modifiez les filtres.</p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setQuery('')
                    setStatus('')
                  }}
                >
                  Effacer les filtres
                </Button>
              </div>
            ) : (
              <div className="inventory-table-wrap">
                <table className="inventory-table">
                  <thead>
                    <tr>
                      <th>Matériel</th>
                      <th>Catégorie</th>
                      <th>État</th>
                      <th>
                        <span className="sr-only">Fiche</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((asset) => (
                      <tr
                        key={asset.id}
                        className={asset.id === selectedAssetId ? 'is-selected' : ''}
                      >
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
                                <span className="asset-row-location">
                                  {' '}
                                  · {locationLabel(asset.id)}
                                </span>
                              </small>
                            </span>
                          </button>
                        </td>
                        <td className="category-cell">{categoryLabels[asset.category]}</td>
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
        {selected && renderAssetActions(selected)}
      </AssetDetails>
    </div>
  )
}
