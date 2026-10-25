// Tournage de la vidéo de présentation sur une instance Sureau réelle et neuve.
// Chaque scène est enregistrée image par image (screencast Chrome) avec ses
// horodatages dans $VIDEO_WORKDIR/segments ; montage.mjs assemble ensuite.
// Lancer plutôt docs/presentation/tourner.sh, qui prépare l'instance.
import { createRequire } from 'node:module';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { admin, seed } from './demo-data.mjs';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

const stageScript = fileURLToPath(new URL('./stage.js', import.meta.url));
const work = join(process.env.VIDEO_WORKDIR ?? join(tmpdir(), 'sureau-presentation'), '/');
const origin = process.env.VIDEO_ORIGIN;
const setupToken = process.env.VIDEO_SETUP_TOKEN;
if (!origin || !setupToken) throw new Error('VIDEO_ORIGIN et VIDEO_SETUP_TOKEN sont requis (voir tourner.sh).');
const only = process.env.VIDEO_ONLY; // facultatif : ne tourner que ce segment (mise au point)

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
rmSync(work + 'segments', { recursive: true, force: true });
mkdirSync(work + 'segments', { recursive: true });

// Rendu GPU indispensable pour une 3D fluide ; densité 4/3 : l'interface est
// mise en page en 1440 × 810 et capturée en 1920 × 1080 natif.
const gpu = process.env.VIDEO_CHROME_ARGS?.split(' ') ?? [process.platform === 'win32' ? '--use-angle=d3d11' : '--use-angle=gl'];
const browser = await chromium.launch({
  channel: process.env.VIDEO_CHANNEL ?? 'chrome',
  args: [...gpu, '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-device-scale-factor=1.3333333'],
});
const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3, colorScheme: 'light', locale: 'fr-FR', timezoneId: 'Europe/Paris' });
await context.addInitScript({ path: stageScript });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const cdp = await context.newCDPSession(page);

// --- Enregistrement -------------------------------------------------------
const segments = [];
let segment = null;
cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
  cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  if (!segment) return;
  const file = `${segment.dir}/${String(segment.frames.length).padStart(6, '0')}.jpg`;
  writeFileSync(file, Buffer.from(data, 'base64'));
  segment.frames.push({ file, t: metadata.timestamp, wall: Date.now() / 1000 });
});
async function record(name, scene) {
  if (only && only !== name) return;
  const dir = `${work}segments/${String(segments.length + 1).padStart(2, '0')}-${name}`;
  mkdirSync(dir, { recursive: true });
  segment = { name, dir, frames: [] };
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 95, maxWidth: 1920, maxHeight: 1080 });
  await scene();
  const end = Date.now() / 1000;
  await cdp.send('Page.stopScreencast');
  segment.end = end;
  segments.push(segment);
  console.log(`segment ${name} : ${segment.frames.length} images, ${(end - segment.frames[0].wall).toFixed(1)} s`);
  segment = null;
}

// --- Gestes ---------------------------------------------------------------
let mouse = { x: 900, y: 600 };
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
async function move(x, y, ms = 750) {
  const from = { ...mouse };
  const steps = Math.max(8, Math.round(ms / 16));
  for (let i = 1; i <= steps; i++) {
    const k = ease(i / steps);
    await page.mouse.move(from.x + (x - from.x) * k, from.y + (y - from.y) * k);
    await sleep(ms / steps);
  }
  mouse = { x, y };
}
async function center(locator) {
  await locator.waitFor({ state: 'visible', timeout: 20000 });
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}
async function click(locator, { ms = 620, pause = 200 } = {}) {
  const point = await center(locator);
  await move(point.x, point.y, ms);
  await sleep(pause);
  await page.mouse.down(); await sleep(90); await page.mouse.up();
  await sleep(200);
}
async function drag(from, to, ms = 1400) {
  await move(from.x, from.y, 650); await sleep(200);
  await page.mouse.down(); await sleep(120);
  await move(to.x, to.y, ms); await sleep(120);
  await page.mouse.up();
}
const type = (text, delay = 70) => page.keyboard.type(text, { delay });
const stage = (method, ...args) => page.evaluate(([m, a]) => window.__stage[m](...a), [method, args]);
const button = (name) => page.getByRole('button', { name, exact: true });

