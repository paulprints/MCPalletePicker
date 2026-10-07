/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Minecraft's block texture atlas is never bundled with the app. The browser
// loads it at runtime from misode/mcmeta. Under `vite dev`, `vite preview` and
// on Vercel (see vercel.json) it is proxied through the same origin at
// /mc-assets so it is cached at the edge and immune to third-party CORS hiccups.
const mcAssetsProxy = {
  '/mc-assets': {
    target: 'https://raw.githubusercontent.com',
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/mc-assets/, '/misode/mcmeta'),
  },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: mcAssetsProxy },
  preview: { proxy: mcAssetsProxy },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
