import { defineConfig } from 'vite';

// Üretim: `npm run build` -> dist/ (sunucu bunu servis eder).
// Geliştirme: `npm run dev` (5173) + `npm run server` (3000); /ws sunucuya yönlenir.
export default defineConfig({
  root: '.',
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    port: 5173,
    proxy: { '/ws': { target: 'ws://localhost:3000', ws: true } },
  },
});
