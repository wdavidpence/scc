import { defineConfig } from 'vite';

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/scc/',
  server: { host: '0.0.0.0', port: 5175, strictPort: true },
  build: {
    outDir: 'dist2',
    sourcemap: true,
    rollupOptions: { input: 'index2.html' }
  }
}));
