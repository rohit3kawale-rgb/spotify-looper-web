import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true
      },
      '/ws': {
        target: 'ws://127.0.0.1:8002',
        ws: true,
        changeOrigin: true
      }
    }
  },
  build: {
    outDir: '../backend/static',
    assetsDir: 'assets',
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-vendor': ['framer-motion', 'react-spinners', 'react-slider'],
          'utils': ['clsx', 'lodash']
        }
      }
    }
  },
  css: {
    postcss: './postcss.config.js',
    tailwindcss: {}
  }
})
