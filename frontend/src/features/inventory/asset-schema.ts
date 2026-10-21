import { z } from 'zod'

export const assetCategorySchema = z.enum([
  'COMPUTER',
  'HEADSET',
  'MONITOR',
  'PHONE',
  'KEYBOARD',
  'MOUSE',
  'NETWORK_EQUIPMENT',
  'SERVER',
  'OTHER',
])

export const assetStatusSchema = z.enum([
  'AVAILABLE',
  'ASSIGNED',
  'MAINTENANCE',
  'RETIRED',
  'LOST',
])

export const assetSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  assetTag: z.string(),
  serialNumber: z.string().nullable(),
  name: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  category: assetCategorySchema,
  status: assetStatusSchema,
  purchaseDate: z.iso.date().nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
})

export const assetsSchema = z.array(assetSchema).superRefine((assets, context) => {
  const ids = new Set<number>()

  for (const [index, asset] of assets.entries()) {
    if (ids.has(asset.id)) {
      context.addIssue({
        code: 'custom',
        message: 'Chaque matériel doit avoir un identifiant unique.',
        path: [index, 'id'],
      })
    }

    ids.add(asset.id)
  }
})

export type Asset = z.infer<typeof assetSchema>
export type AssetCategory = z.infer<typeof assetCategorySchema>
export type AssetStatus = z.infer<typeof assetStatusSchema>

export const categoryLabels: Record<AssetCategory, string> = {
  COMPUTER: 'Ordinateur',
  HEADSET: 'Casque',
  MONITOR: 'Écran',
  PHONE: 'Téléphone',
  KEYBOARD: 'Clavier',
  MOUSE: 'Souris',
  NETWORK_EQUIPMENT: 'Équipement réseau',
  SERVER: 'Serveur',
  OTHER: 'Autre',
}

export const statusLabels: Record<AssetStatus, string> = {
  AVAILABLE: 'Disponible',
  ASSIGNED: 'Affecté',
  MAINTENANCE: 'En maintenance',
  RETIRED: 'Retiré du parc',
  LOST: 'Perdu',
}
