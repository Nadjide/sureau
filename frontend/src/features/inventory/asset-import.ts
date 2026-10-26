import { z } from 'zod'
import { ApiError, apiClient } from '@/lib/api-client'
import { parseCsv, toCsv } from '@/lib/csv'
import { emptyAssetForm, type AssetFormField, type AssetFormValues } from './asset-form-model'
import { formFieldName, parseAssetForm, type AssetInput } from './asset-input'
import {
  assetCategorySchema, assetsSchema, assetStatusSchema, categoryLabels, statusLabels,
  type Asset, type AssetCategory, type AssetStatus,
} from './asset-schema'

/** The server imports at most this many rows at once. */
export const importLimit = 1000

const normalize = (value: string) =>
  value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')

// Column names are matched without accents, case, spaces or punctuation, in French or English.
const columnAliases: Record<AssetFormField, readonly string[]> = {
  assetTag: ['identifiant', 'identifiantdeparc', 'assettag', 'tag', 'reference', 'ref'],
  name: ['nom', 'name', 'nomdumateriel', 'designation', 'libelle'],
  category: ['categorie', 'category', 'type'],
  status: ['etat', 'statut', 'status', 'state'],
  serialNumber: ['numerodeserie', 'numeroserie', 'serie', 'serial', 'serialnumber', 'sn'],
  brand: ['marque', 'brand', 'fabricant', 'constructeur'],
  model: ['modele', 'model'],
  purchaseDate: ['datedachat', 'dateachat', 'achat', 'purchasedate'],
  assigneeName: ['personne', 'personneequipee', 'affectea', 'assignee', 'assigneename', 'titulaire', 'utilisateur', 'detenteur'],
  assigneeEmail: ['email', 'mail', 'courriel', 'emaildelapersonne', 'assigneeemail'],
  assigneeDepartment: ['service', 'departement', 'department', 'assigneedepartment'],
}

export const importFieldLabels: Record<AssetFormField, string> = {
  assetTag: 'Identifiant', name: 'Nom', category: 'Catégorie', status: 'État', serialNumber: 'Numéro de série',
  brand: 'Marque', model: 'Modèle', purchaseDate: 'Date d’achat', assigneeName: 'Personne', assigneeEmail: 'E-mail',
  assigneeDepartment: 'Service',
}

export const importTemplate = toCsv([
  ['Identifiant', 'Nom', 'Catégorie', 'État', 'Numéro de série', 'Marque', 'Modèle', 'Date d’achat', 'Personne', 'E-mail', 'Service'],
  ['IT-0001', 'Portable de l’accueil', 'Ordinateur', 'Affecté', 'SN-12345', 'Lenovo', 'ThinkPad T14', '15/03/2025', 'Camille Bernard', 'camille.bernard@exemple.fr', 'Accueil'],
  ['IT-0002', 'Écran de la salle de réunion', 'Écran', 'Disponible', '', 'Dell', 'P2723D', '', '', '', ''],
])

function enumValue<T extends string>(raw: string, options: readonly T[], labels: Record<T, string>): T | null {
  const wanted = normalize(raw)
  return options.find((option) => normalize(option) === wanted || normalize(labels[option]) === wanted) ?? null
}

function civilDate(raw: string): string {
  const french = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(raw)
  return french ? `${french[3]}-${french[2]!.padStart(2, '0')}-${french[1]!.padStart(2, '0')}` : raw
}

export interface ImportRow {
  /** Line in the file, counting the header as line 1. */
  line: number
  values: AssetFormValues
  input: AssetInput | null
  errors: Partial<Record<AssetFormField, string>>
}

export interface ImportPlan {
  rows: ImportRow[]
  /** Problems with the file itself; when present, no row can be imported. */
  problems: string[]
  ignoredColumns: string[]
}

