import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({mode}) => {
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(process.env.GEMINI_API_KEY),
      'process.env.VITE_CARD_SERVER_URL': JSON.stringify(process.env.VITE_CARD_SERVER_URL || ''),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'firebase/auth': path.resolve(__dirname, 'src/platform/firebase-shim/auth.ts'),
        'firebase/firestore': path.resolve(__dirname, 'src/platform/firebase-shim/firestore.ts'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('firebase') || id.includes('\\appwrite\\') || id.includes('/appwrite/')) return 'platform';
            if (id.includes('@google/genai')) return 'genai';
            if (id.includes('framer-motion') || id.includes('\\motion\\') || id.includes('/motion/')) return 'motion';
            if (id.includes('recharts') || id.includes('\\d3-') || id.includes('/d3-')) return 'charts';
            if (
              id.includes('react-markdown') ||
              id.includes('\\remark-') ||
              id.includes('/remark-') ||
              id.includes('\\rehype-') ||
              id.includes('/rehype-') ||
              id.includes('\\unified\\') ||
              id.includes('/unified/') ||
              id.includes('\\micromark') ||
              id.includes('/micromark') ||
              id.includes('\\mdast-') ||
              id.includes('/mdast-')
            ) {
              return 'markdown';
            }
            if (id.includes('lucide-react')) return 'icons';
            return 'vendor';
          },
        },
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});
