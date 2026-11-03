import { z } from 'zod'
import { msg, t } from '@/lib/i18n'

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

export const assetStatusSchema = z.enum(['AVAILABLE', 'ASSIGNED', 'MAINTENANCE', 'RETIRED', 'LOST'])

export const assigneeSchema = z.object({
  name: z.string(),
  email: z.string().nullable(),
  department: z.string().nullable(),
})

export const assetSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  revision: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
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
  /** The person holding an assigned asset, when one is named. */
  assignee: assigneeSchema.nullable().optional(),
})

export const assetsSchema = z.array(assetSchema).superRefine((assets, context) => {
  const ids = new Set<number>()

  for (const [index, asset] of assets.entries()) {
    if (ids.has(asset.id)) {
      context.addIssue({
        code: 'custom',
        message: t('Chaque matériel doit avoir un identifiant unique.'),
        path: [index, 'id'],
      })
    }

    ids.add(asset.id)
  }
})

export type Asset = z.infer<typeof assetSchema>
export type AssetCategory = z.infer<typeof assetCategorySchema>
export type AssetStatus = z.infer<typeof assetStatusSchema>
export type Assignee = z.infer<typeof assigneeSchema>

// Labels are French keys: show them through t().
export const categoryLabels: Record<AssetCategory, string> = {
  COMPUTER: msg('Ordinateur'),
  HEADSET: msg('Casque'),
  MONITOR: msg('Écran'),
  PHONE: msg('Téléphone'),
  KEYBOARD: msg('Clavier'),
  MOUSE: msg('Souris'),
  NETWORK_EQUIPMENT: msg('Équipement réseau'),
  SERVER: msg('Serveur'),
  OTHER: msg('Autre'),
}

export const statusLabels: Record<AssetStatus, string> = {
  AVAILABLE: msg('Disponible'),
  ASSIGNED: msg('Affecté'),
  MAINTENANCE: msg('En maintenance'),
  RETIRED: msg('Retiré du parc'),
  LOST: msg('Perdu'),
}
