import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs on port 5000; the proxy keeps one origin so cookies and CSRF work as in production (D-02).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5000' } },
  build: { outDir: 'dist', target: ['chrome110', 'firefox110', 'edge110', 'safari16'], sourcemap: false },
  test: { environment: 'jsdom', globals: true, setupFiles: ['./src/test/setup.js'], css: false },
});
