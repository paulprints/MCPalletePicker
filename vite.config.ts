/// <reference types="vitest/config" />
import { defineConfig, type Connect, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { handleImageProxy } from './api/image.ts'

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

/**
 * Serves the image proxy (api/image.ts, a Vercel Function in production) under
 * `vite dev` and `vite preview` too, so opening images by link works locally.
 * IMAGE_PROXY_ALLOW_PRIVATE=1 lets it reach localhost (used by the e2e tests).
 */
function imageProxy(): Plugin {
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api/image')) return next()
    const allowPrivate = process.env.IMAGE_PROXY_ALLOW_PRIVATE === '1'
    handleImageProxy(new URL(req.url, 'http://localhost'), { allowPrivate })
      .then(async (response) => {
        res.statusCode = response.status
        response.headers.forEach((value, key) => res.setHeader(key, value))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
      .catch(next)
  }
  return {
    name: 'image-proxy',
    configureServer: (server) => void server.middlewares.use(middleware),
    configurePreviewServer: (server) => void server.middlewares.use(middleware),
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), imageProxy()],
  server: { proxy: mcAssetsProxy },
  preview: { proxy: mcAssetsProxy },
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30000,
  },
})