// --- Scènes ---------------------------------------------------------------
await page.goto('/');
await page.locator('#auth-setup-token').waitFor();
await stage('intro');
await sleep(400);

await record('ouverture', async () => {
  await sleep(4200);
  await stage('fadeCardContent'); await sleep(550);
  await stage('terminal', '01', 'Installation', 'Installé chez vous en deux commandes.',
    'Seul Docker est nécessaire. L’application et sa base PostgreSQL restent sur votre infrastructure.', [
      { cmd: 'deploy/sureau.sh init' },
      { out: 'Configuration créée : /srv/sureau/.env.instance' },
      { out: 'Clé d’installation du premier administrateur (à saisir une seule fois dans l’interface) :', cls: 'dim' },
      { out: '  7c2e9a41f05b8d36e1a4c7f29b3d6e08a5f1c4b7d2e9a063', cls: 'hl', delay: 120 },
      { cmd: 'deploy/sureau.sh up' },
      { out: ' ✔ Container sureau-instance-postgres-1  Healthy', cls: 'ok', delay: 600 },
      { out: ' ✔ Container sureau-instance-app-1       Healthy', cls: 'ok', delay: 700 },
      { out: '' },
      { out: 'Sureau est démarré : http://127.0.0.1:8080', cls: 'c' },
    ]);
  await sleep(1300);
  await stage('hideCard'); await stage('cursor', true);
  await sleep(500);
  await stage('caption', '02', 'Créez votre espace', 'Le premier compte administrateur, avec la clé d’installation.');
  await click(page.locator('#auth-setup-token'));
  await page.keyboard.insertText(setupToken); await sleep(400);
  await click(page.locator('#auth-display-name'), { ms: 420, pause: 100 }); await type(admin.displayName, 45);
  await click(page.locator('#auth-username'), { ms: 420, pause: 100 }); await type(admin.username, 50);
  await click(page.locator('#auth-password'), { ms: 420, pause: 100 }); await type(admin.password, 22);
  await click(page.locator('#auth-confirmation'), { ms: 420, pause: 100 }); await type(admin.password, 22);
  await click(button('Créer mon espace administrateur'));
  await button('Compte de Camille Bernard').waitFor();
  await sleep(1500);
  await stage('hideCaption'); await sleep(350);
});

// Hors champ : l'équipe remplit l'inventaire et dessine ses espaces.
console.log('données :', await seed(origin, { setupToken }));
await page.goto('/#inventory'); await page.reload();
await page.getByText('26 équipements').waitFor({ timeout: 20000 });
await stage('cursor', true);
await page.mouse.move(mouse.x, mouse.y);
await sleep(800);

await record('inventaire', async () => {
  await stage('caption', '03', 'Tout votre parc, au même endroit', 'Recherche, états, fiches et localisation de chaque équipement.');
  await sleep(900);
  await click(page.getByPlaceholder('Rechercher un nom, un identifiant…'));
  await type('Dell', 120); await sleep(1300);
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await sleep(400);
  const select = page.locator('select').first();
  const point = await center(select); await move(point.x, point.y, 550); await sleep(200);
  await stage('ripple', point.x, point.y); await select.selectOption('MAINTENANCE'); await sleep(1500);
  await stage('ripple', point.x, point.y); await select.selectOption(''); await sleep(500);
  await click(page.getByRole('button', { name: /Portable Hugo/ }));
  await sleep(500);
  await stage('zoom', 'aside.asset-inspector', 1.35, 30); await sleep(2600);
  await stage('unzoom'); await sleep(1100);
  await stage('hideCaption'); await sleep(300);
});

await click(button('Espaces'), { ms: 500 });
await page.locator('canvas').first().waitFor({ timeout: 30000 });
await sleep(2200);

