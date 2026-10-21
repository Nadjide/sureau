import {
  Box,
  CalendarDays,
  Fingerprint,
  Monitor,
  Headphones,
  Network,
  Server,
  Keyboard,
  Mouse,
  Smartphone,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { categoryLabels, statusLabels, type Asset, type AssetCategory } from './asset-schema'
import type { ReactNode } from 'react'

const icons = {
  COMPUTER: Monitor,
  MONITOR: Monitor,
  HEADSET: Headphones,
  PHONE: Smartphone,
  KEYBOARD: Keyboard,
  MOUSE: Mouse,
  NETWORK_EQUIPMENT: Network,
  SERVER: Server,
  OTHER: Box,
} satisfies Record<AssetCategory, typeof Box>

export function AssetIcon({ category, size = 19 }: { category: AssetCategory; size?: number }) {
  const Icon = icons[category]
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />
}

export function AssetStatus({ asset }: { asset: Asset }) {
  return (
    <span className={`asset-status status-${asset.status.toLowerCase()}`}>
      <span aria-hidden="true" />
      {statusLabels[asset.status]}
    </span>
  )
}

function civilDate(value: string | null) {
  if (!value) return 'Non renseignée'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function AssetDetails({
  asset,
  onClose,
  children,
}: {
  asset: Asset | undefined
  onClose?: () => void
  children?: ReactNode
}) {
  if (!asset)
    return (
      <aside className="asset-inspector empty-inspector" aria-label="Fiche matériel">
        <Fingerprint size={28} strokeWidth={1.2} />
        <h2>Un matériel, une histoire.</h2>
        <p>Sélectionnez un équipement pour consulter sa fiche.</p>
      </aside>
    )

  return (
    <aside className="asset-inspector" aria-label={`Fiche de ${asset.name}`}>
      <div className="inspector-top">
        <span className="eyebrow">FICHE MATÉRIEL</span>
        {onClose && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Fermer la fiche">
            <X />
          </Button>
        )}
      </div>
      <div className="inspector-hero">
        <AssetIcon category={asset.category} size={34} />
      </div>
      <p className="asset-tag">{asset.assetTag}</p>
      <h2>{asset.name}</h2>
      <div className="inspector-status">
        <AssetStatus asset={asset} />
      </div>
      <dl className="asset-specs">
        <div>
          <dt>Catégorie</dt>
          <dd>{categoryLabels[asset.category]}</dd>
        </div>
        <div>
          <dt>Marque</dt>
          <dd>{asset.brand || 'Non renseignée'}</dd>
        </div>
        <div>
          <dt>Modèle</dt>
          <dd>{asset.model || 'Non renseigné'}</dd>
        </div>
        <div>
          <dt>Numéro de série</dt>
          <dd className="mono">{asset.serialNumber || 'Non renseigné'}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={12} aria-hidden="true" /> Achat
          </dt>
          <dd>{civilDate(asset.purchaseDate)}</dd>
        </div>
      </dl>
      <Badge variant="outline" className="mt-6">
        Données de l’inventaire
      </Badge>
      {children}
    </aside>
  )
}
