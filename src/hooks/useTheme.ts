import { useState, useEffect } from 'react';

// Function to check if the user prefers dark mode
const getSystemThemePreference = (): 'dark' | 'light' => {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return 'light' // Default to light if media queries not supported
}

// Function to update the document with the theme class
const updateThemeClass = (theme: 'dark' | 'light') => {
  if (theme === 'dark') {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

export const useTheme = () => {
  const [theme, setTheme] = useState<'dark' | 'light'>(getSystemThemePreference)
  
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    
    // Set initial theme
    updateThemeClass(getSystemThemePreference())
    
    // Add listener for changes
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light'
      setTheme(newTheme)
      updateThemeClass(newTheme)
    }
    
    // Modern browsers
    mediaQuery.addEventListener('change', handleChange)
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange)
    }
  }, [])
  
  return { theme, setTheme }
} 