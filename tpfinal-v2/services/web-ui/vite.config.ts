import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 8092,
    host: true,
    cors: true,
    proxy: {
      '/api/sessions': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      },
      '/api/detections': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false
      },
      '/storage': {
        target: 'http://localhost:8090',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/storage/, '')
      },
      '/enrich': {
        target: 'http://localhost:8091',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/enrich/, '/api')
      }
    }
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          charts: ['chart.js', 'vue-chartjs'],
          utils: ['axios', 'date-fns', '@vueuse/core']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['hls.js']
  }
})