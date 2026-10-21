# Sentinel · Frontend

Interface de gestion du parc informatique, construite avec React, TypeScript strict et Vite.

## Développement

Prérequis : Node.js 22.12 ou supérieur et pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le frontend est indépendant du projet Java. Les commandes suivantes s’exécutent dans ce dossier :

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm preview
```

Les versions exactes des dépendances résolues sont conservées dans `pnpm-lock.yaml`.

## Inventaire

Le frontend consulte `GET /api/assets`. En développement, Vite relaie `/api` vers `http://127.0.0.1:8080`. Pour changer cette adresse, copier `.env.example` dans `.env.local` puis relancer Vite. Le backend doit être lancé séparément.

Une erreur de connexion est affichée explicitement ; aucun matériel fictif ne remplace les données réelles. La recherche et les filtres sont locaux, l’API renvoyant actuellement la liste complète.

Le proxy concerne uniquement le développement. Une installation en production doit router `/api` vers le service de matériel.

## Exploration spatiale

L’onglet Espaces affiche un plateau de 13 × 9 m avec huit postes illustratifs. La vue 3D se charge uniquement à l’ouverture de cette vue ; la caméra se manipule à la souris et le bouton de recentrage restaure le cadrage initial. Le plan 2D et la liste des postes restent accessibles au clavier, y compris sans WebGL.

Cette implantation est un exemple local. Les meubles et écrans représentés n’indiquent aucune localisation réelle ni affectation de matériel.
