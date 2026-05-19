import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/performance-sales/',
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir:     '../public',
    emptyOutDir: true,
    sourcemap:  false,
    rollupOptions: {
      output: {
        // Chunking for better caching
        manualChunks: (id) => {
          if (id.includes('echarts'))       return 'echarts';
          if (id.includes('react-router'))  return 'vendor';
          if (id.includes('node_modules'))  return 'vendor';
        },
      },
    },
  },
  server: {
    host: '10.0.0.187',
    port: 5173,
    proxy: {
      '/performance-sales/api': {
        target:      'http://10.0.0.187:3003',
        changeOrigin: true,
      },
    },
  },
});
