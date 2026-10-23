import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('recharts')) return 'recharts';
              if (id.includes('motion')) return 'motion';
              if (id.includes('leaflet')) return 'leaflet';
              if (id.includes('lucide-react')) return 'icons';
              if (id.includes('date-fns')) return 'date-fns';
              return 'vendor';
            }
          },
        },
      },
    },
    server: {
      host: true,
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.CHOKIDAR_USEPOLLING === 'true' ? { usePolling: true, interval: 300 } : undefined,
    },
  };
});
