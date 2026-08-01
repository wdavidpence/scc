import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    // Use '/scc/' for GitHub Pages subpath, '/' for local dev.
    base: env.VITE_BASE ?? '/scc/',
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
  };
});
