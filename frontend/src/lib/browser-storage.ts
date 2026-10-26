export const storageKeys = {
  theme: 'sureau-theme',
  locations: 'sureau-locations-v1',
  plan: 'sureau-plan-v1',
  workspace: 'sureau-workspace-v1',
  guide: 'sureau-guide-v1',
} as const

// Historical keys remain readable so the product rename preserves local user data.
export const legacyStorageKeys = {
  theme: 'sentinel-theme',
  locations: 'sentinel-locations-v1',
  plan: 'sentinel-plan-v1',
  workspace: 'sentinel-workspace-v1',
} as const

interface ReadableStorage {
  getItem: (key: string) => string | null
}

export function readStoredValue(storage: ReadableStorage, key: keyof typeof legacyStorageKeys): string | null {
  return storage.getItem(storageKeys[key]) ?? storage.getItem(legacyStorageKeys[key])
}
