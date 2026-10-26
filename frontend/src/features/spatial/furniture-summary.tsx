import { Armchair, Columns3, Flower2, LibraryBig, Table2 } from 'lucide-react'
import { furnitureCatalog } from './furniture-catalog'
import type { FurnitureItem, FurnitureKind } from './room-model'
import { t } from '@/lib/i18n'

const icons = { table: Table2, cabinet: LibraryBig, plant: Flower2, partition: Columns3, sofa: Armchair }

export function FurnitureIcon({ kind, size = 24 }: { kind: FurnitureKind; size?: number }) {
  const Icon = icons[kind]
  return <Icon size={size} strokeWidth={1.3} aria-hidden="true" />
}

export function FurnitureSummary({ item }: { item: FurnitureItem }) {
  const entry = furnitureCatalog.find((candidate) => candidate.kind === item.kind)!
  return <>
    <div className="inspector-hero"><FurnitureIcon kind={item.kind} size={34} /></div>
    <p className="eyebrow">{t('MOBILIER DU PLAN')}</p>
    <h2>{item.label}</h2>
    <p className="location-help">{t(entry.label)} · {t(entry.description)}</p>
    <dl className="asset-specs">
      <div><dt>{t('Dimensions')}</dt><dd>{Math.round(item.width * 100)} × {Math.round(item.depth * 100)} cm</dd></div>
      <div><dt>{t('Hauteur')}</dt><dd>{Math.round(item.height * 100)} cm</dd></div>
      <div><dt>{t('Orientation')}</dt><dd>{Math.round(item.rotation * 180 / Math.PI)}°</dd></div>
      <div><dt>{t('Couleur')}</dt><dd><span className="furniture-color-sample" style={{ background: item.color }} />{item.color}</dd></div>
    </dl>
  </>
}
