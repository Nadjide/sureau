import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  expectJsonError,
  getJson,
  login,
  loadState,
  mutate,
  newContext,
  newCredentials,
  origin,
  requiredEnv,
  saveState,
  waitForWebGlScene,
  watchPage,
} from './support';

// Installation d'une instance neuve par son interface, puis création des
// données dont les projets suivants vérifient la conservation.
test.describe.configure({ mode: 'serial' });

interface WorkspaceSnapshot {
  revision: number;
  workspace: { rooms: { plan: { workstations: { id: string }[] } }[] };
  locations: Record<string, string>;
}

const setupToken = requiredEnv('SUREAU_E2E_SETUP_TOKEN');
const { admin, viewer } = newCredentials();

let context: BrowserContext;
let page: Page;
let watched: ReturnType<typeof watchPage>;
let asset: { id: number; revision: number };

test.beforeAll(async ({ browser }) => {
  context = await newContext(browser);
  page = await context.newPage();
  watched = watchPage(page);
});

test.afterAll(async () => {
  await context.close();
});

test('serves the compiled application and its assets from the same origin', async () => {
  const response = await context.request.get('/');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toMatch(/text\/html/);
  const html = await response.text();
  expect(html).toMatch(/<title>Sureau/);
  expect(html).not.toContain('/src/main.tsx');

  const assets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?]+\.(?:js|css))"/g)].map((match) => match[1] ?? '');
  expect(assets.some((path) => path.endsWith('.js'))).toBe(true);
  expect(assets.some((path) => path.endsWith('.css'))).toBe(true);
  for (const path of assets) {
    const asset = await context.request.get(path);
    expect(asset.status(), path).toBe(200);
    expect(asset.headers()['content-type'] ?? '').not.toMatch(/text\/html/);
  }
  expect((await context.request.get('/sureau.svg')).status()).toBe(200);
});

test('exposes health probes without database details', async () => {
  for (const path of ['/actuator/health', '/actuator/health/readiness', '/actuator/health/liveness']) {
    const health = await getJson<Record<string, unknown>>(context.request, path);
    expect(health.status, path).toBe('UP');
    expect(health, path).not.toHaveProperty('components');
  }
  expect([401, 403, 404]).toContain((await context.request.get('/actuator/env')).status());
});

