import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const glpiUrl = (env.VITE_GLPI_URL || 'http://192.168.10.9/glpi').replace(/\/+$/, '')
  const proxyTarget = glpiUrl.replace(/\/glpi$/, '')
  const apiTarget = (env.VITE_API_URL || `http://localhost:${env.API_PORT || '4000'}`).replace(/\/+$/, '')

  return defineConfig({
    plugins: [
      react(),
      tailwindcss(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(process.cwd(), './src'),
      },
    },
    define: {
      'process.env': {}
    },
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/uploads': {
          target: apiTarget,
          changeOrigin: true,
        },
        '/glpi-proxy': {
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/glpi-proxy/, '/glpi'),
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
    },
  })
}