/** Reads and checks a file the way the server will, so that every problem shows before anything is sent. */
export function planImport(text: string): ImportPlan {
  const [header, ...records] = parseCsv(text)
  if (!header) return { rows: [], problems: ['Le fichier est vide.'], ignoredColumns: [] }
  const fields = header.map((name) => (Object.keys(columnAliases) as AssetFormField[])
    .find((field) => columnAliases[field].includes(normalize(name))) ?? null)
  const problems: string[] = []
  for (const required of ['assetTag', 'name'] as const) {
    if (!fields.includes(required)) problems.push(`Ajoutez une colonne « ${importFieldLabels[required]} » : elle est obligatoire.`)
  }
  const repeated = fields.filter((field, index) => field && fields.indexOf(field) !== index)
  for (const field of new Set(repeated)) problems.push(`La colonne « ${importFieldLabels[field!]} » apparaît plusieurs fois.`)
  if (records.length === 0) problems.push('Le fichier ne contient aucune ligne de matériel.')
  if (records.length > importLimit) problems.push(`Le fichier contient ${records.length} lignes : importez-en ${importLimit} au plus à la fois.`)

  const seen = new Map<string, number>()
  const rows = records.map((cells, index): ImportRow => {
    const line = index + 2
    const text = (wanted: AssetFormField) => {
      const column = fields.indexOf(wanted)
      return column < 0 ? '' : (cells[column] ?? '').trim()
    }
    const errors: Partial<Record<AssetFormField, string>> = {}
    const category: AssetCategory | null = text('category')
      ? enumValue(text('category'), assetCategorySchema.options, categoryLabels) : 'OTHER'
    if (!category) errors.category = `Catégorie inconnue : « ${text('category')} ».`
    const status: AssetStatus | null = text('status')
      ? enumValue(text('status'), assetStatusSchema.options, statusLabels) : text('assigneeName') ? 'ASSIGNED' : 'AVAILABLE'
    if (!status) errors.status = `État inconnu : « ${text('status')} ».`
    else if (status !== 'ASSIGNED' && text('assigneeName')) {
      errors.assigneeName = 'Seul un matériel affecté peut nommer une personne : choisissez l’état « Affecté ».'
    }
    const values: AssetFormValues = {
      ...emptyAssetForm, assetTag: text('assetTag'), name: text('name'), serialNumber: text('serialNumber'),
      brand: text('brand'), model: text('model'), category: category ?? 'OTHER', status: status ?? 'AVAILABLE',
      purchaseDate: civilDate(text('purchaseDate')), assigneeName: text('assigneeName'),
      assigneeEmail: text('assigneeEmail'), assigneeDepartment: text('assigneeDepartment'),
    }

    const parsed = parseAssetForm(values)
    if (!parsed.success) for (const [field, message] of Object.entries(parsed.errors)) errors[field as AssetFormField] ??= message
    const tag = values.assetTag.trim()
    if (tag && seen.has(tag)) errors.assetTag ??= `Identifiant déjà présent ligne ${seen.get(tag)}.`
    else if (tag) seen.set(tag, line)
    const valid = parsed.success && Object.keys(errors).length === 0
    return { line, values, input: valid ? parsed.data : null, errors }
  })
  const ignoredColumns = header.filter((name, index) => !fields[index] && name.trim())
  return { rows, problems, ignoredColumns }
}

/** Server errors are named `assets[index].field`; they are attached to the matching line of the file. */
export function attachServerErrors(rows: readonly ImportRow[], fieldErrors: Readonly<Record<string, string>>): ImportRow[] {
  const next = rows.map((row) => ({ ...row, errors: { ...row.errors } }))
  for (const [path, message] of Object.entries(fieldErrors)) {
    const match = /^assets\[(\d+)\]\.(.+)$/.exec(path)
    const row = match ? next[Number(match[1])] : undefined
    if (!row || !match) continue
    const field = formFieldName(match[2]!)
    const key = (field === 'assignee' ? 'assigneeName' : field) as AssetFormField
    row.errors[key] ??= message
  }
  return next
}

const importResponseSchema = z.object({ created: z.number().int().min(0), assets: assetsSchema })

export async function importAssets(inputs: readonly AssetInput[], signal?: AbortSignal): Promise<Asset[]> {
  try {
    const response = await apiClient.requestJson('/api/assets/import', (payload) => importResponseSchema.parse(payload), {
      method: 'POST', json: { assets: inputs }, ...(signal ? { signal } : {}),
    })
    return response.assets
  } catch (error) {
    signal?.throwIfAborted()
    if (error instanceof ApiError && (error.kind !== 'http' || (error.status !== null && error.status >= 500))) {
      throw new ApiError(error.kind, 'L’import n’a pas pu être confirmé. Actualisez l’inventaire pour vérifier si les matériels ont été créés avant de réessayer.', error.status, error.code, error.fieldErrors)
    }
    throw error
  }
}
