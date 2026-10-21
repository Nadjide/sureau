import { useCallback, useRef, useState } from 'react'
import {
  loadLocations,
  saveLocations,
  updateLocation,
  type LoadedLocations,
  type LocalLocations,
  type LocationStorage,
} from './local-locations'

interface LocationState extends LoadedLocations {
  storage: LocationStorage | null
}

export interface LocalLocationsResult {
  locations: LocalLocations
  warning: string | null
  persisted: boolean
  associate: (assetId: number, workstationId: string | null) => void
}

function initialLocations(): LocationState {
  let storage: LocationStorage | null = null

  try {
    if (typeof window !== 'undefined') storage = window.localStorage
  } catch {
    // Accessing the storage property itself can be refused by the browser.
  }

  return { ...loadLocations(storage), storage }
}

export function useLocalLocations(): LocalLocationsResult {
  const [state, setState] = useState<LocationState>(initialLocations)
  const current = useRef(state)

  const associate = useCallback((assetId: number, workstationId: string | null) => {
    const previous = current.current
    let locations: LocalLocations

    try {
      locations = updateLocation(previous.locations, assetId, workstationId)
    } catch {
      const next = { ...previous, warning: 'Cette localisation est invalide. Aucun changement n’a été appliqué.' }
      current.current = next
      setState(next)
      return
    }

    if (locations === previous.locations && previous.persisted && previous.warning === null) return

    const next: LocationState = previous.canPersist
      ? { ...previous, locations, ...saveLocations(previous.storage, locations) }
      : { ...previous, locations, persisted: false }

    current.current = next
    setState(next)
  }, [])

  return {
    locations: state.locations,
    warning: state.warning,
    persisted: state.persisted,
    associate,
  }
}
