import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // IMPORTANT: Replace 'fhir-viewer' with your actual GitHub repo name
  base: '/fhir-viewer/',
})
