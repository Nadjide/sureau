import { useSyncExternalStore } from 'react'
import { english } from './i18n-en'

// French is the source language: the French text itself is the key of its translation, so the code stays
// readable and a missing translation falls back to French rather than to an identifier.

export type Language = 'fr' | 'en'

export const languages: readonly { code: Language; label: string }[] = [
  { code: 'fr', label: 'Français' },
  { code: 'en', label: 'English' },
]

const storageKey = 'sureau-language'
const listeners = new Set<() => void>()
// Read on first use rather than at import, so that importing a module never touches browser storage.
let current: Language | undefined

/** The saved choice, otherwise the browser's language; French outside a browser, as in tests. */
function initialLanguage(): Language {
  if (typeof window === 'undefined') return 'fr'
  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === 'fr' || saved === 'en') return saved
  } catch {
    // Without browser storage, the browser's language still applies.
  }
  return (window.navigator?.language ?? '').toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function currentLanguage(): Language {
  current ??= initialLanguage()
  return current
}

export function setLanguage(next: Language): void {
  if (next === currentLanguage()) return
  current = next
  try {
    window.localStorage.setItem(storageKey, next)
  } catch {
    // The choice then lasts until the page is closed.
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next
  for (const listener of listeners) listener()
}

/** Re-renders the calling component when the language changes. */
export function useLanguage(): Language {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    currentLanguage,
    currentLanguage,
  )
}

// A key may end with «|context» when the same French words need two translations, such as «Annuler|défaire»
// for an undo button; the context is never shown.
const withoutContext = (text: string) => text.replace(/\|[^|{}]+$/, '')

/** Marks a French text for translation where it is defined; `t` translates it where it is shown. */
export function msg(text: string): string {
  return text
}

/** The text in the current language; `{name}` placeholders take their value from `values`. */
export function t(text: string, values?: Readonly<Record<string, string | number>>): string {
  const template = currentLanguage() === 'en' ? (english[text] ?? withoutContext(text)) : withoutContext(text)
  return values
    ? template.replace(/\{(\w+)\}/g, (placeholder, name: string) => String(values[name] ?? placeholder))
    : template
}

/** Plural agreement on a count: the `one` text for 0 and 1 in French, for 1 only in English. */
export function plural(
  count: number,
  one: string,
  other: string,
  values?: Readonly<Record<string, string | number>>,
): string {
  const single = currentLanguage() === 'fr' ? count < 2 : count === 1
  return t(single ? one : other, { count, ...values })
}

/** The text in each language, for input such as an imported file accepted in either one. */
export function inEveryLanguage(text: string): string[] {
  const translation = english[text]
  return translation === undefined ? [withoutContext(text)] : [withoutContext(text), translation]
}

/** For dates and numbers. */
export function locale(): string {
  return currentLanguage() === 'fr' ? 'fr-FR' : 'en-GB'
}

const dateFormats = new Map<string, Intl.DateTimeFormat>()

/** A date and time written the way the current language does. */
export function formatDateTime(date: Date, dateStyle: 'medium' | 'long' = 'long'): string {
  const key = `${locale()}:${dateStyle}`
  let format = dateFormats.get(key)
  if (!format) dateFormats.set(key, (format = new Intl.DateTimeFormat(locale(), { dateStyle, timeStyle: 'short' })))
  return format.format(date)
}
