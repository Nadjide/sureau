<p align="center">
  <img src="frontend/public/sureau.svg" alt="Logo Sureau" width="56" height="62" />
</p>

<h1 align="center">Sureau</h1>

<p align="center">
  <strong>Le matériel, dans son espace.</strong><br />
  Un parc informatique à explorer. Des espaces de travail à composer.
</p>

<p align="center">
  <a href="#présentation-vidéo">Vidéo</a> ·
  <a href="#aperçu">Aperçu</a> ·
  <a href="#fonctionnalités">Fonctionnalités</a> ·
  <a href="#démarrage-rapide">Démarrage rapide</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="frontend/README.md">Guide frontend</a>
</p>

Sureau associe un inventaire de matériel à un atelier spatial en **2D et 3D**. L’objectif : retrouver les équipements dans leur environnement et donner à chaque équipe les outils pour dessiner ses salles, organiser ses postes et personnaliser son plateau.

Le projet est en cours de refonte : une API **Java / Spring Boot** gère les matériels, et une interface **React / TypeScript** propose l’exploration du parc et l’aménagement des espaces. Les plans et les associations spatiales sont actuellement conservés dans le navigateur.

## Présentation vidéo

[![Ouvrir la présentation de Sureau : atelier 3D, personnalisation, mobilier, salles et étages](frontend/docs/images/sureau-presentation.jpg)](https://github.com/Nadjide/sureau/blob/main/frontend/docs/videos/sureau-presentation.mp4 "Ouvrir la présentation de Sureau sur GitHub")

**[▶ Ouvrir la vidéo](https://github.com/Nadjide/sureau/blob/main/frontend/docs/videos/sureau-presentation.mp4)** · 1 min 37 s · Full HD (1080p) · 30 images/s · MP4, 8,4 Mo

Une démonstration enregistrée dans l’application : exploration et zoom 3D, ajout de mobilier, ambiances, sélection multiple en 2D, création de salles et d’étages. L’implantation présentée est locale et illustrative.

## Aperçu

![Atelier Sureau en 3D, avec postes de travail, navigation entre les étages et catalogue de mobilier](frontend/docs/images/atelier-3d.jpg)

*Un atelier manipulable : sélectionner un poste rapproche la caméra ; le mode édition permet de déplacer les objets et d’ajouter du mobilier à sa taille réelle.*

<details>
  <summary><strong>Voir le plan 2D et la sélection multiple</strong></summary>

![Plan 2D de Sureau avec plusieurs postes sélectionnés et des actions de groupe](frontend/docs/images/plan-2d.jpg)

Le plan 2D et les listes d’objets offrent aussi une navigation au clavier. Une sélection peut être déplacée, pivotée, dupliquée ou transférée vers une autre salle.

</details>

<details>
  <summary><strong>Voir l’organisation des salles et des étages</strong></summary>

![Gestion des étages de Sureau, avec les salles rattachées à chaque niveau](frontend/docs/images/organisation-espaces.jpg)

Les salles peuvent être créées, copiées, renommées et déplacées entre les étages. L’organisation complète est exportable dans un fichier JSON.

</details>

*Captures réalisées dans l’application avec une implantation locale illustrative.*

## Fonctionnalités

| Parcourir | Composer |
| --- | --- |
| Inventaire connecté à l’API, recherche et filtres par état | Ajout, déplacement, rotation, copie et suppression des postes |
| Fiches du matériel et localisations explicites sur les postes | Tables, rangements, plantes, cloisons et canapés |
| Vue 3D avec rapprochement animé et recentrage | Sélection multiple et actions sur un groupe d’objets |
| Plan 2D et listes accessibles au clavier | Dimensions, couleurs et ambiances personnalisables |
| Navigation entre les salles et les étages | Transfert d’objets entre salles et organisation des étages |
| États de chargement et erreurs de connexion visibles | Annuler / rétablir et import / export des plans et espaces |

Les vues 2D et 3D partagent le même plan. L’aimantation à une grille de 25 cm facilite les déplacements ; les limites du plateau prennent en compte les fauteuils et les dimensions du mobilier. Les animations respectent la préférence système de réduction des mouvements.

## Démarrage rapide

**Prérequis :** Node.js **22.12 ou supérieur** et pnpm **12.14.0**.

```sh
git clone https://github.com/Nadjide/sureau.git
cd sureau/frontend
pnpm install --frozen-lockfile
pnpm dev
```

Ouvrir l’adresse affichée par Vite, généralement **http://127.0.0.1:5173**.

L’atelier spatial est utilisable sans connexion à l’API. Pour consulter les matériels, un service compatible doit être disponible : le proxy de développement relaie `/api` vers **http://127.0.0.1:8080** par défaut. Pour choisir une autre adresse, copier `frontend/.env.example` dans `frontend/.env.local` et adapter `SUREAU_API_TARGET` avant de relancer Vite.

Une API indisponible produit un message explicite. L’interface conserve l’accès à l’espace local et ne remplace pas l’inventaire par des matériels fictifs.

<details>
  <summary><strong>Lancer également l’API Java</strong></summary>

Le module serveur nécessite **Java 21** et une base **PostgreSQL** disponible. Le [fichier Compose](docker-compose.yml) configure une base locale avec les valeurs par défaut `sureau` pour la base et l’utilisateur, et le volume physique `sureau_postgres_data`.

Pour réutiliser une base existante, renseigner son volume physique dans `SUREAU_POSTGRES_VOLUME` et conserver ses valeurs dans `DB_NAME`, `DB_USERNAME` et `DB_PASSWORD` pour Compose. Fournir aussi `DB_URL` au processus Java si le nom de base diffère de la valeur par défaut. Le renommage des fichiers ne migre pas les données : sans ces paramètres, un prochain démarrage utilise le nouveau volume. Les variables `POSTGRES_*` initialisent seulement un volume neuf et ne renomment pas une base déjà présente.

Adapter les paramètres de connexion de la [configuration du backend](backend/src/main/resources/application.properties), puis lancer le wrapper Maven depuis `backend/` :

```sh
./mvnw spring-boot:run
```

Sous Windows, utiliser `./mvnw.cmd spring-boot:run`. L’API écoute sur le port **8080** dans la configuration actuelle. Les migrations de schéma sont gérées par Flyway à partir de [`db/migration`](backend/src/main/resources/db/migration).

</details>

## Stack

| Partie | Technologies |
| --- | --- |
| Interface | React 19 · TypeScript strict · Vite 8 |
| Composants et styles | shadcn/ui · Radix UI · Tailwind CSS 4 · Lucide |
| Scène 3D | Three.js · React Three Fiber · Drei |
| Validation et qualité | Zod · Vitest · Oxlint |
| API | Java 21 · Spring Boot 4 · Spring Web MVC |
| Persistance serveur | PostgreSQL · Spring Data JPA · Flyway |
| Outils | pnpm · Maven |

Les versions résolues du frontend sont conservées dans le [lockfile pnpm](frontend/pnpm-lock.yaml). L’inventaire, l’éditeur, la gestion des espaces et la scène 3D sont chargés à leur ouverture.

## Données et sauvegarde

| Donnée | Source et conservation actuelles |
| --- | --- |
| Matériels et statuts métier | API REST et base PostgreSQL |
| Étages, salles, postes, mobilier et ambiances | Stockage local du navigateur |
| Association entre un matériel et un poste | Stockage local, à partir des identifiants du matériel et du poste |
| Historique d’édition | 50 dernières modifications pendant la session |
| Sauvegarde de l’espace | Fichier JSON : organisation et plans, sans inventaire ni associations de matériel |

Placer un équipement sur un poste ne change pas son statut métier. Les objets dessinés dans la scène sont du mobilier illustratif ; un équipement n’y est localisé qu’après une association explicite.

Les sauvegardes créées avant le changement de nom sont récupérées automatiquement sur la même origine navigateur. Les nouvelles écritures utilisent les clés Sureau et conservent les anciens contenus. Pour changer de domaine ou de navigateur, exporter puis importer l’espace en JSON.

Les plans ne sont pas encore synchronisés entre navigateurs ou utilisateurs. L’import / export permet de conserver ou de transférer une implantation ; l’interface signale les échecs de stockage. Un espace peut contenir jusqu’à **8 étages et 32 salles**, avec **64 postes et 64 meubles par salle**.

## Architecture

```text
sureau/
├── frontend/
│   ├── docs/                  # Captures et vidéo de présentation
│   ├── public/               # Identité visuelle
│   └── src/
│       ├── components/       # Navigation et composants d’interface
│       └── features/
│           ├── inventory/    # API, validation et fiches matériel
│           └── spatial/      # Plans, édition, scène 3D et espaces
└── backend/
    └── src/main/
        ├── java/             # Contrôleurs, services et persistance
        └── resources/        # Configuration et migrations
```

### Contrat matériel

L’API présente dans le dépôt expose les opérations suivantes. L’interface d’inventaire utilise actuellement la liste des matériels.

| Méthode | Route | Opération |
| --- | --- | --- |
| `GET` | `/api/assets` | Lister les matériels |
| `GET` | `/api/assets/{id}` | Consulter un matériel |
| `POST` | `/api/assets` | Créer un matériel |
| `PUT` | `/api/assets/{id}` | Modifier un matériel |
| `PATCH` | `/api/assets/{id}/retire` | Retirer un matériel du parc |

La liste renvoie un tableau JSON. Les plans et leurs localisations utilisent pour l’instant le stockage local ; ils ne disposent pas d’endpoints de persistance dans cette API.

## Vérifications frontend

Depuis `frontend/` :

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Les tests couvrent notamment la validation des réponses de l’API, les erreurs de stockage, la géométrie, la sélection multiple, les transferts entre salles et les imports. `pnpm preview` permet ensuite de consulter le build de production.

Pour les réglages et le comportement détaillé de l’atelier, consulter le [guide frontend](frontend/README.md).

---

Développé par [Nadjide Omar](https://github.com/Nadjide).
