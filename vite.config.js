import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  // '/' for local dev, '/scc/' for GitHub Pages.
  base: command === 'serve' ? '/' : '/scc/',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
}));
