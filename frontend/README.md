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
pnpm build
pnpm preview
```

Les versions exactes des dépendances résolues sont conservées dans `pnpm-lock.yaml`.
