import { expect, request, test, type BrowserContext, type Page } from '@playwright/test';
import { getJson, loadState, login, newContext, origin, waitForWebGlScene, watchPage, type E2eState } from './support';

// Contrôles communs aux projets exécutés après un redémarrage ou une
// restauration : comptes, inventaire et plan lié doivent être strictement
// ceux créés pendant l'installation.
export function registerPersistedInstanceTests(): void {
  test.describe.configure({ mode: 'serial' });

  let context: BrowserContext;
  let page: Page;
  let watched: ReturnType<typeof watchPage>;

  test.beforeAll(async ({ browser }) => {
    context = await newContext(browser);
    page = await context.newPage();
    watched = watchPage(page);
  });

  test.afterAll(async () => {
    await context.close();
  });

  test('is no longer waiting for its first administrator', async () => {
    expect(await getJson(context.request, '/api/auth/status')).toMatchObject({ setupRequired: false });
  });

  test('keeps the exact accounts, inventory and linked plan', async () => {
    const state = loadState();
    await login(context.request, state.admin);
    expect(await getJson(context.request, '/api/workspace')).toEqual(state.expected.workspace);
    expect(await getJson(context.request, '/api/assets')).toEqual(state.expected.assets);
    expect(await getJson(context.request, '/api/users')).toEqual(state.expected.users);
    await page.goto('/#spaces');
    await page.getByRole('button', { name: `Compte de ${state.admin.displayName}`, exact: true }).waitFor();
  });

  test('still renders the saved plan in 3D', async () => {
    await page.getByRole('button', { name: 'Vue 3D', exact: true }).click();
    await waitForWebGlScene(page);
    expect(watched.errors).toEqual([]);
    expect(watched.failedAssets).toEqual([]);
    expect(watched.external).toEqual([]);
  });
}

// Statut de /api/auth/me pour une requête qui ne présente que ce cookie.
export async function expectSessionStatus(session: E2eState['session'], status: 200 | 401): Promise<void> {
  const client = await request.newContext({ baseURL: origin, extraHTTPHeaders: { Cookie: `${session.name}=${session.value}` } });
  try {
    expect((await client.get('/api/auth/me')).status()).toBe(status);
  } finally {
    await client.dispose();
  }
}
