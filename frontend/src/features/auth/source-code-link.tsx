import { t } from '@/lib/i18n'

/** Sureau is AGPL-3.0: anyone using an instance can reach its source. A modified version must link to its own. */
const sourceCodeUrl = 'https://github.com/Nadjide/sureau'

export function SourceCodeLink() {
  return (
    <a className="source-code-link" href={sourceCodeUrl} target="_blank" rel="noreferrer">
      {t('Code source')}
      <span className="sr-only"> {t('(nouvel onglet)')}</span>
    </a>
  )
}
