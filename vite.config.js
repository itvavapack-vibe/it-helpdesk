import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const webPort = Number(env.VITE_WEB_PORT || '5173')
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
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined

            if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
              return 'vendor-react'
            }
            if (/[\\/]node_modules[\\/](@radix-ui|cmdk)[\\/]/.test(id)) {
              return 'vendor-ui'
            }
            if (/[\\/]node_modules[\\/](jspdf|jspdf-autotable)[\\/]/.test(id)) {
              return 'vendor-jspdf'
            }
            if (/[\\/]node_modules[\\/](html2canvas|html2canvas-pro|dompurify)[\\/]/.test(id)) {
              return 'vendor-html-render'
            }
            if (/[\\/]node_modules[\\/](xlsx|cfb|ssf|codepage)[\\/]/.test(id)) {
              return 'vendor-xlsx'
            }
            if (/[\\/]node_modules[\\/](recharts|d3-|victory-vendor)[\\/]/.test(id)) {
              return 'vendor-charts'
            }
            if (/[\\/]node_modules[\\/](lucide-react|react-draggable|react-signature-canvas|qrcode.react)[\\/]/.test(id)) {
              return 'vendor-widgets'
            }
            if (/[\\/]node_modules[\\/](mysql2|express|multer|cors|dotenv|concurrently)[\\/]/.test(id)) {
              return 'vendor-server'
            }
            if (/[\\/]node_modules[\\/](tailwind-merge|clsx|react-is)[\\/]/.test(id)) {
              return 'vendor-utils'
            }

            return 'vendor'
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: webPort,
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
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: '0.0.0.0',
      port: webPort,
      strictPort: true,
    },
  })
}
