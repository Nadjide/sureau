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
  UserRound,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/i18n'
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
      {t(statusLabels[asset.status])}
    </span>
  )
}

function civilDate(value: string | null) {
  if (!value) return t('Non renseignée')
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function AssetDetails({
  asset,
  onClose,
  children,
  notice,
}: {
  asset: Asset | undefined
  onClose?: () => void
  children?: ReactNode
  notice?: ReactNode
}) {
  if (!asset)
    return (
      <aside className="asset-inspector empty-inspector" aria-label={t('Fiche matériel')}>
        <Fingerprint size={28} strokeWidth={1.2} />
        <h2>{t('Un matériel, une histoire.')}</h2>
        <p>{t('Sélectionnez un équipement pour consulter sa fiche.')}</p>
      </aside>
    )

  return (
    <aside className="asset-inspector" aria-label={t('Fiche de {name}', { name: asset.name })}>
      <div className="inspector-top">
        <span className="eyebrow">{t('FICHE MATÉRIEL')}</span>
        {onClose && (
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label={t('Fermer la fiche')}>
            <X />
          </Button>
        )}
      </div>
      {notice}
      <div className="inspector-hero">
        <AssetIcon category={asset.category} size={34} />
      </div>
      <p className="asset-tag">{asset.assetTag}</p>
      <h2>{asset.name}</h2>
      <div className="inspector-status">
        <AssetStatus asset={asset} />
      </div>
      <dl className="asset-specs">
        {asset.status === 'ASSIGNED' && (
          <div className="asset-assignee">
            <dt>
              <UserRound size={12} aria-hidden="true" /> {t('Affecté à')}
            </dt>
            <dd>
              {asset.assignee ? asset.assignee.name : t('Personne non renseignée')}
              {asset.assignee?.department && <small>{asset.assignee.department}</small>}
              {asset.assignee?.email && <small><a href={`mailto:${asset.assignee.email}`}>{asset.assignee.email}</a></small>}
            </dd>
          </div>
        )}
        <div>
          <dt>{t('Catégorie')}</dt>
          <dd>{t(categoryLabels[asset.category])}</dd>
        </div>
        <div>
          <dt>{t('Marque')}</dt>
          <dd>{asset.brand || t('Non renseignée')}</dd>
        </div>
        <div>
          <dt>{t('Modèle')}</dt>
          <dd>{asset.model || t('Non renseigné')}</dd>
        </div>
        <div>
          <dt>{t('Numéro de série')}</dt>
          <dd className="mono">{asset.serialNumber || t('Non renseigné')}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={12} aria-hidden="true" /> {t('Achat')}
          </dt>
          <dd>{civilDate(asset.purchaseDate)}</dd>
        </div>
      </dl>
      <Badge variant="outline" className="mt-6">
        {t('Données de l’inventaire')}
      </Badge>
      {children}
    </aside>
  )
}
