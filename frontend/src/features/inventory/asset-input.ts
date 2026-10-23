import { z } from 'zod'
import { assetCategorySchema, assetStatusSchema } from './asset-schema'

const optionalText = z.preprocess(
  (value) => typeof value === 'string' ? value.trim() || null : value,
  z.string().max(100, 'Utilisez au maximum 100 caractères.').nullable(),
)

/** The write contract is separate from server-owned identifiers and timestamps. */
export const assetInputSchema = z.object({
  assetTag: z.string().trim().min(1, 'L’identifiant est obligatoire.').max(50, 'Utilisez au maximum 50 caractères.'),
  serialNumber: optionalText,
  name: z.string().trim().min(1, 'Le nom du matériel est obligatoire.').max(150, 'Utilisez au maximum 150 caractères.'),
  brand: optionalText,
  model: optionalText,
  category: z.enum(assetCategorySchema.options, { error: 'Choisissez une catégorie de matériel.' }),
  status: z.enum(assetStatusSchema.options, { error: 'Choisissez un état du matériel.' }),
  purchaseDate: z.preprocess((value) => value === '' ? null : value,
    z.iso.date({ error: 'Renseignez une date d’achat valide.' }).nullable()),
}).strict()

export type AssetInput = z.output<typeof assetInputSchema>
