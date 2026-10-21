import { useEffect, useState } from 'react'

type Theme = 'light' | 'dark'

const storageKey = 'sentinel-theme'

function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'

  try {
    const saved = window.localStorage.getItem(storageKey)
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // The browser can deny preference storage in private or restricted contexts.
  }

  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    document.documentElement.style.colorScheme = theme

    try {
      window.localStorage.setItem(storageKey, theme)
    } catch {
      // Theme switching remains available even when persistence is unavailable.
    }
  }, [theme])

  function toggleTheme() {
    setTheme((current) => (current === 'light' ? 'dark' : 'light'))
  }

  return { theme, toggleTheme }
}
