import { Armchair, Box, HardDrive, MapPin, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AssetDetails, AssetIcon, AssetStatus } from '@/features/inventory/asset-details'
import type { useInventory } from '@/features/inventory/use-inventory'
import { AssetLocationActions } from './asset-location-actions'
import { getWorkstationAssetIds } from './local-locations'
import { findWorkstation, room } from './room-model'
import type { useLocalLocations } from './use-local-locations'

interface Props {
  selectedWorkstationId: string | null
  selectedAssetId: number | null
  onSelectAsset: (id: number | null) => void
  onOpenInventory: () => void
  onShowInPlan: (id: number) => void
  inventory: ReturnType<typeof useInventory>
  local: ReturnType<typeof useLocalLocations>
}

export function SpatialInspector({
  selectedWorkstationId,
  selectedAssetId,
  onSelectAsset,
  onOpenInventory,
  onShowInPlan,
  inventory,
  local,
}: Props) {
  const station = findWorkstation(selectedWorkstationId)
  const ids = station ? getWorkstationAssetIds(local.locations, station.id) : []
  const selectedAsset = inventory.assets?.find((asset) => asset.id === selectedAssetId)
  const verified = inventory.status === 'ready'

  if (selectedAsset && local.locations[selectedAsset.id] === selectedWorkstationId)
    return (
      <AssetDetails
        asset={selectedAsset}
        onClose={() => onSelectAsset(null)}
        notice={inventory.status !== 'ready' && (
          <div className="spatial-data-notice" role={inventory.status === 'error' ? 'alert' : 'status'}>
            {inventory.status === 'error'
              ? 'Inventaire indisponible. Les dernières données reçues restent affichées.'
              : 'Actualisation de l’inventaire… Les dernières informations reçues restent affichées.'}
          </div>
        )}
      >
        <AssetLocationActions asset={selectedAsset} local={local} onShowInPlan={onShowInPlan} />
        <Button variant="ghost" className="w-full mt-3" onClick={() => onSelectAsset(null)}>
          Retour au {station?.label.toLocaleLowerCase('fr') || 'poste'}
        </Button>
      </AssetDetails>
    )

  return (
    <aside className="asset-inspector workstation-inspector" aria-label="Fiche du poste">
      <p className="eyebrow">IMPLANTATION LOCALE</p>
      <div className="inspector-hero">
        <Armchair size={34} strokeWidth={1.3} />
      </div>
      <p className="asset-tag">{station?.id.toUpperCase().replace('DESK', 'POSTE') || 'POSTE'}</p>
      <h2>{station?.label || 'Sélectionnez un poste'}</h2>
      <Badge variant="secondary">Plan local</Badge>
      <dl className="asset-specs mt-6">
        <div>
          <dt>Salle</dt>
          <dd>{room.name}</dd>
        </div>
        <div>
          <dt>Bureau</dt>
          <dd>200 × 100 cm</dd>
        </div>
      </dl>
      <section className="linked-assets" aria-label="Matériel localisé sur ce poste">
        <h3>
          <MapPin size={13} aria-hidden="true" />
          Matériel localisé <span>{ids.length}</span>
        </h3>
        {!verified && (
          <p className="location-help">
            {inventory.status === 'loading'
              ? 'Vérification de l’inventaire…'
              : 'Inventaire indisponible. Les localisations sont conservées, sans vérification actuelle du matériel.'}
          </p>
        )}
        {ids.length === 0 && (
          <div className="no-linked-assets">
            <Box size={22} strokeWidth={1.3} />
            <p>Aucun matériel localisé ici.</p>
          </div>
        )}
        {ids.map((id) => {
          const asset = inventory.assets?.find((item) => item.id === id)
          return (
            <div key={id} className="linked-asset-row">
              {asset ? (
                <button className="linked-asset-select" onClick={() => onSelectAsset(id)}>
                  <span className="asset-row-icon">
                    <AssetIcon category={asset.category} size={16} />
                  </span>
                  <span>
                    <strong>{asset.name}</strong>
                    <small>{asset.assetTag}</small>
                    <AssetStatus asset={asset} />
                  </span>
                </button>
              ) : (
                <span className="missing-linked-asset">
                  Matériel #{id}
                  <small>
                    {verified ? 'Introuvable dans l’inventaire' : 'Localisation non vérifiée'}
                  </small>
                </span>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => local.associate(id, null)}
                aria-label={`Retirer la localisation du matériel ${asset?.assetTag || id}`}
              >
                <Trash2 size={12} />
              </Button>
            </div>
          )
        })}
        <Button variant="outline" className="w-full mt-3" onClick={onOpenInventory}>
          Choisir du matériel
        </Button>
      </section>
      <p className="local-save-label">
        <HardDrive size={12} aria-hidden="true" />
        {local.persisted ? 'Localisations dans ce navigateur' : 'Cette session uniquement'}
      </p>
      {local.warning && (
        <p className="storage-warning" role="alert">
          {local.warning}
        </p>
      )}
      <p className="location-help">
        Le mobilier illustratif ne représente pas automatiquement le matériel localisé.
      </p>
    </aside>
  )
}
