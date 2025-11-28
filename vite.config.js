import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: {
    port: 8080,
    open: false,
    fs: {
      // Allow serving files from workspace root (two levels up)
      allow: ['..', '../..']
    }
  },
  publicDir: resolve(__dirname, '../../docs'), // Serve docs folder as public directory
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@examples': resolve(__dirname, 'examples'),
      // Add alias for docs folder at workspace root
      '@docs': resolve(__dirname, '../../docs')
    },
    extensions: ['.mjs', '.js', '.mts', '.ts', '.jsx', '.tsx', '.json']
  },
  optimizeDeps: {
    include: ['d3']
  }
})