import type { Asset, AssetCategory, AssetStatus } from './asset-schema'

export const emptyAssetForm = {
  assetTag: '',
  serialNumber: '',
  name: '',
  brand: '',
  model: '',
  category: 'COMPUTER' as AssetCategory,
  status: 'AVAILABLE' as AssetStatus,
  purchaseDate: '',
  assigneeName: '',
  assigneeEmail: '',
  assigneeDepartment: '',
}
export type AssetFormValues = typeof emptyAssetForm
export type AssetFormField = keyof AssetFormValues

export function assetToFormValues(asset: Asset): AssetFormValues {
  return {
    assetTag: asset.assetTag,
    serialNumber: asset.serialNumber || '',
    name: asset.name,
    brand: asset.brand || '',
    model: asset.model || '',
    category: asset.category,
    status: asset.status,
    purchaseDate: asset.purchaseDate || '',
    assigneeName: asset.assignee?.name || '',
    assigneeEmail: asset.assignee?.email || '',
    assigneeDepartment: asset.assignee?.department || '',
  }
}
