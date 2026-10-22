import { HardDrive, MapPin, MoveUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Asset } from '@/features/inventory/asset-schema'
import { findWorkstation, type SpatialPlan } from './room-model'
import { defaultPlan } from './plan-document'
import type { useLocalLocations } from './use-local-locations'
import type { WorkspaceDocument } from './workspace-document'
import { findWorkspaceStation } from './workspace-rooms'

interface Props {
  plan?: SpatialPlan
  workspace?: WorkspaceDocument
  asset: Asset
  local: ReturnType<typeof useLocalLocations>
  onShowInPlan: (id: number) => void
}

export function AssetLocationActions({ asset, local, onShowInPlan, plan = defaultPlan, workspace }: Props) {
  const stationId = local.locations[asset.id] || ''
  const station = workspace
    ? findWorkspaceStation(workspace, stationId)?.station
    : findWorkstation(stationId, plan.workstations)

  return (
    <section className="location-actions" aria-label={`Localisation de ${asset.assetTag}`}>
      <h3>
        <MapPin size={13} aria-hidden="true" />
        Localisation dans le plan
      </h3>
      <label htmlFor={`location-${asset.id}`}>Poste de travail</label>
      <select
        id={`location-${asset.id}`}
        value={stationId}
        onChange={(event) => local.associate(asset.id, event.target.value || null)}
      >
        <option value="">Non localisé</option>
        {stationId && !station && <option value={stationId}>Poste absent du plan · lien conservé</option>}
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
          Voir dans le plan
        </Button>
      )}
      <p className="local-save-label" role="status">
        <HardDrive size={12} aria-hidden="true" />
        {local.persisted ? 'Conservé dans ce navigateur' : 'Cette session uniquement'}
      </p>
      <p className="location-help">
        Cette localisation est propre à votre plan local. Le statut du matériel reste inchangé.
      </p>
      {local.warning && (
        <p className="storage-warning" role="alert">
          {local.warning}
        </p>
      )}
    </section>
  )
}
