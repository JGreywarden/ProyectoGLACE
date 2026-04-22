import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],

  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },

  build: {
    target: 'es2022',
    // 'hidden' produces maps for Sentry/debug without linking them in the public bundle
    sourcemap: 'hidden',
    // split vendor chunks so game code doesn't invalidate react/router cache
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          state: ['zustand'],
        },
      },
    },
  },

  server: {
    port: 5173,
    open: true,
  },
})
