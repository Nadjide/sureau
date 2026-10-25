// Jeu de démonstration fictif de la vidéo de présentation (et de démos locales).
// « Studio Lumen » est une entreprise imaginaire : aucune donnée réelle.
import { randomBytes } from 'node:crypto';

// Mot de passe aléatoire à chaque exécution : aucun identifiant fixe dans le dépôt.
const password = () => `Demo-${randomBytes(12).toString('base64url')}-7a`;

export const admin = { username: 'camille', displayName: 'Camille Bernard', password: process.env.DEMO_PASSWORD ?? password() };

export const team = [
  { username: 'hugo', displayName: 'Hugo Martin', password: password(), role: 'EDITOR' },
  { username: 'lea', displayName: 'Léa Dubois', password: password(), role: 'EDITOR' },
  { username: 'direction', displayName: 'Direction', password: password(), role: 'VIEWER' },
];

const asset = (tag, name, brand, model, category, status, serial, purchaseDate) =>
  ({ assetTag: tag, name, brand, model, category, status, serialNumber: serial, purchaseDate });

// La clé (desk) indique le poste où le matériel sera localisé, le cas échéant.
export const assets = [
  [asset('LUM-0101', 'Portable Camille', 'Apple', 'MacBook Pro 14 M3', 'COMPUTER', 'ASSIGNED', 'C02ZK4M1Q6L4', '2025-02-12'), 'desk-os-01'],
  [asset('LUM-0102', 'Portable Hugo', 'Dell', 'Latitude 7440', 'COMPUTER', 'ASSIGNED', 'DL7440-8H2K', '2024-09-03'), 'desk-os-02'],
  [asset('LUM-0103', 'Portable Léa', 'Lenovo', 'ThinkPad T14 Gen 5', 'COMPUTER', 'ASSIGNED', 'PF4XQ2L8', '2025-01-20'), 'desk-os-03'],
  [asset('LUM-0104', 'Portable Inès', 'Dell', 'Latitude 7440', 'COMPUTER', 'ASSIGNED', 'DL7440-9J3M', '2024-09-03'), 'desk-os-04'],
  [asset('LUM-0105', 'Portable Mathis', 'Lenovo', 'ThinkPad T14 Gen 5', 'COMPUTER', 'ASSIGNED', 'PF4XQ2M1', '2025-01-20'), 'desk-os-06'],
  [asset('LUM-0106', 'Portable Sarah', 'HP', 'EliteBook 840 G11', 'COMPUTER', 'ASSIGNED', '5CG4127QWX', '2025-04-08'), 'desk-os-07'],
  [asset('LUM-0107', 'Portable de prêt', 'Dell', 'Latitude 5450', 'COMPUTER', 'AVAILABLE', 'DL5450-1A7C', '2024-11-15'), null],
  [asset('LUM-0108', 'Portable Nathan', 'Dell', 'Latitude 7440', 'COMPUTER', 'MAINTENANCE', 'DL7440-2C9P', '2023-06-27'), null],
  [asset('LUM-0201', 'Écran poste 01', 'Dell', 'UltraSharp U2723QE', 'MONITOR', 'ASSIGNED', 'CN0W2723QE01', '2024-03-11'), 'desk-os-01'],
  [asset('LUM-0202', 'Écran poste 02', 'Dell', 'UltraSharp U2723QE', 'MONITOR', 'ASSIGNED', 'CN0W2723QE02', '2024-03-11'), 'desk-os-02'],
  [asset('LUM-0203', 'Écran poste 03', 'LG', '27UP850-W', 'MONITOR', 'ASSIGNED', 'LG27UP850A3', '2024-05-02'), 'desk-os-03'],
  [asset('LUM-0204', 'Écran poste 05', 'Dell', 'UltraSharp U2723QE', 'MONITOR', 'AVAILABLE', 'CN0W2723QE05', '2024-03-11'), 'desk-os-05'],
  [asset('LUM-0205', 'Écran accueil', 'Samsung', 'ViewFinity S6', 'MONITOR', 'ASSIGNED', 'SMS6A0091', '2023-10-19'), 'desk-accueil'],
  [asset('LUM-0206', 'Écran salle de réunion', 'Samsung', 'Smart Monitor M8 32"', 'MONITOR', 'ASSIGNED', 'SMM8R0412', '2024-01-08'), null],
  [asset('LUM-0301', 'Casque Hugo', 'Jabra', 'Evolve2 65', 'HEADSET', 'ASSIGNED', 'JB65-0142', '2024-09-10'), 'desk-os-02'],
  [asset('LUM-0302', 'Casque Léa', 'Jabra', 'Evolve2 65', 'HEADSET', 'ASSIGNED', 'JB65-0143', '2024-09-10'), 'desk-os-03'],
  [asset('LUM-0303', 'Casque de prêt', 'Poly', 'Voyager Focus 2', 'HEADSET', 'LOST', 'PVF2-7781', '2023-02-14'), null],
  [asset('LUM-0401', 'Téléphone accueil', 'Yealink', 'T54W', 'PHONE', 'ASSIGNED', 'YLT54W-3301', '2023-10-19'), 'desk-accueil'],
  [asset('LUM-0402', 'Mobile astreinte', 'Apple', 'iPhone 15', 'PHONE', 'AVAILABLE', 'F2LZK1Q8N7', '2024-10-01'), null],
  [asset('LUM-0501', 'Clavier Camille', 'Logitech', 'MX Keys S', 'KEYBOARD', 'ASSIGNED', 'LGMXKS-2210', '2025-02-12'), 'desk-os-01'],
  [asset('LUM-0601', 'Souris Camille', 'Logitech', 'MX Master 3S', 'MOUSE', 'ASSIGNED', 'LGMX3S-5531', '2025-02-12'), 'desk-os-01'],
  [asset('LUM-0701', 'Borne Wi-Fi open space', 'Ubiquiti', 'UniFi U7 Pro', 'NETWORK_EQUIPMENT', 'ASSIGNED', 'UBU7P-91A2', '2025-03-03'), null],
  [asset('LUM-0702', 'Commutateur principal', 'Cisco', 'Catalyst 1300-24P', 'NETWORK_EQUIPMENT', 'ASSIGNED', 'CSC1300-24P7', '2024-06-21'), 'desk-tech-01'],
  [asset('LUM-0801', 'Serveur de fichiers', 'Dell', 'PowerEdge T350', 'SERVER', 'ASSIGNED', 'DPET350-5KQ2', '2023-11-30'), 'desk-tech-02'],
  [asset('LUM-0901', 'Imprimante open space', 'HP', 'LaserJet Pro 4002dw', 'OTHER', 'MAINTENANCE', 'VNB3K40021', '2022-08-16'), null],
  [asset('LUM-0902', 'Vidéoprojecteur', 'Epson', 'EB-L210W', 'OTHER', 'RETIRED', 'EPL210W-0072', '2019-05-06'), null],
];

