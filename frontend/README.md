# Sureau · Frontend

Interface de gestion du parc informatique, construite avec React, TypeScript strict et Vite.

[Présentation et captures du projet](../README.md) · [Développement](#développement) · [Inventaire](#inventaire) · [Exploration spatiale](#exploration-spatiale)

## Développement

Prérequis : Node.js 22.12 ou supérieur et pnpm 12.14.0.

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Le frontend se compile sans le projet Java, mais l’interface exige une API Sureau et une connexion (voir ci-dessous). Les commandes suivantes s’exécutent dans ce dossier :

```sh
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test
pnpm build
pnpm preview
```

Le code est mis en forme par Prettier (`.prettierrc.json`) : `pnpm format` l’applique, `pnpm format:check` le vérifie, comme la CI.

Les versions exactes des dépendances résolues sont conservées dans `pnpm-lock.yaml`.

## Connexion et comptes

Toute l’interface est derrière une session. Sur une instance neuve, la première page crée le compte administrateur avec la clé d’installation (`SUREAU_SETUP_TOKEN`) ; ensuite, elle propose la connexion. Le rôle du compte (administrateur, éditeur ou lecteur) active ou désactive les actions d’écriture : un lecteur consulte et exporte, un éditeur modifie l’inventaire et l’espace, un administrateur gère aussi l’équipe depuis le menu du compte. Chacun peut y changer son mot de passe.

Le bouton « Guide » de l’en-tête ouvre une visite en sept étapes (espaces, matériel, placement, affectation, équipe, données), adaptée au rôle du compte : un lecteur y voit quelles actions demandent d’autres droits. À la première visite dans un navigateur, une invitation discrète la propose, jusqu’à ce qu’elle soit suivie ou masquée.

Une session expirée ne fait pas perdre le travail : le brouillon de l’atelier, l’historique et les champs saisis restent à l’écran pendant la reconnexion, et aucune action n’est rejouée automatiquement. Un résultat incertain (réponse perdue, erreur réseau) est signalé et demande une vérification explicite avant toute nouvelle tentative.

## Langues

L’interface est écrite en français ; `src/lib/i18n-en.ts` en donne la traduction anglaise, indexée par le texte français lui-même. Un texte affiché passe par `t('…')`, avec des valeurs nommées (`t('Salles de {floor}', { floor })`) plutôt qu’une concaténation, et `plural(nombre, 'un', 'plusieurs')` pour l’accord. Un libellé défini hors d’un composant (catégories, rôles, contenu du guide) est marqué par `msg('…')` et traduit par `t()` là où il s’affiche, pour suivre un changement de langue. Quand les mêmes mots français demandent deux traductions, la clé porte un contexte invisible : `t('Annuler|défaire')` affiche « Annuler » en français et « Undo » en anglais.

La langue choisie est lue au premier usage, jamais à l’import d’un module. Les noms de l’exemple (salle, postes, mobilier) sont écrits dans la langue active au moment où l’exemple est créé ; ils deviennent ensuite des données de l’équipe. L’import CSV accepte les en-têtes, catégories et états dans l’une ou l’autre langue. Le test `i18n.test.ts` vérifie que chaque texte marqué a sa traduction, avec les mêmes valeurs à insérer, et qu’aucune traduction n’est orpheline.

## Inventaire

Le frontend consulte et modifie les matériels via `/api/assets`. En développement, Vite relaie `/api` vers `http://127.0.0.1:8080`. Pour changer cette adresse, copier `.env.example` dans `.env.local` puis relancer Vite. Le backend doit être lancé séparément.

Un éditeur peut ajouter un matériel, modifier sa fiche et le retirer du parc, après confirmation. Chaque modification porte le numéro de version connu : si la fiche a changé entre-temps, l’enregistrement est suspendu, la saisie reste affichée et la fiche du serveur se recharge à la demande.

Une erreur de connexion est affichée explicitement ; aucun matériel fictif ne remplace les données réelles. La recherche et les filtres sont locaux, l’API renvoyant la liste complète.

Le proxy concerne uniquement le développement. En production, l’interface compilée est servie par l’API sur la même origine (voir le [guide d’installation](../docs/installation.md)).

## Exploration spatiale

L’inventaire, l’éditeur et la gestion des espaces se chargent à leur ouverture. Chaque panneau propose un état de chargement et un réessai local en cas d’échec, sans quitter l’espace ni effacer les modifications en cours. Certains navigateurs conservent un échec d’import en cache : un rechargement manuel est alors proposé uniquement si l’espace est enregistré. L’historique de session et les saisies non appliquées ne sont pas repris après ce rechargement ; les changements limités à la session doivent être exportés auparavant.

Le catalogue propose tables de réunion, rangements, plantes, cloisons et canapés. Chaque ajout utilise des dimensions réelles et cherche une place libre parmi les postes et les meubles existants. Le décor initial est désormais représenté par des objets du plan ; les anciens documents sont convertis en mémoire en conservant leur implantation et leurs identifiants de postes. Un plan vide retire à la fois les postes et le mobilier.

En mode Modifier, Maj/Ctrl/⌘ + clic ajoute ou retire un objet de la sélection. Le bouton Sélection multiple propose la même action sans clavier. Le glissement d’un membre sélectionné déplace l’ensemble ; les limites et l’aimantation s’appliquent à un delta commun pour conserver les écarts, fauteuils compris. Les flèches 2D et celles du panneau déplacent aussi l’ensemble, en une étape d’historique.

Tant qu’aucun espace n’a été enregistré sur l’instance, l’onglet Espaces ne fabrique aucun plan : il propose de préparer un espace vide ou l’exemple (un plateau de 13 × 9 m et huit postes) comme brouillon, sans rien enregistrer. La vue 3D se charge uniquement à l’ouverture de cette vue ; cliquer sur un poste rapproche la caméra, et le bouton de recentrage revient à la vue générale. Une manipulation interrompt l’animation et le réglage système de réduction des mouvements est respecté. Le plan 2D et la liste des postes restent accessibles au clavier, y compris sans WebGL.

« Modifier » ouvre l’atelier : ajouter, dupliquer, renommer, pivoter ou supprimer les postes et régler leurs positions et dimensions. Le fauteuil est inclus dans les limites de placement ; les chevauchements sont signalés et restent modifiables. Le plateau est limité à 64 postes pour conserver une manipulation fluide. Les meubles et écrans représentés sont illustratifs. Aucun matériel n’y est placé automatiquement.

En mode Modifier, glisser directement un poste dans les vues 2D et 3D pour le déplacer. L’aimantation facultative utilise une grille de 25 cm. Échap ou une annulation du pointeur restaure le placement initial ; une manipulation terminée enregistre une seule modification. Le plan 2D permet aussi le déplacement avec les flèches du clavier (Maj accélère).

L’espace de travail contient des étages et des salles, sous un format versionné limité à 8 étages et 32 salles. Il est **partagé par toute l’instance** : les modifications restent un brouillon tant que « Enregistrer l’espace » n’a pas été utilisé, puis les salles et les localisations sont envoyées ensemble, de façon atomique, avec le numéro de version connu. Le serveur répond avant que l’interface n’affiche « Espace enregistré sur cette instance » ; aucune synchronisation en temps réel n’existe. Si quelqu’un a enregistré entre-temps, la barre d’enregistrement annonce « Une autre version est disponible » et bloque l’envoi : le brouillon, l’historique et la version connue sont conservés, « Exporter le brouillon » en garde une copie, et « Recharger » ne remplace le travail par la version du serveur qu’après confirmation. Les postes conservent leur identifiant pendant les modifications.

Les plans créés avant l’espace partagé restent dans le stockage du navigateur. Le panneau « Retrouver vos anciens plans » les recherche uniquement à la demande, présente un aperçu et les copie dans le brouillon, avec ou sans leurs anciennes localisations ; les données d’origine ne sont ni modifiées ni supprimées, et rien n’est partagé avant l’enregistrement. Un ancien plateau est repris avec tous ses identifiants. Supprimer un poste conserve ses liens de matériel ; l’inventaire les signale comme « Poste absent du plan » et permet de les relocaliser.

« Gérer les espaces » crée une salle vide, renomme, copie ou supprime une salle. La navigation affiche chaque salle dans son étage. Une copie renouvelle les identifiants de tous ses objets ; les associations de matériel restent sur l’original. Le choix d’un poste dans l’inventaire et « Voir dans le plan » fonctionnent sur toutes les salles. L’import d’un plan renouvelle uniquement les identifiants déjà utilisés ailleurs dans l’espace.

Le panneau Étages permet de nommer l’espace de travail, ajouter et renommer des étages, changer leur ordre et organiser les salles. Une salle peut changer d’étage avec tous ses objets et localisations. Supprimer un étage occupé demande de choisir un autre étage pour y déplacer ses salles ; aucune implantation n’est effacée par cette opération. L’historique restaure toute l’organisation en une seule étape.

Dans l’éditeur d’objets, « Changer de salle » transfère un objet ou une sélection entière vers une zone libre d’une autre salle. Les écarts, identifiants et localisations sont conservés. Le déplacement est refusé intégralement si la destination manque de place ou dépasse ses limites ; Annuler restaure ensemble les salles de départ et d’arrivée.

L’onglet Sauvegarde de la gestion des espaces exporte et importe l’espace complet au format `sureau-spatial` : étages, salles, objets, dimensions, ambiances et localisations de matériel (8 Mo maximum). L’import affiche un aperçu et demande confirmation avant de remplacer le brouillon ; une édition survenue pendant la lecture invalide cette confirmation. Par défaut, les localisations actuelles sont conservées : celles du fichier ne sont appliquées que si l’option « fichier provenant de cette instance » est cochée, car les identifiants de matériel sont propres à chaque instance. Le remplacement prépare le brouillon, reste annulable et ne partage rien avant l’enregistrement. L’inventaire et les comptes ne sont pas inclus : ils restent dans la base de l’instance, qui se sauvegarde avec `deploy/sureau.sh backup` (voir le [guide d’exploitation](../docs/exploitation.md)).

Dans l’atelier, « Plateau & couleurs » permet de renommer la pièce, choisir ses dimensions entre 6 et 50 m, appliquer une ambiance ou des couleurs libres et masquer murs ou décor. Les postes peuvent hériter de la couleur des bureaux ou utiliser leur propre couleur. Réduire la pièce demande validation lorsque des postes ou des meubles doivent être replacés.

Les boutons Annuler / Rétablir et les raccourcis Ctrl/⌘ Z, Ctrl/⌘ Maj Z ou Ctrl Y conservent les 50 dernières modifications du plan pendant la session. Un glissement correspond à une seule étape. Les champs de formulaire gardent leur propre annulation de saisie. L’historique ne modifie ni les liens de matériel ni les données de l’inventaire ; supprimer puis annuler restaure le même identifiant de poste.

« Fichiers » exporte et importe des plans JSON versionnés (256 ko maximum). Le document est validé intégralement avant remplacement, sans importer d’inventaire ni de localisations de matériel. Importer, partir d’un plateau vide ou reprendre l’exemple demande validation dans l’interface et reste annulable. Les liens de matériel existants suivent uniquement les identifiants conservés ; les autres restent récupérables depuis l’inventaire.

Au-delà de 16 objets (postes et meubles), les repères sont numérotés et renvoient à la liste ; l’objet sélectionné garde son nom. La 3D masque les étiquettes qui se recouvrent en donnant priorité à la sélection. Les noms complets et la sélection restent disponibles dans la liste accessible.

Pour localiser un équipement, sélectionner sa fiche dans Matériel puis choisir son poste. « Voir dans le plan » ouvre le poste correspondant. Une sélection de poste dans les vues 3D/2D donne accès aux équipements explicitement localisés à cet endroit.

Les localisations font partie de l’espace partagé : elles s’enregistrent avec les salles, par identifiant stable du matériel, et suivent l’espace même si la liste de l’inventaire est réordonnée. Elles ne changent pas le statut métier du matériel. Les liens vers un équipement devenu introuvable restent conservés et signalés. Un échec de l’API n’est jamais présenté comme un enregistrement réussi, ni comme un espace ou un inventaire vide : l’erreur est affichée, le brouillon est conservé et l’inventaire reste consultable.
