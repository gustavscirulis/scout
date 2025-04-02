import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.ELECTRON=="true" ? './' : ".",
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        sourcemap: false
      }
    }
  }
})