const station = (id, label, x, z, rotation = 0) => ({ id, label, position: [x, 0, z], rotation, width: 2, depth: 1, color: null });
const item = (id, kind, label, x, z, width, depth, height, color, rotation = 0) =>
  ({ id, kind, label, position: [x, 0, z], rotation, width, depth, height, color });
const plan = (id, name, width, depth, colors, workstations, furniture) =>
  ({ version: 1, id, name, width, depth, colors, display: { walls: true, decor: true }, workstations, furniture });

const palettes = {
  atelier: { floor: '#e6e7e5', wall: '#e4e8ed', desk: '#d4b38c', accent: '#447cde' },
  botanique: { floor: '#dce4d8', wall: '#c3d1be', desk: '#b98c62', accent: '#397761' },
  mineral: { floor: '#a6a9ad', wall: '#66717e', desk: '#755746', accent: '#bf8943' },
  terracotta: { floor: '#eddfcd', wall: '#cb9d88', desk: '#a57a58', accent: '#b05443' },
};

const openSpaceDesks = [];
['01', '02', '03', '04', '05'].forEach((n, i) => openSpaceDesks.push(station(`desk-os-${n}`, `Poste ${n}`, -5.6 + i * 2.8, -1.65)));
['06', '07', '08', '09', '10'].forEach((n, i) => openSpaceDesks.push(station(`desk-os-${n}`, `Poste ${n}`, -5.6 + i * 2.8, 1.65, Math.PI)));

