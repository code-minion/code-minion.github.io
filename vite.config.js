import { resolve } from 'path'
import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      'three': resolve(__dirname, 'node_modules/three'),
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        cv: resolve(__dirname, 'cv.html'),
        project: resolve(__dirname, 'project.html'),
        plain: resolve(__dirname, 'plain.html'),
        plainSig: resolve(__dirname, 'plain-sig.html'),
      },
    },
  },
})
