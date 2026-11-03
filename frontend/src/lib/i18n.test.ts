import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { english } from './i18n-en'
import { currentLanguage, locale, plural, setLanguage, t } from './i18n'

const source = fileURLToPath(new URL('..', import.meta.url))

function files(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name)
    if (statSync(path).isDirectory()) return files(path)
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
  })
}

const literal = String.raw`'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|` + '`((?:\\\\.|[^`\\\\])*)`'
const unescape = (text: string) =>
  text.replace(/\\(.)/g, (_, character: string) => (character === 'n' ? '\n' : character))

/** Every literal given to t(), msg() and plural() in the application code. */
function markedTexts(): { text: string; file: string }[] {
  const found: { text: string; file: string }[] = []
  const call = new RegExp(String.raw`\b(?:t|msg)\(\s*(?:${literal})`, 'g')
  const plurals = new RegExp(String.raw`\bplural\([^,()]+(?:\([^)]*\))?,\s*(?:${literal}),\s*(?:${literal})`, 'g')
  for (const file of files(source)) {
    const code = readFileSync(file, 'utf8')
    for (const match of code.matchAll(call))
      found.push({ text: unescape(match[1] ?? match[2] ?? match[3] ?? ''), file })
    for (const match of code.matchAll(plurals)) {
      found.push({ text: unescape(match[1] ?? match[2] ?? match[3] ?? ''), file })
      found.push({ text: unescape(match[4] ?? match[5] ?? match[6] ?? ''), file })
    }
  }
  return found
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort()

describe('traduction anglaise', () => {
  const marked = markedTexts()

  it('trouve les textes marqués dans le code', () => {
    expect(marked.length).toBeGreaterThan(500)
  })

  it('traduit chaque texte marqué, avec les mêmes valeurs à insérer', () => {
    const missing = [
      ...new Set(
        marked
          .filter(({ text }) => !Object.hasOwn(english, text))
          .map(({ text, file }) => `${file.slice(source.length)} : ${text}`),
      ),
    ]
    expect(missing).toEqual([])
    const mismatched = Object.entries(english).filter(
      ([french, translation]) => JSON.stringify(placeholders(french)) !== JSON.stringify(placeholders(translation)),
    )
    expect(mismatched).toEqual([])
  })

  it('ne garde aucune traduction inutilisée', () => {
    const used = new Set(marked.map(({ text }) => text))
    expect(Object.keys(english).filter((french) => !used.has(french))).toEqual([])
  })

  it('n’interpole jamais une valeur dans la clé elle-même', () => {
    expect(marked.filter(({ text }) => text.includes('${')).map(({ file }) => file)).toEqual([])
  })

  it('garde le français hors d’un navigateur et insère les valeurs', () => {
    expect(currentLanguage()).toBe('fr')
    expect(t('Compte de {name}', { name: 'Camille' })).toBe('Compte de Camille')
    expect(plural(1, '{count} matériel', '{count} matériels')).toBe('1 matériel')
    expect(plural(0, '{count} matériel', '{count} matériels')).toBe('0 matériel')
    expect(plural(3, '{count} matériel', '{count} matériels')).toBe('3 matériels')
  })

  it('passe à l’anglais et distingue deux usages des mêmes mots français', () => {
    setLanguage('en')
    try {
      expect(t('Annuler')).toBe('Cancel')
      expect(t('Annuler|défaire')).toBe('Undo')
      expect(plural(0, '{count} salle', '{count} salles')).toBe('0 rooms')
      expect(plural(1, '{count} salle', '{count} salles')).toBe('1 room')
      expect(t('Compte de {name}', { name: 'Camille' })).toBe('Camille’s account')
      expect(locale()).toBe('en-GB')
    } finally {
      setLanguage('fr')
    }
    expect(t('Annuler|défaire')).toBe('Annuler')
  })
})
