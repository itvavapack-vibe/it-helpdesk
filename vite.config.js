import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    'process.env': {}
  },
  server: {
    proxy: {
      '/glpi-proxy': {
        target: 'http://192.168.10.9',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/glpi-proxy/, '/glpi'),
      }
    }
  }
})

