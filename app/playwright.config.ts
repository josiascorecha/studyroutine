import { defineConfig, devices } from '@playwright/test';

/**
 * Testes ponta a ponta da versão web servida pelo servidor (server/ com STATIC_DIR=../app/dist).
 * Antes: build do app com VITE_ALLOW_DATE_OVERRIDE=1 e servidor rodando em E2E_BASE_URL.
 * O áudio e os metadados oficiais são simulados nos testes (nenhuma chamada sai para o jw.org).
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: 'celular', use: { ...devices['Pixel 7'] } },
    { name: 'computador', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
  ],
});
