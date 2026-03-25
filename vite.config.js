import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Replace 'fhir-viewer' with your actual GitHub repo name
  base: '/fhir-viewer/',
})
