import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', target: 'es2022' },
  test: { environment: 'node', include: ['test/**/*.test.js'] },
});
