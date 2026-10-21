import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // relative asset paths: works on GitHub Pages (/watchlog/), Docker and Capacitor
  base: './',
  server: { host: true }
})
