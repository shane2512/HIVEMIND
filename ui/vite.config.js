import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/mirror': {
        target: process.env.VITE_MIRROR_NODE_URL || 'https://testnet.mirrornode.hedera.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/mirror/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader(
              'User-Agent',
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
            );
          });
        }
      }
    }
  }
});
