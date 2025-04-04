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
