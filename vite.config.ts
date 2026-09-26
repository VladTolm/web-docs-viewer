import { defineConfig } from 'vite'
import { fileViewerRenderers } from '@file-viewer/vite-plugin'

// BASE_PATH is set in CI when the site is served from a sub-path (GitHub Pages).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [
    fileViewerRenderers({
      copyAssets: true,
      chunkStrategy: 'renderer'
    })
  ],
  build: {
    chunkSizeWarningLimit: 5000
  }
})
