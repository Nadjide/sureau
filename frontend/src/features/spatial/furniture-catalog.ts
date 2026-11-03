import type { FurnitureItem, FurnitureKind } from './room-model'
import { clampFurniture } from './plan-geometry'
import { msg, t } from '@/lib/i18n'

export { findFreeFurniturePlacement } from './plan-geometry'

export interface FurnitureCatalogEntry {
  kind: FurnitureKind
  label: string
  description: string
  width: number
  depth: number
  height: number
  defaultColor: string
}

// Labels and descriptions are French keys: show them through t().
export const furnitureCatalog = [
  {
    kind: 'table',
    label: msg('Table de réunion'),
    description: msg('Un point de rencontre pour échanger et travailler ensemble.'),
    width: 2.4,
    depth: 1.2,
    height: 0.75,
    defaultColor: '#d4b38c',
  },
  {
    kind: 'cabinet',
    label: msg('Rangement'),
    description: msg('Une armoire basse pour organiser les documents et le matériel.'),
    width: 2.2,
    depth: 0.7,
    height: 1.05,
    defaultColor: '#c3ccd4',
  },
  {
    kind: 'plant',
    label: msg('Plante'),
    description: msg('Une touche végétale pour délimiter ou habiller un espace.'),
    width: 0.65,
    depth: 0.65,
    height: 1.45,
    defaultColor: '#688458',
  },
  {
    kind: 'partition',
    label: msg('Cloison'),
    description: msg('Une séparation mobile pour composer des zones de travail.'),
    width: 2,
    depth: 0.12,
    height: 1.8,
    defaultColor: '#7d8ca0',
  },
  {
    kind: 'sofa',
    label: msg('Canapé'),
    description: msg('Une assise partagée pour un espace informel ou une zone d’accueil.'),
    width: 2,
    depth: 0.85,
    height: 0.85,
    defaultColor: '#68809c',
  },
] as const satisfies readonly FurnitureCatalogEntry[]

const twoDigits = (number: number) => String(number).padStart(2, '0')

/** A piece named after its kind in French; the catalogue panel renames it in the current language. */
export function createFurniture(kind: FurnitureKind, id: string): FurnitureItem {
  const entry = furnitureCatalog.find((item) => item.kind === kind)
  if (!entry || !/^furniture-[a-z0-9-]{2,80}$/.test(id)) {
    throw new RangeError(t('Le type ou l’identifiant du mobilier est invalide.'))
  }
  return {
    id,
    kind,
    label: entry.label,
    position: [0, 0, 0],
    rotation: 0,
    width: entry.width,
    depth: entry.depth,
    height: entry.height,
    color: entry.defaultColor,
  }
}

/** «Plante 01»: the name of the kind in the current language, then a two-digit number. */
export function numberedFurnitureLabel(kind: FurnitureKind, number: number): string {
  const entry = furnitureCatalog.find((item) => item.kind === kind)!
  return `${t(entry.label)} ${twoDigits(number)}`
}

// The default plan is built when its module loads, before any language is read: its names stay French
// until createExamplePlan writes them in the chosen language.
export function initialFurniture(width: number, depth: number): FurnitureItem[] {
  const plant = createFurniture('plant', 'furniture-plant-01')
  const plants = [
    { id: 'furniture-plant-01', x: -5.72, z: -3.6, scale: 1 },
    { id: 'furniture-plant-02', x: 5.76, z: 3.55, scale: 0.88 },
    { id: 'furniture-plant-03', x: -5.7, z: 3.48, scale: 0.75 },
  ].map((item, index): FurnitureItem => ({
    ...plant,
    id: item.id,
    label: `${plant.label} ${twoDigits(index + 1)}`,
    position: [item.x * (width / 13), 0, item.z * (depth / 9)],
    width: plant.width * item.scale,
    depth: plant.depth * item.scale,
    height: plant.height * item.scale,
  }))
  const storage = createFurniture('cabinet', 'furniture-cabinet-01')
  const cabinet: FurnitureItem = {
    ...storage,
    label: `${storage.label} 01`,
    position: [3.85 * (width / 13), 0, -3.99 * (depth / 9)],
    width: 2.23,
    depth: 0.68,
    height: 1.03,
  }
  return [...plants, cabinet].map((item) => clampFurniture({ width, depth }, item))
}
