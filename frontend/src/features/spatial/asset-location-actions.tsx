import { HardDrive, MapPin, MoveUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Asset } from '@/features/inventory/asset-schema'
import { t } from '@/lib/i18n'
import { findWorkstation, type SpatialPlan } from './room-model'
import { defaultPlan } from './plan-document'
import type { useLocalLocations } from './use-local-locations'
import type { WorkspaceDocument } from './workspace-document'
import { findWorkspaceStation } from './workspace-rooms'

interface Props {
  canEdit?: boolean
  plan?: SpatialPlan
  workspace?: WorkspaceDocument
  asset: Asset
  local: ReturnType<typeof useLocalLocations>
  onShowInPlan: (id: number) => void
}

export function AssetLocationActions({ asset, local, canEdit = true, onShowInPlan, plan = defaultPlan, workspace }: Props) {
  const stationId = local.locations[asset.id] || ''
  const station = workspace
    ? findWorkspaceStation(workspace, stationId)?.station
    : findWorkstation(stationId, plan.workstations)

  return (
    <section className="location-actions" aria-label={t('Localisation de {tag}', { tag: asset.assetTag })}>
      <h3>
        <MapPin size={13} aria-hidden="true" />
        {t('Localisation dans le plan')}
      </h3>
      <label htmlFor={`location-${asset.id}`}>{t('Poste de travail')}</label>
      <select
        id={`location-${asset.id}`}
        value={stationId}
        disabled={!canEdit}
        onChange={(event) => { if (canEdit) local.associate(asset.id, event.target.value || null) }}
      >
        <option value="">{t('Non localisé')}</option>
        {stationId && !station && <option value={stationId}>{t('Poste absent du plan · lien conservé')}</option>}
        {workspace
          ? workspace.floors.flatMap((floor) => workspace.rooms
            .filter((room) => room.floorId === floor.id && room.plan.workstations.length > 0)
            .map((room) => (
              <optgroup key={room.plan.id} label={`${floor.name} · ${room.plan.name}`}>
                {room.plan.workstations.map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </optgroup>
            )))
          : plan.workstations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} · {plan.name}
            </option>
          ))}
      </select>
      {station && (
        <Button variant="outline" className="w-full mt-3" onClick={() => onShowInPlan(asset.id)}>
          <MoveUpRight />
          {t('Voir dans le plan')}
        </Button>
      )}
      <p className="local-save-label" role="status">
        <HardDrive size={12} aria-hidden="true" />
        {local.persisted ? t('Localisation enregistrée sur le serveur') : t('Brouillon · enregistrer pour partager')}
      </p>
      <p className="location-help">
        {t('Cette localisation fait partie de l’espace partagé. Appliquez vos changements avec Enregistrer l’espace. Le statut du matériel reste inchangé.')}
      </p>
      {local.warning && (
        <p className="storage-warning" role="alert">
          {local.warning}
        </p>
      )}
    </section>
  )
}
