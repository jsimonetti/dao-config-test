import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Proxy backend API calls in development
      // In production, these are handled by the actual backend server
      '/api/ha': {
        target: 'http://10.10.1.4:8123',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api\/ha/, '/api'), // /api/ha/states -> /api/states
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            // Forward the HA token from X-HA-Token header to Authorization header
            const haToken = req.headers['x-ha-token']
            if (haToken) {
              proxyReq.setHeader('Authorization', `Bearer ${haToken}`)
            }
            // Remove the X-HA-Token header (HA doesn't need it)
            proxyReq.removeHeader('x-ha-token')
          })
        },
      },
    },
  },
})
