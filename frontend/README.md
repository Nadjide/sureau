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

L’inventaire, l’éditeur et la gestion des espaces se chargent à leur ouverture. Chaque panneau propose un état de chargement et un réessai local en cas d’échec, sans quitter l’espace ni effacer les modifications en cours. Certains navigateurs conservent un échec d’import en cache : un rechargement manuel est alors proposé uniquement si l’espace est enregistré. L’historique de session et les saisies non appliquées ne sont pas repris après ce rechargement ; les changements limités à la session doivent être exportés auparavant.

Le catalogue propose tables de réunion, rangements, plantes, cloisons et canapés. Chaque ajout utilise des dimensions réelles et cherche une place libre parmi les postes et les meubles existants. Le décor initial est désormais représenté par des objets du plan ; les anciens documents sont convertis en mémoire en conservant leur implantation et leurs identifiants de postes. Un plan vide retire à la fois les postes et le mobilier.

En mode Modifier, Maj/Ctrl/⌘ + clic ajoute ou retire un objet de la sélection. Le bouton Sélection multiple propose la même action sans clavier. Le glissement d’un membre sélectionné déplace l’ensemble ; les limites et l’aimantation s’appliquent à un delta commun pour conserver les écarts, fauteuils compris. Les flèches 2D et celles du panneau déplacent aussi l’ensemble, en une étape d’historique.

L’onglet Espaces démarre avec un plateau de 13 × 9 m et huit postes. La vue 3D se charge uniquement à l’ouverture de cette vue ; cliquer sur un poste rapproche la caméra, et le bouton de recentrage revient à la vue générale. Une manipulation interrompt l’animation et le réglage système de réduction des mouvements est respecté. Le plan 2D et la liste des postes restent accessibles au clavier, y compris sans WebGL.

« Modifier » ouvre l’atelier : ajouter, dupliquer, renommer, pivoter ou supprimer les postes et régler leurs positions et dimensions. Le fauteuil est inclus dans les limites de placement ; les chevauchements sont signalés et restent modifiables. Le plateau est limité à 64 postes pour conserver une manipulation fluide. Les meubles et écrans représentés sont illustratifs. Aucun matériel n’y est placé automatiquement.

En mode Modifier, glisser directement un poste dans les vues 2D et 3D pour le déplacer. L’aimantation facultative utilise une grille de 25 cm. Échap ou une annulation du pointeur restaure le placement initial ; une manipulation terminée enregistre une seule modification. Le plan 2D permet aussi le déplacement avec les flèches du clavier (Maj accélère).

L’espace de travail local contient des étages et des salles, sous un format versionné limité à 8 étages et 32 salles. Un ancien plateau est repris en mémoire avec tous ses identifiants ; le nouveau document est enregistré à la première modification, sans effacer l’ancienne copie. Une donnée enregistrée illisible est préservée et les éditions restent alors limitées à la session. Les postes conservent leur identifiant pendant les modifications. Supprimer un poste conserve ses liens de matériel ; l’inventaire les signale comme « Poste absent du plan » et permet de les relocaliser.

« Gérer les espaces » crée une salle vide, renomme, copie ou supprime une salle. La navigation affiche chaque salle dans son étage. Une copie renouvelle les identifiants de tous ses objets ; les associations de matériel restent sur l’original. Le choix d’un poste dans l’inventaire et « Voir dans le plan » fonctionnent sur toutes les salles. L’import d’un plan renouvelle uniquement les identifiants déjà utilisés ailleurs dans l’espace.

Le panneau Étages permet de nommer l’espace de travail, ajouter et renommer des étages, changer leur ordre et organiser les salles. Une salle peut changer d’étage avec tous ses objets et localisations. Supprimer un étage occupé demande de choisir un autre étage pour y déplacer ses salles ; aucune implantation n’est effacée par cette opération. L’historique restaure toute l’organisation en une seule étape.

Dans l’éditeur d’objets, « Changer de salle » transfère un objet ou une sélection entière vers une zone libre d’une autre salle. Les écarts, identifiants et localisations sont conservés. Le déplacement est refusé intégralement si la destination manque de place ou dépasse ses limites ; Annuler restaure ensemble les salles de départ et d’arrivée.

L’onglet Sauvegarde de la gestion des espaces exporte et importe l’organisation complète : étages, salles, objets, dimensions et ambiances (2 Mo maximum). L’import affiche un aperçu et demande confirmation avant de remplacer l’espace ; une édition survenue pendant la lecture invalide cette confirmation. Les identifiants restent stables et le remplacement est annulable. Le fichier ne contient ni inventaire ni associations de matériel ; celles déjà enregistrées dans le navigateur restent conservées.

Dans l’atelier, « Plateau & couleurs » permet de renommer la pièce, choisir ses dimensions entre 6 et 50 m, appliquer une ambiance ou des couleurs libres et masquer murs ou décor. Les postes peuvent hériter de la couleur des bureaux ou utiliser leur propre couleur. Réduire la pièce demande validation lorsque des postes doivent être replacés.

Les boutons Annuler / Rétablir et les raccourcis Ctrl/⌘ Z, Ctrl/⌘ Maj Z ou Ctrl Y conservent les 50 dernières modifications du plan pendant la session. Un glissement correspond à une seule étape. Les champs de formulaire gardent leur propre annulation de saisie. L’historique ne modifie ni les liens de matériel ni les données de l’inventaire ; supprimer puis annuler restaure le même identifiant de poste.

« Fichiers » exporte et importe des plans JSON versionnés (256 ko maximum). Le document est validé intégralement avant remplacement, sans importer d’inventaire ni de localisations de matériel. Importer, partir d’un plateau vide ou reprendre l’exemple demande validation dans l’interface et reste annulable. Les liens de matériel existants suivent uniquement les identifiants conservés ; les autres restent récupérables depuis l’inventaire.

Au-delà de 16 postes, les repères sont numérotés et renvoient à la liste ; le poste sélectionné garde son nom. La 3D masque les étiquettes qui se recouvrent en donnant priorité à la sélection. Les noms complets et la sélection restent disponibles dans la liste accessible.

Pour localiser un équipement, sélectionner sa fiche dans Matériel puis choisir son poste. « Voir dans le plan » ouvre le poste correspondant. Une sélection de poste dans les vues 3D/2D donne accès aux équipements explicitement localisés à cet endroit.

Les localisations sont enregistrées uniquement dans le stockage de ce navigateur, séparément de l’inventaire serveur. Elles ne changent pas le statut métier du matériel. Les liens vers un équipement devenu introuvable restent conservés et signalés. Un refus ou une corruption du stockage produit un avertissement ; l’interface reste utilisable pour la session, sans prétendre enregistrer les changements.
