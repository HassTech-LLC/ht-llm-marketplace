import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const isWidgetBuild = process.env.WIDGET_BUILD === 'true';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,
  },
  build: isWidgetBuild ? {
    lib: {
      entry: './src/main.jsx',
      name: 'LuminaWidget',
      fileName: () => 'lumina-widget.js',
      formats: ['iife'],
    },
    cssCodeSplit: false,
    outDir: '../lumina-backend/widget',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith('.css')) {
            return 'lumina-widget.css';
          }
          return '[name].[ext]';
        }
      }
    }
  } : {
    outDir: 'dist'
  }
});
