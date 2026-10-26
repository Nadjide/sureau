import { Armchair, Box, HardDrive, MapPin, Trash2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AssetDetails, AssetIcon, AssetStatus } from '@/features/inventory/asset-details'
import type { useInventory } from '@/features/inventory/use-inventory'
import { t } from '@/lib/i18n'
import { AssetLocationActions } from './asset-location-actions'
import { getWorkstationAssetIds } from './local-locations'
import { findWorkstation, type SpatialPlan } from './room-model'
import { defaultPlan } from './plan-document'
import type { useLocalLocations } from './use-local-locations'
import type { WorkspaceDocument } from './workspace-document'
import { findWorkspaceStation } from './workspace-rooms'

interface Props {
  canEdit?: boolean
  plan?: SpatialPlan
  workspace?: WorkspaceDocument
  selectedWorkstationId: string | null
  selectedAssetId: number | null
  onSelectAsset: (id: number | null) => void
  onOpenInventory: () => void
  onShowInPlan: (id: number) => void
  inventory: Pick<ReturnType<typeof useInventory>, 'assets' | 'status' | 'error' | 'reload'>
  local: ReturnType<typeof useLocalLocations>
}

export function SpatialInspector({
  plan = defaultPlan,
  canEdit = true,
  workspace,
  selectedWorkstationId,
  selectedAssetId,
  onSelectAsset,
  onOpenInventory,
  onShowInPlan,
  inventory,
  local,
}: Props) {
  const location = workspace && selectedWorkstationId
    ? findWorkspaceStation(workspace, selectedWorkstationId)
    : undefined
  const station = workspace ? location?.station : findWorkstation(selectedWorkstationId, plan.workstations)
  const inspectedPlan = location?.room.plan ?? plan
  const inspectedRoom = location?.room ?? workspace?.rooms.find((room) => room.plan.id === inspectedPlan.id)
  const floor = location?.floor ?? workspace?.floors.find((item) => item.id === inspectedRoom?.floorId)
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
              ? t('Inventaire indisponible. Les dernières données reçues restent affichées.')
              : t('Actualisation de l’inventaire… Les dernières informations reçues restent affichées.')}
          </div>
        )}
      >
        <AssetLocationActions
          asset={selectedAsset}
          canEdit={canEdit}
          local={local}
          onShowInPlan={onShowInPlan}
          plan={plan}
          {...(workspace ? { workspace } : {})}
        />
        <Button variant="ghost" className="w-full mt-3" onClick={() => onSelectAsset(null)}>
          {t('Retour au {name}', { name: station?.label.toLocaleLowerCase() || t('poste') })}
        </Button>
      </AssetDetails>
    )

  return (
    <aside className="asset-inspector workstation-inspector" aria-label={t('Fiche du poste')}>
      <p className="eyebrow">{t('IMPLANTATION DE L’ESPACE')}</p>
      <div className="inspector-hero">
        <Armchair size={34} strokeWidth={1.3} />
      </div>
      <p className="asset-tag">{station ? station.id.toUpperCase().replace('DESK', t('POSTE')) : t('POSTE')}</p>
      <h2>{station?.label || t('Sélectionnez un poste')}</h2>
      <Badge variant="secondary">{local.persisted ? t('Version serveur') : t('Brouillon')}</Badge>
      <dl className="asset-specs mt-6">
        <div>
          <dt>{t('Salle')}</dt>
          <dd>{inspectedPlan.name}</dd>
        </div>
        {floor && (
          <div>
            <dt>{t('Étage')}</dt>
            <dd>{floor.name}</dd>
          </div>
        )}
        <div>
          <dt>{t('Bureau')}</dt>
          <dd>{station ? `${Math.round(station.width * 100)} × ${Math.round(station.depth * 100)} cm` : '—'}</dd>
        </div>
      </dl>
      <section className="linked-assets" aria-label={t('Matériel localisé sur ce poste')}>
        <h3>
          <MapPin size={13} aria-hidden="true" />
          {t('Matériel localisé')} <span>{ids.length}</span>
        </h3>
        {!verified && (
          <p className="location-help">
            {inventory.status === 'loading'
              ? t('Vérification de l’inventaire…')
              : t('Inventaire indisponible. Les localisations sont conservées, sans vérification actuelle du matériel.')}
          </p>
        )}
        {ids.length === 0 && (
          <div className="no-linked-assets">
            <Box size={22} strokeWidth={1.3} />
            <p>{t('Aucun matériel localisé ici.')}</p>
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
                  {t('Matériel #{id}', { id })}
                  <small>
                    {verified ? t('Introuvable dans l’inventaire') : t('Localisation non vérifiée')}
                  </small>
                </span>
              )}
              {canEdit && <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => { if (canEdit) local.associate(id, null) }}
                aria-label={t('Retirer la localisation du matériel {tag}', { tag: asset?.assetTag || id })}
              >
                <Trash2 size={12} />
              </Button>}
            </div>
          )
        })}
        <Button variant="outline" className="w-full mt-3" onClick={onOpenInventory}>
          {canEdit ? t('Choisir du matériel') : t('Voir le matériel')}
        </Button>
      </section>
      <p className="local-save-label">
        <HardDrive size={12} aria-hidden="true" />
        {local.persisted ? t('Localisations enregistrées sur le serveur') : t('Brouillon · enregistrer pour partager')}
      </p>
      {local.warning && (
        <p className="storage-warning" role="alert">
          {local.warning}
        </p>
      )}
      <p className="location-help">
        {t('Le mobilier illustratif ne représente pas automatiquement le matériel localisé.')}
      </p>
    </aside>
  )
}
