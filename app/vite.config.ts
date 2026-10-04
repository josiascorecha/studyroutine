/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/** Põe o servidor de sincronização do build na política de segurança (CSP) do index.html. */
function syncOriginCsp(origin: string): Plugin {
  return {
    name: 'studyroutine-csp',
    transformIndexHtml: {
      order: 'pre',
      handler: (html) => html.replace('%VITE_SYNC_ORIGIN%', /^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(origin) ? origin : ''),
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), syncOriginCsp(env.VITE_SYNC_ORIGIN ?? '')],
    build: {
      outDir: 'dist',
      sourcemap: false,
      target: 'es2022',
    },
    server: {
      port: 5173,
      // Em desenvolvimento, a API local (server/) responde em 3000.
      proxy: { '/api': 'http://localhost:3000' },
    },
    test: {
      include: ['test/**/*.test.ts'],
      environment: 'node',
      setupFiles: ['test/setup.ts'],
    },
  };
});
