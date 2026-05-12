import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  const glpiUrl = (env.VITE_GLPI_URL || 'http://192.168.10.9/glpi').replace(/\/+$/, '')
  const proxyTarget = glpiUrl.replace(/\/glpi$/, '')

  return defineConfig({
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
          target: proxyTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/glpi-proxy/, '/glpi'),
        }
      }
    }
  })
}

