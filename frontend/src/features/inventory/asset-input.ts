import { z } from 'zod'
import type { AssetFormValues } from './asset-form-model'
import { assetCategorySchema, assetStatusSchema } from './asset-schema'

const optionalText = z.preprocess(
  (value) => typeof value === 'string' ? value.trim() || null : value,
  z.string().max(100, 'Utilisez au maximum 100 caractères.').nullable(),
)

const assigneeInputSchema = z.object({
  name: z.string().trim().min(1, 'Nommez la personne à qui ce matériel est affecté.').max(150, 'Utilisez au maximum 150 caractères.'),
  email: z.preprocess((value) => typeof value === 'string' ? value.trim() || null : value,
    z.email({ error: 'Renseignez une adresse e-mail valide.' }).max(254, 'Utilisez au maximum 254 caractères.').nullable()),
  department: optionalText,
}).strict()

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
  assignee: assigneeInputSchema.nullable().default(null),
}).strict().superRefine((asset, context) => {
  if (asset.assignee && asset.status !== 'ASSIGNED') {
    context.addIssue({ code: 'custom', path: ['assignee', 'name'], message: 'Seul un matériel affecté peut nommer une personne.' })
  }
})

export type AssetInput = z.output<typeof assetInputSchema>

/** The form edits the holder in flat fields; the API nests them, and reports their errors as `assignee.name`. */
export function formFieldName(path: string): string {
  const [first, second] = path.split('.')
  return first === 'assignee' && second ? `assignee${second[0]!.toUpperCase()}${second.slice(1)}` : first ?? path
}

export function formFieldErrors(errors: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [formFieldName(field), message]))
}

/** An assigned asset always names its holder in the form; any other status drops the holder fields. */
export function parseAssetForm(values: AssetFormValues):
  { success: true; data: AssetInput } | { success: false; errors: Record<string, string> } {
  const { assigneeName, assigneeEmail, assigneeDepartment, ...asset } = values
  const parsed = assetInputSchema.safeParse({
    ...asset,
    assignee: values.status === 'ASSIGNED' ? { name: assigneeName, email: assigneeEmail, department: assigneeDepartment } : null,
  })
  if (parsed.success) return { success: true, data: parsed.data }
  const errors: Record<string, string> = {}
  for (const issue of parsed.error.issues) {
    const field = formFieldName(issue.path.map(String).join('.'))
    errors[field] ??= issue.message
  }
  return { success: false, errors }
}
