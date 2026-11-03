import { z } from 'zod'
import { apiClient } from '@/lib/api-client'
import { formatDateTime, msg, t } from '@/lib/i18n'
import { categoryLabels, statusLabels, type AssetCategory, type AssetStatus } from './asset-schema'

const assetChangeSchema = z.object({
  field: z.string(),
  from: z.string().nullable(),
  to: z.string().nullable(),
})

// Actions and fields stay open strings: a newer server may record kinds of change this interface does not know yet.
export const assetEventSchema = z.object({
  id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  occurredAt: z.iso.datetime({ offset: true }),
  action: z.string(),
  actor: z.object({ username: z.string(), displayName: z.string() }).nullable(),
  changes: z.array(assetChangeSchema),
})

export const assetHistorySchema = z.array(assetEventSchema)

export type AssetEvent = z.infer<typeof assetEventSchema>
export type AssetChange = z.infer<typeof assetChangeSchema>

/** The server keeps the full history but returns at most this many recent events. */
export const historyLimit = 200

export function getAssetHistory(id: number, signal: AbortSignal, fetcher?: typeof fetch): Promise<AssetEvent[]> {
  return apiClient.requestJson(`/api/assets/${id}/history`, (payload) => assetHistorySchema.parse(payload), {
    signal,
    ...(fetcher ? { fetcher } : {}),
  })
}

const fieldLabels: Record<string, string> = {
  assetTag: msg('Identifiant|matériel'),
  serialNumber: msg('Numéro de série'),
  name: msg('Nom'),
  brand: msg('Marque'),
  model: msg('Modèle'),
  category: msg('Catégorie'),
  status: msg('État'),
  purchaseDate: msg('Date d’achat'),
  assigneeName: msg('Personne équipée'),
  assigneeEmail: msg('E-mail de la personne'),
  assigneeDepartment: msg('Service de la personne'),
  location: msg('Poste'),
}

export function changeLabel(field: string): string {
  return Object.hasOwn(fieldLabels, field) ? t(fieldLabels[field]!) : field
}

export function changeValue(field: string, value: string | null): string {
  if (value === null) return field === 'location' ? t('Non localisé') : t('Non renseigné')
  if (field === 'category' && Object.hasOwn(categoryLabels, value)) return t(categoryLabels[value as AssetCategory])
  if (field === 'status' && Object.hasOwn(statusLabels, value)) return t(statusLabels[value as AssetStatus])
  if (field === 'purchaseDate' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/')
  return value
}

export function eventTitle(event: AssetEvent): string {
  switch (event.action) {
    case 'CREATED':
      return t('Fiche créée')
    case 'IMPORTED':
      return t('Importé depuis un fichier')
    case 'UPDATED':
      return t('Fiche modifiée')
    case 'RETIRED':
      return t('Retiré du parc')
    case 'LOCATED': {
      const move = event.changes.find((change) => change.field === 'location')
      if (move?.from === null) return t('Placé sur un poste')
      if (move?.to === null) return t('Retiré de son poste')
      return t('Changé de poste')
    }
    default:
      return t('Changement enregistré')
  }
}

export function eventAuthor(event: AssetEvent): string {
  return event.actor ? `${event.actor.displayName} (@${event.actor.username})` : t('Auteur non enregistré')
}

export function eventDate(event: AssetEvent): string {
  return formatDateTime(new Date(event.occurredAt))
}

/** A creation or an import lists the initial values only; other events show each value before and after. */
export function isCreation(event: AssetEvent): boolean {
  return event.action === 'CREATED' || event.action === 'IMPORTED'
}
