import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function validateApiKey(apiKey: string): { isValid: boolean; message?: string } {
  // Empty API key is valid (allows removing the key)
  if (!apiKey) {
    return { isValid: true }
  }
  
  if (!apiKey.startsWith('sk-')) {
    return { isValid: false, message: 'API key must start with "sk-"' }
  }
  
  if (apiKey.length < 30) {
    return { isValid: false, message: 'API key is too short' }
  }
  
  return { isValid: true }
}

export function validateUrl(url: string): { isValid: boolean; message?: string } {
  if (!url) {
    return { isValid: false }
  }

  // Basic format check - must contain at least one dot and no spaces
  if (!url.includes('.') || url.includes(' ')) {
    return { isValid: false, message: 'Invalid URL format' }
  }

  // If URL doesn't start with http:// or https://, add https:// prefix
  let normalizedUrl = url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    normalizedUrl = `https://${url}`;
  }

  try {
    const urlObj = new URL(normalizedUrl)
    // Check for http or https protocol
    if (urlObj.protocol !== 'http:' && urlObj.protocol !== 'https:') {
      return { isValid: false, message: 'URL must use http or https protocol' }
    }
    // Check that we have a valid hostname
    if (!urlObj.hostname || urlObj.hostname.length < 3) {
      return { isValid: false, message: 'Invalid hostname in URL' }
    }
    // Check for valid TLD (top-level domain)
    if (!urlObj.hostname.includes('.')) {
      return { isValid: false, message: 'URL must contain a valid domain' }
    }
    return { isValid: true }
  } catch (error) {
    return { isValid: false, message: 'Invalid URL format' }
  }
}
