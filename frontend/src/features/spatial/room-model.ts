import { msg } from '@/lib/i18n'
export interface Workstation {
  id: string
  label: string
  position: [number, number, number]
  rotation: number
  width: number
  depth: number
  color: string | null
}

export type FurnitureKind = 'table' | 'cabinet' | 'plant' | 'partition' | 'sofa'

export interface FurnitureItem {
  id: string
  kind: FurnitureKind
  label: string
  position: [number, number, number]
  rotation: number
  width: number
  depth: number
  height: number
  color: string
}

export interface SpatialPlan {
  version: 1
  id: string
  name: string
  width: number
  depth: number
  colors: {
    floor: string
    wall: string
    desk: string
    accent: string
  }
  display: {
    walls: boolean
    decor: boolean
  }
  workstations: Workstation[]
  furniture: FurnitureItem[]
}

export type SpatialView = '3d' | '2d'

// The example's names are French keys; createExamplePlan writes them in the current language.
export const room = { id: 'plateau-a', name: msg('Plateau A'), width: 13, depth: 9 } as const

export const workstations: readonly Workstation[] = Array.from({ length: 8 }, (_, index) => ({
  id: `desk-${String(index + 1).padStart(2, '0')}`,
  label: `Poste ${String(index + 1).padStart(2, '0')}`,
  position: [-4.2 + (index % 4) * 2.8, 0, index < 4 ? -1.65 : 1.65],
  rotation: index < 4 ? 0 : Math.PI,
  width: 2,
  depth: 1,
  color: null,
}))

export function findWorkstation(id: string | null, stations: readonly Workstation[] = workstations) {
  return stations.find((workstation) => workstation.id === id)
}
