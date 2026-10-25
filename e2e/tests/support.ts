import { expect, type APIRequestContext, type APIResponse, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const origin = process.env.SUREAU_E2E_ORIGIN ?? '';
const statePath = resolve(process.env.SUREAU_E2E_STATE ?? '.state/state.json');

export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} est obligatoire : lancez e2e/run.sh.`);
  return value;
}

export interface Credentials {
  username: string;
  displayName: string;
  password: string;
}

// État partagé entre les projets, qui s'exécutent dans des processus séparés
// (avant et après un redémarrage ou une restauration de l'instance).
export interface E2eState {
  admin: Credentials;
  viewer: Credentials;
  /** Valeur du cookie SESSION de l'administrateur ouvert pendant l'installation. */
  session: string;
  expected: { workspace: unknown; assets: unknown; users: unknown };
}

function randomPassword(): string {
  return `Se-${randomBytes(15).toString('hex')}-1aA`;
}

export function newCredentials(): { admin: Credentials; viewer: Credentials } {
  return {
    admin: { username: 'e2e-admin', displayName: 'Équipe E2E', password: randomPassword() },
    viewer: { username: 'e2e-viewer', displayName: 'Lecteur E2E', password: randomPassword() },
  };
}

export function saveState(state: Partial<E2eState>): void {
  const current = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, 'utf8')) as Partial<E2eState>) : {};
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify({ ...current, ...state }, null, 2), { mode: 0o600 });
}

export function loadState(): E2eState {
  if (!existsSync(statePath)) throw new Error(`${statePath} est introuvable : le projet « install » doit s’exécuter d’abord.`);
  return JSON.parse(readFileSync(statePath, 'utf8')) as E2eState;
}

export function newContext(browser: Browser, viewport = { width: 1440, height: 1000 }): Promise<BrowserContext> {
  // browser.newContext() n'hérite pas des options de la configuration.
  return browser.newContext({ baseURL: origin, viewport, reducedMotion: 'reduce' });
}

export async function getJson<T = unknown>(request: APIRequestContext, path: string, status = 200): Promise<T> {
  const response = await request.get(path);
  expect(response.status(), `GET ${path}`).toBe(status);
  return (await response.json()) as T;
}

export async function mutate(
  request: APIRequestContext,
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  data?: unknown,
): Promise<APIResponse> {
  const csrf = await getJson<{ headerName: string; token: string }>(request, '/api/auth/csrf');
  return request[method](path, { headers: { [csrf.headerName]: csrf.token }, data });
}

export async function login(request: APIRequestContext, credentials: Credentials): Promise<void> {
  const csrf = await getJson<{ headerName: string; token: string }>(request, '/api/auth/csrf');
  const response = await request.post('/api/auth/login', {
    headers: { [csrf.headerName]: csrf.token },
    form: { username: credentials.username, password: credentials.password },
  });
  expect(response.status(), 'POST /api/auth/login').toBe(204);
}

/** Erreurs de page, violations de la CSP et requêtes hors origine observées pendant un parcours. */
export function watchPage(page: Page): { errors: string[]; external: string[]; failedAssets: string[] } {
  const watched = { errors: [] as string[], external: [] as string[], failedAssets: [] as string[] };
  page.on('pageerror', (error) => watched.errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /Content Security Policy/i.test(message.text())) watched.errors.push(message.text());
  });
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== origin) watched.external.push(request.url());
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && new URL(response.url()).pathname.startsWith('/assets/')) {
      watched.failedAssets.push(`${response.status()} ${response.url()}`);
    }
  });
  return watched;
}

export async function expectJsonError(response: APIResponse, status: number): Promise<void> {
  expect(response.status()).toBe(status);
  expect(response.headers()['content-type'] ?? '').toMatch(/json/);
  // Aucune page HTML ni détail interne de l'application dans une erreur d'API.
  expect(await response.text()).not.toMatch(/<!doctype|<html|java\.lang|org\.springframework|"trace"|"exception"/i);
}

export async function waitForWebGlScene(page: Page): Promise<void> {
  const canvas = page.locator('canvas').first();
  await canvas.waitFor({ timeout: 30_000 });
  await page.waitForFunction(() => {
    const element = document.querySelector('canvas');
    return Boolean(element && element.width > 100 && element.height > 100 && (element.getContext('webgl2') || element.getContext('webgl')));
  });
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
}
