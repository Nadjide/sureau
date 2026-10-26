import { assetCategorySchema, assetStatusSchema, categoryLabels, statusLabels } from './asset-schema'
import type { AssetFormField, AssetFormValues } from './asset-form-model'
import { t } from '@/lib/i18n'

interface Props {
  prefix: string
  values: AssetFormValues
  fields: Readonly<Record<string, string>>
  disabled: boolean
  onChange: (field: AssetFormField, value: string) => void
  retirementBlocked?: boolean
}

export function AssetFormFields({ prefix, values, fields, disabled, onChange, retirementBlocked = false }: Props) {
  function props(field: AssetFormField) {
    return { id: `${prefix}-${field}`, name: field, value: values[field], 'aria-invalid': Boolean(fields[field]),
      'aria-describedby': fields[field] ? `${prefix}-${field}-error` : undefined }
  }
  function error(field: AssetFormField) {
    return fields[field] && <small className="asset-field-error" id={`${prefix}-${field}-error`}>{fields[field]}</small>
  }
  return <fieldset disabled={disabled}>
    <label htmlFor={`${prefix}-name`}>{t('Nom du matériel *')}<input {...props('name')} onChange={(event) => onChange('name', event.target.value)} required maxLength={150} autoComplete="off" placeholder={t('Ex. Ordinateur de l’accueil')} />{error('name')}</label>
    <label htmlFor={`${prefix}-assetTag`}>{t('Identifiant de parc *')}<input {...props('assetTag')} onChange={(event) => onChange('assetTag', event.target.value)} required maxLength={50} autoComplete="off" placeholder={t('Ex. IT-0042')} />{error('assetTag')}<small>{t('Une référence unique pour retrouver cet équipement.')}</small></label>
    <div className="asset-field-pair"><label htmlFor={`${prefix}-category`}>{t('Catégorie *')}<select {...props('category')} onChange={(event) => onChange('category', event.target.value)} required>{assetCategorySchema.options.map((category) => <option key={category} value={category}>{t(categoryLabels[category])}</option>)}</select>{error('category')}</label>
      <label htmlFor={`${prefix}-status`}>{t('État *')}<select {...props('status')} onChange={(event) => onChange('status', event.target.value)} required>{assetStatusSchema.options.map((status) => <option key={status} value={status} disabled={retirementBlocked && status === 'RETIRED'}>{t(statusLabels[status])}</option>)}</select>{error('status')}</label></div>
    {retirementBlocked && <p className="asset-status-help">{t('Ce matériel est affecté. Pour le retirer du parc, choisissez d’abord un autre état et enregistrez la fiche.')}</p>}
    {values.status === 'ASSIGNED' && <div className="asset-assignee-fields" role="group" aria-labelledby={`${prefix}-assignee-title`}>
      <h3 id={`${prefix}-assignee-title`}>{t('La personne équipée')}</h3>
      <p className="asset-status-help">{t('Elle n’a pas besoin d’un compte Sureau. Pour rendre le matériel, choisissez un autre état.')}</p>
      <label htmlFor={`${prefix}-assigneeName`}>{t('Nom et prénom *')}<input {...props('assigneeName')} onChange={(event) => onChange('assigneeName', event.target.value)} required maxLength={150} autoComplete="off" placeholder={t('Ex. Camille Bernard')} />{error('assigneeName')}</label>
      <div className="asset-field-pair"><label htmlFor={`${prefix}-assigneeEmail`}>{t('E-mail')}<input {...props('assigneeEmail')} onChange={(event) => onChange('assigneeEmail', event.target.value)} type="email" maxLength={254} autoComplete="off" />{error('assigneeEmail')}</label>
        <label htmlFor={`${prefix}-assigneeDepartment`}>{t('Service')}<input {...props('assigneeDepartment')} onChange={(event) => onChange('assigneeDepartment', event.target.value)} maxLength={100} autoComplete="off" placeholder={t('Ex. Comptabilité')} />{error('assigneeDepartment')}</label></div>
    </div>}
    <div className="asset-form-divider" />
    <h3>{t('Les détails utiles')}</h3>
    <label htmlFor={`${prefix}-serialNumber`}>{t('Numéro de série')}<input {...props('serialNumber')} onChange={(event) => onChange('serialNumber', event.target.value)} maxLength={100} autoComplete="off" />{error('serialNumber')}</label>
    <div className="asset-field-pair"><label htmlFor={`${prefix}-brand`}>{t('Marque')}<input {...props('brand')} onChange={(event) => onChange('brand', event.target.value)} maxLength={100} autoComplete="off" />{error('brand')}</label>
      <label htmlFor={`${prefix}-model`}>{t('Modèle')}<input {...props('model')} onChange={(event) => onChange('model', event.target.value)} maxLength={100} autoComplete="off" />{error('model')}</label></div>
    <label htmlFor={`${prefix}-purchaseDate`}>{t('Date d’achat')}<input {...props('purchaseDate')} onChange={(event) => onChange('purchaseDate', event.target.value)} type="date" />{error('purchaseDate')}<small>{t('Laissez ce champ vide si la date est inconnue.')}</small></label>
  </fieldset>
}
