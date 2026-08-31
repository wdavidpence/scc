import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist-preview',
    sourcemap: false,
    rollupOptions: { input: 'index2.html' }
  }
});
