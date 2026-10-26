import { defineConfig } from '@playwright/test';

// Ces parcours s'exécutent contre une instance Sureau réellement installée
// (application + PostgreSQL), jamais contre un serveur simulé. e2e/run.sh la
// crée, la redémarre et la restaure entre les trois projets ci-dessous.
const origin = process.env.SUREAU_E2E_ORIGIN;
if (!origin) {
  throw new Error('SUREAU_E2E_ORIGIN est obligatoire : lancez e2e/run.sh ou indiquez l’adresse de l’instance.');
}

export default defineConfig({
  testDir: './tests',
  // Les scénarios d'un projet se suivent sur la même instance et le même compte.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL: origin,
    // Sans choix enregistré, l'interface suit la langue du navigateur.
    locale: 'fr-FR',
    // SUREAU_E2E_CHANNEL=chrome utilise le Chrome installé plutôt que le
    // Chromium téléchargé par Playwright.
    channel: process.env.SUREAU_E2E_CHANNEL || undefined,
    // Le rendu logiciel permet de tester la scène WebGL sans carte graphique.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'install', testMatch: /01-install\.spec\.ts/ },
    { name: 'after-restart', testMatch: /02-after-restart\.spec\.ts/ },
    { name: 'after-restore', testMatch: /03-after-restore\.spec\.ts/ },
  ],
});
