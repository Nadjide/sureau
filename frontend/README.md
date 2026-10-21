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

L’onglet Espaces démarre avec un plateau de 13 × 9 m et huit postes. La vue 3D se charge uniquement à l’ouverture de cette vue ; cliquer sur un poste rapproche la caméra, et le bouton de recentrage revient à la vue générale. Une manipulation interrompt l’animation et le réglage système de réduction des mouvements est respecté. Le plan 2D et la liste des postes restent accessibles au clavier, y compris sans WebGL.

« Modifier » ouvre l’atelier : ajouter, dupliquer, renommer, pivoter ou supprimer les postes et régler leurs positions et dimensions. Le fauteuil est inclus dans les limites de placement ; les chevauchements sont signalés et restent modifiables. Le plateau est limité à 64 postes pour conserver une manipulation fluide. Les meubles et écrans représentés sont illustratifs. Aucun matériel n’y est placé automatiquement.

Le plan est sauvegardé localement sous un format versionné. Les postes conservent leur identifiant pendant les modifications. Supprimer un poste conserve ses liens de matériel ; l’inventaire les signale comme « Poste absent du plan » et permet de les relocaliser.

Pour localiser un équipement, sélectionner sa fiche dans Matériel puis choisir son poste. « Voir dans le plan » ouvre le poste correspondant. Une sélection de poste dans les vues 3D/2D donne accès aux équipements explicitement localisés à cet endroit.

Les localisations sont enregistrées uniquement dans le stockage de ce navigateur, séparément de l’inventaire serveur. Elles ne changent pas le statut métier du matériel. Les liens vers un équipement devenu introuvable restent conservés et signalés. Un refus ou une corruption du stockage produit un avertissement ; l’interface reste utilisable pour la session, sans prétendre enregistrer les changements.
