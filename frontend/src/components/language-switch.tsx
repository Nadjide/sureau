import { Languages } from 'lucide-react'
import { languages, setLanguage, t, useLanguage, type Language } from '@/lib/i18n'
import './language-switch.css'

/** The interface language; the choice stays in this browser and changes the page at once. */
export function LanguageSwitch({ className, showLabel = false }: { className?: string; showLabel?: boolean }) {
  const current = useLanguage()
  return (
    <label className={`language-switch${className ? ` ${className}` : ''}`}>
      <Languages size={15} aria-hidden="true" />
      <span className={showLabel ? 'language-switch-label' : 'sr-only'}>{t('Langue de l’interface')}</span>
      <select value={current} onChange={(event) => setLanguage(event.target.value as Language)}>
        {languages.map((language) => (
          <option key={language.code} value={language.code} lang={language.code}>
            {language.label}
          </option>
        ))}
      </select>
    </label>
  )
}
