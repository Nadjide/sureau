import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import {
  accessibilityViolations,
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

interface PlanContent {
  name: string;
  workstations: { id: string }[];
  furniture: unknown[];
  colors: { floor: string };
}

interface WorkspaceSnapshot {
  revision: number;
  workspace: { floors: unknown[]; rooms: { plan: PlanContent }[] };
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
  await page.locator('#auth-setup-token').waitFor();
  expect(await accessibilityViolations(page), 'first-run page').toEqual([]);
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

  // Le nom par défaut est propre au port : deux instances d'une même machine
  // ne se ferment pas mutuellement leurs sessions dans un navigateur.
  const cookies = await context.cookies();
  expect(cookies.map((candidate) => candidate.name)).not.toContain('SESSION');
  const cookie = cookies.find((candidate) => candidate.name === `SUREAU_SESSION_${new URL(origin).port}`);
  expect(cookie, 'session cookie').toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe('Lax');
  saveState({ admin, viewer, session: { name: cookie?.name ?? '', value: cookie?.value ?? '' } });

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
});

test('customizes the plan with a desk, furniture, colors, a floor and a room, then keeps it after a reload', async () => {
  const second = await mutate(context.request, 'post', '/api/assets', {
    assetTag: 'E2E-02',
    serialNumber: 'E2E-SERIAL-02',
    name: 'Portable de recette',
    category: 'COMPUTER',
    status: 'AVAILABLE',
  });
  expect(second.status()).toBe(201);
  const secondAsset = (await second.json()) as { id: number };

  // L'espace a été enregistré par l'API au test précédent : recharger la page
  // récupère cette version, sinon l'enregistrement serait refusé comme périmé.
  await page.goto('/#spaces');
  await page.reload();
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();
  const before = await getJson<WorkspaceSnapshot>(context.request, '/api/workspace');
  const planBefore = before.workspace.rooms[0]!.plan;

  await page.getByRole('button', { name: 'Plan 2D', exact: true }).click();
  await page.getByRole('button', { name: 'Modifier', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter un poste', exact: true }).click();
  await page.getByLabel('Nom du poste', { exact: true }).fill('Poste recette');
  await page.getByRole('button', { name: 'Appliquer au poste', exact: true }).click();
  await page.getByRole('button', { name: 'Catalogue', exact: true }).click();
  await page.getByRole('button', { name: 'Ajouter : Table de réunion', exact: true }).click();
  await page.getByRole('button', { name: 'Plateau & couleurs', exact: true }).click();
  await page.getByRole('button', { name: /Botanique Sauge/ }).click();
  await page.getByLabel('Nom du plateau', { exact: true }).fill('Accueil recette');
  await page.getByRole('button', { name: 'Appliquer au plateau', exact: true }).click();
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();

  // Le second matériel est localisé sur le nouveau poste, par son identifiant.
  await page.getByRole('button', { name: 'Matériel', exact: true }).click();
  await page.getByRole('button', { name: /Portable de recette/ }).click();
  const deskOption = page.locator(`#location-${secondAsset.id} option`).filter({ hasText: 'Poste recette' });
  const newDesk = await deskOption.getAttribute('value');
  expect(newDesk).toBeTruthy();
  await page.locator(`#location-${secondAsset.id}`).selectOption(newDesk!);
  await page.getByRole('button', { name: 'Enregistrer l’espace', exact: true }).click();
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();

  const saved = await getJson<WorkspaceSnapshot>(context.request, '/api/workspace');
  const plan = saved.workspace.rooms[0]!.plan;
  expect(plan.name).toBe('Accueil recette');
  expect(plan.workstations).toHaveLength(planBefore.workstations.length + 1);
  expect(plan.furniture).toHaveLength(planBefore.furniture.length + 1);
  expect(plan.colors.floor).not.toBe(planBefore.colors.floor);
  expect(saved.locations[String(secondAsset.id)]).toBe(newDesk);
  // Les liens existants, y compris celui d'un matériel inconnu, sont conservés.
  expect(saved.locations[String(asset.id)]).toBe(before.locations[String(asset.id)]);
  expect(saved.locations['999999']).toBe('desk-e2e-orphan');
  // Placer ou personnaliser ne change jamais le statut métier.
  expect(await getJson(context.request, `/api/assets/${secondAsset.id}`)).toMatchObject({ status: 'AVAILABLE' });

  // L'historique du matériel retient sa création et son placement, avec leur auteur.
  await page.getByRole('button', { name: 'Voir l’historique', exact: true }).click();
  const events = page.getByRole('list', { name: 'Historique de E2E-02' }).locator(':scope > li');
  await expect(events).toHaveCount(2);
  await expect(events.first()).toContainText('Placé sur un poste');
  await expect(events.first()).toContainText('Poste recette · Accueil recette');
  await expect(events.first()).toContainText(`${admin.displayName} (@${admin.username})`);
  await expect(events.last()).toContainText('Fiche créée');
  await page.getByRole('button', { name: 'Fermer l’historique', exact: true }).click();

  await page.getByRole('button', { name: 'Espaces', exact: true }).click();
  await page.getByRole('button', { name: 'Gérer les espaces', exact: true }).click();
  await page.getByRole('button', { name: 'Étages', exact: true }).click();
  await page.getByLabel('Nom du nouvel étage', { exact: true }).fill('Étage recette');
  await page.getByRole('button', { name: 'Créer l’étage', exact: true }).click();
  await page.getByRole('button', { name: 'Créer une salle ici', exact: true }).click();
  await page.getByLabel('Nom de la nouvelle salle', { exact: true }).fill('Salle recette');
  await page.getByRole('button', { name: 'Créer la salle', exact: true }).click();
  await page.getByRole('button', { name: 'Fermer la gestion des espaces', exact: true }).click();
  await page.getByRole('button', { name: 'Enregistrer l’espace', exact: true }).click();
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();

  const organized = await getJson<WorkspaceSnapshot>(context.request, '/api/workspace');
  expect(organized.workspace.floors).toHaveLength(2);
  expect(organized.workspace.rooms.map((room) => room.plan.name)).toEqual(['Accueil recette', 'Salle recette']);

  // Après un rechargement complet, le navigateur retrouve la version du serveur.
  await page.reload();
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();
  await page.getByRole('button', { name: /Ouvrir Accueil recette,/ }).click();
  await expect(page.locator('.workstation-strip button')).toHaveCount(plan.workstations.length);

  saveState({
    expected: {
      workspace: await getJson(context.request, '/api/workspace'),
      assets: await getJson(context.request, '/api/assets'),
      users: await getJson(context.request, '/api/users'),
    },
  });
  expect(loadState().session.value).not.toBe('');
  expect(watched.errors).toEqual([]);
});

test('assigns an asset to a named person from its form, then finds it by that person', async () => {
  await page.goto('/#inventory');
  await page.getByRole('button', { name: /Ordinateur de recette/ }).click();
  await page.getByRole('button', { name: 'Modifier la fiche', exact: true }).click();
  await page.locator('#asset-edit-status').selectOption('ASSIGNED');
  await page.locator('#asset-edit-assigneeName').fill('Camille Recette');
  await page.locator('#asset-edit-assigneeEmail').fill('camille.recette@exemple.fr');
  await page.locator('#asset-edit-assigneeDepartment').fill('Accueil');
  expect(await accessibilityViolations(page), 'holder fields').toEqual([]);
  await page.getByRole('button', { name: 'Enregistrer les modifications', exact: true }).click();

  const details = page.getByRole('complementary', { name: 'Fiche de Ordinateur de recette' });
  await expect(details).toContainText('Affecté à');
  await expect(details).toContainText('Camille Recette');
  await expect(details.getByRole('link', { name: 'camille.recette@exemple.fr' })).toHaveAttribute('href', 'mailto:camille.recette@exemple.fr');
  expect(await getJson(context.request, `/api/assets/${asset.id}`)).toMatchObject({
    status: 'ASSIGNED', assignee: { name: 'Camille Recette', email: 'camille.recette@exemple.fr', department: 'Accueil' },
  });

  const search = page.getByRole('textbox', { name: 'Rechercher du matériel' });
  await search.fill('camille');
  await expect(page.locator('.inventory-table tbody tr')).toHaveCount(1);
  await expect(page.locator('.inventory-table tbody tr')).toContainText('Camille Recette');
  await search.fill('');

  await page.getByRole('button', { name: 'Voir l’historique', exact: true }).click();
  const latest = page.getByRole('list', { name: 'Historique de E2E-01' }).locator(':scope > li').first();
  await expect(latest).toContainText('Fiche modifiée');
  await expect(latest).toContainText('Personne équipée');
  await expect(latest).toContainText('Camille Recette');
  await page.getByRole('button', { name: 'Fermer l’historique', exact: true }).click();

  // Les projets suivants vérifient que l'affectation survit au redémarrage et à la restauration.
  saveState({ expected: { ...loadState().expected, assets: await getJson(context.request, '/api/assets') } });
  expect(watched.errors).toEqual([]);
});

test('imports a spreadsheet file all at once, only once every line is valid', async () => {
  const file = (lines: string[]) => ({ name: 'parc.csv', mimeType: 'text/csv', buffer: Buffer.from(`﻿${lines.join('\r\n')}\r\n`) });
  const header = 'Identifiant;Nom;Catégorie;État;Personne;E-mail';
  const before = (await getJson<unknown[]>(context.request, '/api/assets')).length;
  await page.goto('/#inventory');
  await page.getByRole('button', { name: 'Importer', exact: true }).click();
  const chooser = page.getByLabel(/Choisir un (autre )?fichier/);

  // Une erreur visible dans le fichier bloque l'import avant tout envoi.
  await chooser.setInputFiles(file([header, 'E2E-IMP-1;Casque de recette;Imprimante;;;']));
  await expect(page.getByRole('list', { name: 'Lignes à corriger' })).toContainText('Ligne 2 · Catégorie : Catégorie inconnue : « Imprimante ».');
  await expect(page.getByRole('button', { name: 'Importer', exact: true }).last()).toBeDisabled();

  // Un identifiant déjà dans l'inventaire n'est connu que du serveur : il refuse tout.
  await chooser.setInputFiles(file([header, 'E2E-IMP-1;Casque de recette;Casque;;Léa Recette;lea@exemple.fr', 'E2E-01;Doublon;Autre;;;']));
  await page.getByRole('button', { name: 'Importer 2 matériels', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Lignes à corriger' })).toContainText('Ligne 3 · Identifiant : Déjà utilisé par un matériel de l’inventaire.');
  await expect(page.getByText('Aucun matériel n’a été importé.', { exact: false })).toBeVisible();
  expect(await getJson<unknown[]>(context.request, '/api/assets')).toHaveLength(before);

  await chooser.setInputFiles(file([header, 'E2E-IMP-1;Casque de recette;Casque;;Léa Recette;lea@exemple.fr', 'E2E-IMP-2;Souris de recette;Souris;Disponible;;']));
  await expect(page.getByText('2 matériels prêts à importer.', { exact: true })).toBeVisible();
  expect(await accessibilityViolations(page), 'import preview').toEqual([]);
  await page.getByRole('button', { name: 'Importer 2 matériels', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: '2 matériels ont été importés' })).toBeVisible();

  const assets = await getJson<{ assetTag: string; status: string; assignee: { name: string } | null }[]>(context.request, '/api/assets');
  expect(assets).toHaveLength(before + 2);
  expect(assets.find((item) => item.assetTag === 'E2E-IMP-1')).toMatchObject({ status: 'ASSIGNED', assignee: { name: 'Léa Recette' } });
  await page.getByRole('button', { name: /Casque de recette/ }).click();
  await page.getByRole('button', { name: 'Voir l’historique', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Historique de E2E-IMP-1' }).locator(':scope > li')).toContainText('Importé depuis un fichier');
  await page.getByRole('button', { name: 'Fermer l’historique', exact: true }).click();

  saveState({ expected: { ...loadState().expected, assets } });
  expect(watched.errors).toEqual([]);
});

test('records the e-mail address that enterprise sign-in will match, after a security confirmation', async () => {
  // Sans fournisseur configuré, la page de connexion ne propose que le mot de passe.
  expect(await getJson(context.request, '/api/auth/status')).toMatchObject({ sso: null });

  await page.goto('/#inventory');
  await page.getByRole('button', { name: `Compte de ${admin.displayName}`, exact: true }).click();
  await page.getByRole('button', { name: 'Gérer l’équipe', exact: true }).click();
  await page.getByRole('list', { name: 'Comptes de l’instance' }).getByRole('button')
    .filter({ hasText: `@${viewer.username} ·` }).click();
  await page.locator('#user-edit-email').fill('  Lecteur.Recette@exemple.fr ');
  await page.getByRole('button', { name: 'Enregistrer le compte', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Confirmer les nouveaux accès ?' }))
    .toContainText('E-mail de connexion : aucun → Lecteur.Recette@exemple.fr.');
  await page.getByRole('button', { name: 'Confirmer la modification du compte', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Comptes de l’instance' })).toContainText('Lecteur.Recette@exemple.fr');

  const users = await getJson<{ username: string; email: string | null }[]>(context.request, '/api/users');
  expect(users.find((account) => account.username === viewer.username)?.email).toBe('Lecteur.Recette@exemple.fr');
  await page.keyboard.press('Escape');
  saveState({ expected: { ...loadState().expected, users } });
  expect(watched.errors).toEqual([]);
});

test('invites a first visit to the guide, walks through its steps, then stops inviting', async () => {
  await page.goto('/#spaces');
  await page.reload();
  const invitation = page.getByRole('complementary', { name: 'Découvrir Sureau' });
  await expect(invitation).toContainText('Première visite ?');
  await invitation.getByRole('button', { name: 'Suivre le guide', exact: true }).click();

  const guide = page.getByRole('dialog', { name: 'Bienvenue dans Sureau' });
  await expect(guide).toContainText('Vous êtes administrateur');
  expect(await accessibilityViolations(page), 'guide').toEqual([]);
  await guide.getByRole('button', { name: 'Suivant', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Composer vos espaces' })).toContainText('ÉTAPE 2 SUR 7');
  await page.getByRole('navigation', { name: 'Étapes du guide' }).getByRole('button', { name: /Protéger vos données/ }).click();
  await expect(page.getByRole('dialog', { name: 'Protéger vos données' })).toContainText('Exporter le brouillon');
  await page.getByRole('button', { name: 'Terminer', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  // L'invitation ne revient plus ; le guide reste ouvert à tous par l'en-tête.
  await page.reload();
  await page.getByRole('button', { name: 'Guide', exact: true }).waitFor();
  await expect(invitation).toHaveCount(0);
  await page.getByRole('button', { name: 'Guide', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Bienvenue dans Sureau' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(watched.errors).toEqual([]);
});

test('follows an English browser, then switches language from the account menu and keeps the choice', async ({ browser }) => {
  const english = await newContext(browser, undefined, 'en-GB');
  const visitor = await english.newPage();
  await visitor.goto('/');
  await expect(visitor.getByRole('heading', { name: 'Good to see you again.' })).toBeVisible();
  await expect(visitor.locator('html')).toHaveAttribute('lang', 'en');
  await visitor.getByLabel('Interface language').selectOption('fr');
  await expect(visitor.getByRole('heading', { name: 'Heureux de vous retrouver.' })).toBeVisible();
  await english.close();

  await page.getByRole('button', { name: /^Compte de / }).click();
  await page.getByLabel('Langue de l’interface').selectOption('en');
  await expect(page.getByRole('dialog', { name: 'Your account' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  const navigation = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(navigation.getByRole('button', { name: 'Equipment' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  expect(await accessibilityViolations(page), 'English interface').toEqual([]);

  await page.getByRole('button', { name: /’s account$/ }).click();
  await page.getByLabel('Interface language').selectOption('fr');
  await expect(page.getByRole('dialog', { name: 'Votre compte' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toBeVisible();
  expect(watched.errors).toEqual([]);
});

test('meets the automatic WCAG A/AA checks on the main screens, in both themes', async () => {
  // Quatorze audits complets : sur un runner de CI, ils dépassent le délai ordinaire d'un test.
  test.slow();
  const audit = async (screen: string) => expect(await accessibilityViolations(page), screen).toEqual([]);
  for (const theme of ['light', 'dark']) {
    await page.evaluate((value) => localStorage.setItem('sureau-theme', value), theme);
    await page.goto('/#spaces');
    await page.reload();
    await page.getByRole('button', { name: 'Plan 2D', exact: true }).click();
    await page.locator('.workstation-strip button').first().click();
    await audit(`${theme} plan`);
    await page.getByRole('button', { name: 'Modifier', exact: true }).click();
    await audit(`${theme} workshop`);
    await page.getByRole('button', { name: 'Terminer', exact: true }).click();

    await page.getByRole('button', { name: 'Matériel', exact: true }).click();
    await page.getByRole('button', { name: /Portable de recette/ }).click();
    await audit(`${theme} inventory`);
    await page.getByRole('button', { name: 'Voir l’historique', exact: true }).click();
    await page.getByRole('list', { name: 'Historique de E2E-02' }).waitFor();
    await audit(`${theme} history`);
    await page.getByRole('button', { name: 'Fermer l’historique', exact: true }).click();
    await page.getByRole('button', { name: 'Ajouter du matériel', exact: true }).click();
    await audit(`${theme} new asset`);
    await page.getByRole('button', { name: 'Fermer l’ajout de matériel', exact: true }).click();

    await page.getByRole('button', { name: `Compte de ${admin.displayName}`, exact: true }).click();
    await audit(`${theme} account menu`);
    await page.getByRole('button', { name: 'Gérer l’équipe', exact: true }).click();
    await page.getByText(viewer.displayName, { exact: true }).first().waitFor();
    await audit(`${theme} team`);
    await page.keyboard.press('Escape');
  }
  await page.evaluate(() => localStorage.setItem('sureau-theme', 'light'));
  expect(watched.errors).toEqual([]);
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
    locale: 'fr-FR',
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