export const workspace = {
  version: 1,
  id: 'workspace-local',
  name: 'Studio Lumen',
  floors: [{ id: 'floor-rdc', name: 'Rez-de-chaussée' }, { id: 'floor-etage-1', name: '1er étage' }],
  rooms: [
    { floorId: 'floor-rdc', plan: plan('plateau-a', 'Open space', 16, 11, palettes.atelier, openSpaceDesks, [
      item('furniture-os-plant-01', 'plant', 'Plante 01', -7.3, -4.9, 0.65, 0.65, 1.45, '#688458'),
      item('furniture-os-plant-02', 'plant', 'Plante 02', 7.3, -4.9, 0.65, 0.65, 1.45, '#688458'),
      item('furniture-os-plant-03', 'plant', 'Plante 03', -7.3, 4.9, 0.65, 0.65, 1.3, '#688458'),
      item('furniture-os-cabinet-01', 'cabinet', 'Rangement 01', -2.2, -5.0, 2.2, 0.7, 1.05, '#c3ccd4'),
      item('furniture-os-cabinet-02', 'cabinet', 'Rangement 02', 2.2, -5.0, 2.2, 0.7, 1.05, '#c3ccd4'),
      item('furniture-os-sofa', 'sofa', 'Coin café', 5.2, 4.6, 2, 0.85, 0.85, '#68809c', Math.PI),
      item('furniture-os-partition', 'partition', 'Cloison', 3.2, 4.4, 2, 0.12, 1.8, '#7d8ca0', Math.PI / 2),
    ]) },
    { floorId: 'floor-rdc', plan: plan('room-accueil', 'Accueil', 9, 7, palettes.terracotta, [station('desk-accueil', 'Accueil', 0, -1.6)], [
      item('furniture-accueil-sofa-01', 'sofa', 'Attente 01', -2.4, 2.6, 2, 0.85, 0.85, '#8e9b92', Math.PI),
      item('furniture-accueil-sofa-02', 'sofa', 'Attente 02', 2.4, 2.6, 2, 0.85, 0.85, '#8e9b92', Math.PI),
      item('furniture-accueil-plant-01', 'plant', 'Plante', -3.9, -2.9, 0.65, 0.65, 1.5, '#688458'),
      item('furniture-accueil-plant-02', 'plant', 'Plante', 3.9, -2.9, 0.65, 0.65, 1.5, '#688458'),
    ]) },
    { floorId: 'floor-etage-1', plan: plan('room-reunion', 'Salle de réunion', 10, 8, palettes.botanique, [], [
      item('furniture-reunion-table', 'table', 'Grande table', 0, 0, 3.6, 1.5, 0.75, '#b98c62'),
      item('furniture-reunion-plant-01', 'plant', 'Plante', -4.2, -3.3, 0.8, 0.8, 1.65, '#688458'),
      item('furniture-reunion-plant-02', 'plant', 'Plante', 4.2, -3.3, 0.8, 0.8, 1.65, '#688458'),
      item('furniture-reunion-sofa', 'sofa', 'Espace échange', 2.8, 3.1, 2, 0.85, 0.85, '#769083', Math.PI),
    ]) },
    { floorId: 'floor-etage-1', plan: plan('room-technique', 'Bureau technique', 11, 8, palettes.mineral,
      [station('desk-tech-01', 'Réseau', -2.8, -1.4), station('desk-tech-02', 'Serveurs', 0, -1.4), station('desk-tech-03', 'Support 01', 2.8, -1.4), station('desk-tech-04', 'Support 02', 0, 2.0, Math.PI)], [
      item('furniture-tech-cabinet-01', 'cabinet', 'Baie', -4.3, 3.2, 1.2, 0.8, 1.9, '#3f4650', Math.PI / 2),
      item('furniture-tech-cabinet-02', 'cabinet', 'Stock', 4.2, 3.2, 1.6, 0.7, 1.05, '#c3ccd4', Math.PI / 2),
      item('furniture-tech-plant', 'plant', 'Plante', 4.9, -3.4, 0.65, 0.65, 1.3, '#688458'),
    ]) },
  ],
};

// Client HTTP minimal avec gestion du cookie de session et du jeton CSRF.
export function client(origin) {
  let cookie = '';
  async function call(method, path, body, form) {
    const headers = {};
    if (method !== 'GET') {
      const csrf = await call('GET', '/api/auth/csrf');
      headers[csrf.headerName] = csrf.token;
    }
    headers.Cookie = cookie;
    let payload;
    if (form) { headers['Content-Type'] = 'application/x-www-form-urlencoded'; payload = new URLSearchParams(form).toString(); }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    const response = await fetch(origin + path, { method, headers, body: payload, redirect: 'manual' });
    for (const set of response.headers.getSetCookie()) {
      const [pair] = set.split(';');
      const [name] = pair.split('=');
      cookie = [...cookie.split('; ').filter((c) => c && !c.startsWith(name + '=')), pair].join('; ');
    }
    const text = await response.text();
    if (response.status >= 400) throw new Error(`${method} ${path} -> ${response.status} ${text.slice(0, 200)}`);
    return text ? JSON.parse(text) : null;
  }
  return { call, cookie: () => cookie };
}

export async function seed(origin, { setupToken } = {}) {
  const api = client(origin);
  const status = await api.call('GET', '/api/auth/status');
  if (status.setupRequired) {
    if (!setupToken) throw new Error('Instance neuve : clé d’installation requise.');
    await api.call('POST', '/api/auth/setup', { setupToken, ...admin });
  }
  await api.call('POST', '/api/auth/login', undefined, { username: admin.username, password: admin.password });
  const existing = await api.call('GET', '/api/users');
  for (const member of team) if (!existing.some((user) => user.username === member.username)) await api.call('POST', '/api/users', member);
  const locations = {};
  const current = await api.call('GET', '/api/assets');
  for (const [data, desk] of assets) {
    const created = current.find((a) => a.assetTag === data.assetTag) ?? await api.call('POST', '/api/assets', data);
    if (desk) locations[created.id] = desk;
  }
  let revision = 0;
  try { revision = (await api.call('GET', '/api/workspace')).revision; } catch { /* aucun espace enregistré */ }
  const saved = await api.call('PUT', '/api/workspace', { expectedRevision: revision, workspace, locations });
  return { revision: saved.revision, assets: (await api.call('GET', '/api/assets')).length, locations: Object.keys(locations).length };
}

if (process.argv[1] && process.argv[1].endsWith('demo-data.mjs')) {
  const [origin, setupToken] = process.argv.slice(2);
  console.log(await seed(origin, { setupToken }));
  console.log(`Connexion : ${admin.username} / ${admin.password}`);
}
