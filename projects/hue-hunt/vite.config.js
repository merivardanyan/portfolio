import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: { outDir: 'dist', target: 'es2022' },
  css: { modules: { localsConvention: 'camelCaseOnly' } },
  test: { environment: 'node', include: ['src/**/*.test.js'] },
});