test('refuses anonymous API access and announces that setup is required', async () => {
  const response = await context.request.get('/api/assets');
  await expectJsonError(response, 401);
  expect(await response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  expect(await getJson(context.request, '/api/auth/status')).toMatchObject({ setupRequired: true });
});

test('the first-run page creates the administrator and opens the application', async () => {
  await page.goto('/#spaces');
  await page.locator('#auth-setup-token').fill(setupToken);
  await page.locator('#auth-display-name').fill(admin.displayName);
  await page.locator('#auth-username').fill(admin.username);
  await page.locator('#auth-password').fill(admin.password);
  await page.locator('#auth-confirmation').fill(admin.password);
  await page.getByRole('button', { name: 'Créer mon espace administrateur', exact: true }).click();
  await page.getByRole('button', { name: `Compte de ${admin.displayName}`, exact: true }).waitFor();

  expect(await getJson(context.request, '/api/auth/me')).toMatchObject({ role: 'ADMIN', username: admin.username });
  expect(await getJson(context.request, '/api/assets')).toEqual([]);
  await getJson(context.request, '/api/workspace', 404);

  const cookie = (await context.cookies()).find((candidate) => candidate.name === 'SESSION');
  expect(cookie, 'session cookie').toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  saveState({ admin, viewer, session: cookie?.value ?? '' });

  expect(await getJson(context.request, '/api/auth/status')).toMatchObject({ setupRequired: false });
});

test('stores inventory and accounts, and keeps a reader read-only', async ({ browser }) => {
  const created = await mutate(context.request, 'post', '/api/assets', {
    assetTag: 'E2E-01',
    serialNumber: 'E2E-SERIAL-01',
    name: 'Ordinateur de recette',
    brand: null,
    model: null,
    category: 'COMPUTER',
    status: 'AVAILABLE',
    purchaseDate: '2026-10-25',
  });
  expect(created.status()).toBe(201);
  asset = (await created.json()) as { id: number; revision: number };
  expect(asset.revision).toBe(0);

  const account = await mutate(context.request, 'post', '/api/users', {
    username: viewer.username,
    displayName: viewer.displayName,
    password: viewer.password,
    role: 'VIEWER',
  });
  expect(account.status()).toBe(201);

  const reader = await newContext(browser);
  try {
    await login(reader.request, viewer);
    expect((await reader.request.get('/api/assets')).status()).toBe(200);
    const forbidden = await mutate(reader.request, 'post', '/api/assets', {
      assetTag: 'E2E-FORBIDDEN',
      name: 'Interdit',
      category: 'OTHER',
      status: 'AVAILABLE',
    });
    expect(forbidden.status()).toBe(403);
    expect(await getJson<unknown[]>(context.request, '/api/assets')).toHaveLength(1);
  } finally {
    await reader.close();
  }
});

test('keeps the example plan as a draft until it is saved, then links the asset atomically', async () => {
  let writes = 0;
  page.on('request', (request) => {
    if (request.method() === 'PUT' && new URL(request.url()).pathname === '/api/workspace') writes++;
  });

  await page.getByRole('button', { name: 'Préparer l’exemple', exact: true }).click();
  await page.locator('.workstation-strip button').first().waitFor();
  expect(writes, 'preparing the example must not save').toBe(0);
  await getJson(context.request, '/api/workspace', 404);

  await page.getByRole('button', { name: 'Enregistrer l’espace', exact: true }).click();
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();
  expect(writes).toBe(1);
  const snapshot = await getJson<WorkspaceSnapshot>(context.request, '/api/workspace');
  expect(snapshot.revision).toBe(1);
  expect(snapshot.locations).toEqual({});

  const desk = snapshot.workspace.rooms[0]?.plan.workstations[0]?.id ?? '';
  expect(desk).not.toBe('');
  // Le lien d'un matériel inconnu est conservé tel quel : il n'est jamais supprimé en silence.
  const linked = await mutate(context.request, 'put', '/api/workspace', {
    expectedRevision: 1,
    workspace: snapshot.workspace,
    locations: { [asset.id]: desk, 999999: 'desk-e2e-orphan' },
  });
  expect(linked.status()).toBe(200);
  const state = (await linked.json()) as WorkspaceSnapshot;
  expect(state.revision).toBe(2);
  expect(state.locations[String(asset.id)]).toBe(desk);

  // Placer un matériel ne change pas son statut métier.
  expect(await getJson(context.request, `/api/assets/${asset.id}`)).toMatchObject({ status: 'AVAILABLE' });

  saveState({
    expected: {
      workspace: await getJson(context.request, '/api/workspace'),
      assets: await getJson(context.request, '/api/assets'),
      users: await getJson(context.request, '/api/users'),
    },
  });
  expect(loadState().session).not.toBe('');
});

test('answers unknown API routes with JSON and no internal details', async () => {
  await expectJsonError(await context.request.get('/api/route-that-does-not-exist'), 404);
});

test('renders the lazy 3D scene with WebGL and no external dependency', async () => {
  await page.goto('/#spaces');
  await page.getByRole('button', { name: 'Vue 3D', exact: true }).click();
  await waitForWebGlScene(page);
  expect(watched.failedAssets).toEqual([]);
  expect(watched.external).toEqual([]);
});

test('keeps the 2D plan usable on a phone without page errors', async ({ browser }) => {
  const mobileContext = await browser.newContext({
    baseURL: origin,
    storageState: await context.storageState(),
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  try {
    const mobile = await mobileContext.newPage();
    const mobileWatched = watchPage(mobile);
    await mobile.goto('/#spaces');
    await mobile.getByRole('button', { name: 'Plan 2D', exact: true }).click();
    await mobile.locator('.workstation-strip button').first().waitFor();
    expect(await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(mobileWatched.errors).toEqual([]);
    expect(mobileWatched.failedAssets).toEqual([]);
    expect(mobileWatched.external).toEqual([]);
    expect(watched.errors).toEqual([]);
  } finally {
    await mobileContext.close();
  }
});