await record('exploration', async () => {
  await stage('caption', '04', 'Chaque équipement, dans son espace', 'Un clic sur un poste : la caméra s’approche et le matériel localisé apparaît.');
  await sleep(700);
  const canvas = await center(page.locator('canvas').first());
  await move(canvas.x, canvas.y + 20, 550);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -90); await sleep(90); }
  await sleep(700);
  await drag({ x: canvas.x - 130, y: canvas.y + 40 }, { x: canvas.x + 100, y: canvas.y + 20 }, 1800);
  await sleep(700);
  await click(page.locator('.workstation-strip button').first());
  await sleep(3200);
  await click(page.getByRole('button', { name: 'Recentrer la vue 3D' }));
  await sleep(1900);
  await stage('hideCaption'); await sleep(300);
});

await record('personnaliser', async () => {
  await stage('caption', '05', 'Composez vos lieux', 'Postes, mobilier à taille réelle, ambiances et couleurs, en 2D comme en 3D.');
  await sleep(600);
  await click(button('Modifier'));
  await sleep(350);
  await click(button('Catalogue'));
  await sleep(350);
  await click(button('Ajouter : Canapé'));
  await sleep(1000);
  await click(button('Plan 2D'));
  await sleep(600);
  const desk = page.locator('g[aria-label^="Sélectionner Poste 05"]').first();
  const from = await center(desk);
  await drag(from, { x: from.x + 70, y: from.y + 46 }, 1100);
  await sleep(600);
  await click(button('Plateau & couleurs'));
  await sleep(450);
  await click(page.getByRole('button', { name: /^Botanique/ }));
  await sleep(900);
  await click(button('Vue 3D'));
  await sleep(2500);
  await click(button('Terminer'));
  await sleep(500);
  await stage('hideCaption'); await sleep(300);
});

await record('etages', async () => {
  await stage('caption', '06', 'Tous vos étages, toutes vos salles', 'Passez d’une salle à l’autre, du rez-de-chaussée au 1er étage.');
  await sleep(600);
  await click(page.getByRole('button', { name: 'Ouvrir Salle de réunion, 1er étage' }));
  await sleep(2600);
  await click(page.getByRole('button', { name: 'Ouvrir Bureau technique, 1er étage' }));
  await sleep(2600);
  await stage('hideCaption'); await sleep(300);
});

await record('equipe', async () => {
  await stage('caption', '07', 'En équipe, sans rien écraser', 'Enregistrement explicite et versionné. Rôles administrateur, éditeur et lecteur.');
  await sleep(500);
  await stage('zoom', 'section.workspace-connection', 1.4, 40); await sleep(1300);
  await click(button('Enregistrer l’espace'));
  await page.getByText('Espace enregistré sur cette instance', { exact: true }).waitFor();
  await sleep(1800);
  await stage('unzoom'); await sleep(1100);
  await click(button('Compte de Camille Bernard'));
  await sleep(700);
  await click(button('Gérer l’équipe'));
  await sleep(3000);
  await page.keyboard.press('Escape');
  await sleep(600);
  await stage('hideCaption'); await sleep(300);
});

await record('fin', async () => {
  await stage('cursor', false);
  await stage('terminal', '08', 'Exploitation', 'Sauvegardez, restaurez, mettez à jour.',
    'Une commande pour chaque opération, vérifiée de bout en bout.', [
      { cmd: 'deploy/sureau.sh backup' },
      { out: 'Sauvegarde créée : backups/sureau-instance-20261025-180412.dump (15558 octets)', cls: 'ok' },
      { cmd: 'deploy/sureau.sh update' },
      { out: 'Sauvegarde avant mise à jour : backups/sureau-instance-avant-mise-a-jour-20261025-180431.dump', cls: 'dim' },
      { out: 'Mise à jour terminée.', cls: 'ok', delay: 800 },
    ]);
  await sleep(1200);
  await stage('fadeCardContent'); await sleep(550);
  await stage('outro');
  await sleep(5500);
});

writeFileSync(work + 'segments/segments.json', JSON.stringify(segments.map(({ name, dir, frames, end }) => ({ name, dir, end, frames })), null, 1));
console.log('erreurs de page :', errors);
await browser.close();
