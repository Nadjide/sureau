import type { FurnitureItem, FurnitureKind } from './room-model'
import { clampFurniture } from './plan-geometry'

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

export const furnitureCatalog = [
  { kind: 'table', label: 'Table de réunion', description: 'Un point de rencontre pour échanger et travailler ensemble.', width: 2.4, depth: 1.2, height: 0.75, defaultColor: '#d4b38c' },
  { kind: 'cabinet', label: 'Rangement', description: 'Une armoire basse pour organiser les documents et le matériel.', width: 2.2, depth: 0.7, height: 1.05, defaultColor: '#c3ccd4' },
  { kind: 'plant', label: 'Plante', description: 'Une touche végétale pour délimiter ou habiller un espace.', width: 0.65, depth: 0.65, height: 1.45, defaultColor: '#688458' },
  { kind: 'partition', label: 'Cloison', description: 'Une séparation mobile pour composer des zones de travail.', width: 2, depth: 0.12, height: 1.8, defaultColor: '#7d8ca0' },
  { kind: 'sofa', label: 'Canapé', description: 'Une assise partagée pour un espace informel ou une zone d’accueil.', width: 2, depth: 0.85, height: 0.85, defaultColor: '#68809c' },
] as const satisfies readonly FurnitureCatalogEntry[]

export function createFurniture(kind: FurnitureKind, id: string): FurnitureItem {
  const entry = furnitureCatalog.find((item) => item.kind === kind)
  if (!entry || !/^furniture-[a-z0-9-]{2,80}$/.test(id)) {
    throw new RangeError('Le type ou l’identifiant du mobilier est invalide.')
  }
  return {
    id, kind, label: entry.label, position: [0, 0, 0], rotation: 0,
    width: entry.width, depth: entry.depth, height: entry.height, color: entry.defaultColor,
  }
}

export function initialFurniture(width: number, depth: number): FurnitureItem[] {
  const plant = createFurniture('plant', 'furniture-plant-01')
  const plants = [
    { id: 'furniture-plant-01', x: -5.72, z: -3.6, scale: 1 },
    { id: 'furniture-plant-02', x: 5.76, z: 3.55, scale: 0.88 },
    { id: 'furniture-plant-03', x: -5.7, z: 3.48, scale: 0.75 },
  ].map((item, index): FurnitureItem => ({
    ...plant, id: item.id, label: `Plante ${String(index + 1).padStart(2, '0')}`, position: [item.x * (width / 13), 0, item.z * (depth / 9)],
    width: plant.width * item.scale, depth: plant.depth * item.scale, height: plant.height * item.scale,
  }))
  const cabinet: FurnitureItem = {
    ...createFurniture('cabinet', 'furniture-cabinet-01'), label: 'Rangement 01',
    position: [3.85 * (width / 13), 0, -3.99 * (depth / 9)], width: 2.23, depth: 0.68, height: 1.03,
  }
  return [...plants, cabinet].map((item) => clampFurniture({ width, depth }, item))
}
