import { assetCategorySchema, assetStatusSchema, categoryLabels, statusLabels } from './asset-schema'
import type { AssetFormField, AssetFormValues } from './asset-form-model'

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
    <label htmlFor={`${prefix}-name`}>Nom du matériel *<input {...props('name')} onChange={(event) => onChange('name', event.target.value)} required maxLength={150} autoComplete="off" placeholder="Ex. Ordinateur de l’accueil" />{error('name')}</label>
    <label htmlFor={`${prefix}-assetTag`}>Identifiant de parc *<input {...props('assetTag')} onChange={(event) => onChange('assetTag', event.target.value)} required maxLength={50} autoComplete="off" placeholder="Ex. IT-0042" />{error('assetTag')}<small>Une référence unique pour retrouver cet équipement.</small></label>
    <div className="asset-field-pair"><label htmlFor={`${prefix}-category`}>Catégorie *<select {...props('category')} onChange={(event) => onChange('category', event.target.value)} required>{assetCategorySchema.options.map((category) => <option key={category} value={category}>{categoryLabels[category]}</option>)}</select>{error('category')}</label>
      <label htmlFor={`${prefix}-status`}>État *<select {...props('status')} onChange={(event) => onChange('status', event.target.value)} required>{assetStatusSchema.options.map((status) => <option key={status} value={status} disabled={retirementBlocked && status === 'RETIRED'}>{statusLabels[status]}</option>)}</select>{error('status')}</label></div>
    {retirementBlocked && <p className="asset-status-help">Ce matériel est affecté. Pour le retirer du parc, choisissez d’abord un autre état et enregistrez la fiche.</p>}
    <div className="asset-form-divider" />
    <h3>Les détails utiles</h3>
    <label htmlFor={`${prefix}-serialNumber`}>Numéro de série<input {...props('serialNumber')} onChange={(event) => onChange('serialNumber', event.target.value)} maxLength={100} autoComplete="off" />{error('serialNumber')}</label>
    <div className="asset-field-pair"><label htmlFor={`${prefix}-brand`}>Marque<input {...props('brand')} onChange={(event) => onChange('brand', event.target.value)} maxLength={100} autoComplete="off" />{error('brand')}</label>
      <label htmlFor={`${prefix}-model`}>Modèle<input {...props('model')} onChange={(event) => onChange('model', event.target.value)} maxLength={100} autoComplete="off" />{error('model')}</label></div>
    <label htmlFor={`${prefix}-purchaseDate`}>Date d’achat<input {...props('purchaseDate')} onChange={(event) => onChange('purchaseDate', event.target.value)} type="date" />{error('purchaseDate')}<small>Laissez ce champ vide si la date est inconnue.</small></label>
  </fieldset>
}
