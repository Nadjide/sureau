# Installer une instance Sureau

Ce guide installe **une instance** : l’application (interface et API) et sa base PostgreSQL, sur une machine que vous contrôlez. Pour Kubernetes, voir [le guide dédié](../deploy/kubernetes/README.md). Pour sauvegarder, restaurer ou mettre à jour ensuite, voir [l’exploitation](exploitation.md).

## Prérequis

- **Docker avec Compose v2** (Docker Desktop sous Windows et macOS, Docker Engine sous Linux). Ni Java ni Node ne sont à installer.
- Prévoyez environ 2 Go de mémoire disponibles pour l’application et sa base, et quelques Go de disque pour l’image et les données.
- Git, pour récupérer les sources. La première installation construit l’image à partir de ces sources.
- Sous Windows : PowerShell 5.1 ou plus récent. Le raccourci `deploy\sureau.cmd` lance le script sans modifier la politique d’exécution de la machine.

## Installer

Depuis la racine du dépôt, sous Linux, macOS ou WSL :

```sh
deploy/sureau.sh init
deploy/sureau.sh up
```

Sous Windows :

```bat
deploy\sureau.cmd init
deploy\sureau.cmd up
```

`init` crée `.env.instance` à la racine du dépôt à partir de [`deploy/instance.env.example`](../deploy/instance.env.example), avec :

- un mot de passe de base de données aléatoire, qui n’est jamais affiché ;
- une **clé d’installation** aléatoire, affichée une seule fois : elle sert à créer le premier administrateur ;
- le port local `8080`, modifiable avec `init --port 9000`.

Le fichier est réservé à son propriétaire et **n’est jamais écrasé** : relancer `init` sur une instance existante ne change rien. Il contient les secrets de l’instance ; il est ignoré par Git et ne doit pas être publié.

`up` construit l’image, démarre PostgreSQL et l’application, attend que leurs sondes de santé soient positives, puis affiche l’adresse. La première fois, comptez plusieurs minutes.

## Créer le premier administrateur

Ouvrez l’adresse affichée (par défaut **http://127.0.0.1:8080**). Tant qu’aucun compte n’existe, l’interface propose de créer l’espace administrateur : saisissez la clé d’installation, un nom, un identifiant et un mot de passe de 12 à 64 caractères.

La clé n’est plus acceptée une fois ce compte créé. Si vous l’avez perdue avant, elle figure dans la ligne `SUREAU_SETUP_TOKEN` de `.env.instance`.

Invitez ensuite votre équipe depuis **Gérer l’équipe**, dans le menu du compte : administrateur, éditeur ou lecteur (voir [les droits](../README.md#comptes-et-droits)). Prévoyez au moins deux administrateurs.

## Exposer l’instance en HTTPS

Par défaut, l’application n’écoute que sur la machine locale (`127.0.0.1`). Pour l’ouvrir à votre équipe, placez devant elle un **proxy inverse HTTPS** (Caddy, nginx, Traefik ou celui de votre hébergeur) qui relaie vers `127.0.0.1:8080`, puis :

1. Dans `.env.instance`, passez `SUREAU_COOKIE_SECURE=true`. Le cookie de session n’est alors plus jamais envoyé en clair. Les navigateurs l’acceptent aussi sur `localhost`.
2. Appliquez le changement : `deploy/sureau.sh up`.

Le proxy doit transmettre les en-têtes `X-Forwarded-Proto` et `X-Forwarded-For`. Caddy et Traefik le font par défaut ; avec nginx, ajoutez par exemple `proxy_set_header X-Forwarded-Proto $scheme;` et `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`. Sureau sait alors que la connexion est chiffrée : il envoie l’en-tête HSTS, qui impose HTTPS aux navigateurs. Il connaît aussi l’adresse réelle de chaque client, utilisée pour limiter les tentatives de connexion. Ces en-têtes ne sont pris en compte que s’ils viennent d’une adresse privée, comme celle d’un proxy sur la même machine ou le même réseau.

L’application envoie aussi une politique de sécurité du contenu (CSP) stricte : aucun script en ligne ni externe, aucune intégration dans un cadre (`frame`) d’un autre site. Si votre proxy ajoute ses propres en-têtes de sécurité, évitez d’en envoyer une seconde version contradictoire.

Sureau se sert à la **racine d’un domaine ou d’un sous-domaine** (`https://sureau.exemple.org/`), pas sous un sous-chemin. Exemple de configuration Caddy, à adapter à votre environnement :

```text
sureau.exemple.org {
    reverse_proxy 127.0.0.1:8080
}
```

Ne publiez pas le port de l’application directement sur Internet sans HTTPS. La base PostgreSQL n’est jamais exposée : elle ne publie aucun port et reste sur un réseau interne.

> Cet exemple de proxy n’a pas été testé dans le cadre du projet ; seule l’application sur `127.0.0.1` l’a été.

## Configuration

Les réglages sont dans `.env.instance` (modèle : [`deploy/instance.env.example`](../deploy/instance.env.example)). Après une modification, relancez `up`.

| Variable | Rôle | Défaut |
| --- | --- | --- |
| `SUREAU_DB_PASSWORD` | Mot de passe de la base de l’instance. Obligatoire. | généré par `init` |
| `SUREAU_SETUP_TOKEN` | Clé du premier administrateur. Obligatoire. | généré par `init` |
| `SUREAU_HTTP_BIND` | Adresse d’écoute de l’application | `127.0.0.1` |
| `SUREAU_HTTP_PORT` | Port d’écoute de l’application | `8080` |
| `SUREAU_COOKIE_SECURE` | `true` dès que l’instance est servie en HTTPS | `false` |
| `SUREAU_COOKIE_NAME` | Nom du cookie de session : lettres, chiffres, `_` et `-` | `SUREAU_SESSION_<port>` |
| `SUREAU_IMAGE` | Image de l’application : `sureau:local` (construite sur place) ou une image publiée | `sureau:local` |
| `SUREAU_OIDC_ISSUER`, `SUREAU_OIDC_CLIENT_ID`, `SUREAU_OIDC_CLIENT_SECRET`, `SUREAU_OIDC_NAME` | Connexion d’entreprise, facultative (voir ci-dessous) | désactivée |

**Changer le mot de passe de la base** après l’installation ne se fait pas en modifiant seulement le fichier : PostgreSQL a enregistré l’ancien lors de la création du volume. Cette opération n’est pas couverte par ce guide.

### Utiliser une image publiée

Pour installer sans les sources, indiquez dans `.env.instance` une image publiée, de préférence avec sa version précise, par exemple `SUREAU_IMAGE=ghcr.io/<propriétaire>/sureau:<version>`, puis lancez `up`. L’image est alors téléchargée au lieu d’être construite. Un registre privé demande d’abord `docker login`. Seul le fichier [`docker-compose.install.yml`](../docker-compose.install.yml) et les scripts de [`deploy/`](../deploy) sont alors nécessaires.

Le dépôt contient le workflow qui publie les images lors d’un tag de version, mais **aucune version publiée n’est annoncée** à ce stade : tant que ce n’est pas le cas, installez en construisant l’image.

### Connexion d’entreprise (SSO)

Sureau peut confier la connexion à votre fournisseur d’identité OpenID Connect : Microsoft Entra ID, Google Workspace, Keycloak, Authentik… La page de connexion propose alors « Se connecter avec … » en plus du mot de passe, qui reste disponible.

**Le fournisseur ne fait que vérifier l’identité.** Il n’ouvre que le compte Sureau **actif** dont l’adresse e-mail, renseignée par un administrateur dans « Gérer l’équipe », correspond à celle de la personne (sans tenir compte des majuscules). Aucun compte n’est créé automatiquement. Une identité dont le fournisseur dit l’e-mail non vérifié est refusée. Choisissez un fournisseur où les adresses sont gérées par votre organisation.

1. Chez le fournisseur, déclarez une application web avec l’adresse de retour `https://sureau.exemple.org/login/oauth2/code/oidc`, puis notez son identifiant et son secret.
2. Dans `.env.instance` :

   ```sh
   SUREAU_OIDC_ISSUER=https://login.microsoftonline.com/<locataire>/v2.0
   SUREAU_OIDC_CLIENT_ID=<identifiant de l’application>
   SUREAU_OIDC_CLIENT_SECRET=<secret de l’application>
   SUREAU_OIDC_NAME=Microsoft
   ```

   Autres émetteurs courants : `https://accounts.google.com`, `https://<serveur>/realms/<royaume>` (Keycloak).
3. Relancez `up`, puis renseignez l’e-mail de chaque compte concerné.

Le fournisseur est contacté à la première connexion par SSO : s’il est injoignable, l’application démarre quand même et la page de connexion l’indique. Derrière un proxy HTTPS, l’adresse de retour suit l’adresse publique transmise par le proxy (voir plus haut). Changer l’e-mail d’un compte ferme ses sessions ouvertes.

### Plusieurs instances sur une même machine

Chaque instance a son fichier de configuration, son nom de projet Compose — donc son volume de données et ses réseaux — et son port :

```sh
SUREAU_ENV_FILE=.env.equipe-b SUREAU_PROJECT=sureau-equipe-b deploy/sureau.sh init --port 8081
SUREAU_ENV_FILE=.env.equipe-b SUREAU_PROJECT=sureau-equipe-b deploy/sureau.sh up
```

Utilisez les mêmes variables pour toutes les commandes suivantes (`status`, `backup`, `update`…). Les données de deux instances ne se mélangent jamais.

Les navigateurs ne distinguent pas les cookies par port. Chaque instance nomme donc son cookie de session d’après son port (`SUREAU_SESSION_8081` ici) : vous pouvez rester connecté à plusieurs instances dans le même navigateur. Si vous changez `SUREAU_HTTP_PORT` ou `SUREAU_COOKIE_NAME`, chacun doit se reconnecter une fois. C’est aussi le cas lors de la mise à jour vers la version qui a introduit ce nom ; les données ne sont pas touchées.

## Commandes courantes

| Commande | Effet |
| --- | --- |
| `deploy/sureau.sh status` | État des conteneurs et de leur santé |
| `deploy/sureau.sh logs -f app` | Journaux de l’application en continu |
| `deploy/sureau.sh down` | Arrête l’instance ; **les données sont conservées** |
| `deploy/sureau.sh compose …` | Toute autre commande `docker compose` sur l’instance |

Les journaux n’affichent ni mot de passe ni clé d’installation. Sous Windows, remplacez `deploy/sureau.sh` par `deploy\sureau.cmd`.

## En cas de problème

- **« Docker n’est pas installé » ou « n’est pas démarré »** : lancez Docker Desktop (ou le service Docker) et attendez qu’il soit prêt avant `up`.
- **Le port est déjà utilisé** : choisissez-en un autre avec `SUREAU_HTTP_PORT` dans `.env.instance`.
- **`up` s’arrête sur une sonde de santé** : consultez `deploy/sureau.sh logs app` et `deploy/sureau.sh logs postgres`. Une base en panne rend l’application indisponible en quelques secondes (les requêtes échouent après 3 s d’attente au lieu de rester bloquées), sans la faire redémarrer en boucle, et elle revient seule avec la base.
- **Une erreur mentionne `SUREAU_DB_PASSWORD` ou `SUREAU_SETUP_TOKEN`** : le fichier de configuration est introuvable ou incomplet. Lancez `init` ou vérifiez `SUREAU_ENV_FILE`.
- **La connexion échoue en HTTPS mais pas en HTTP** (ou l’inverse) : `SUREAU_COOKIE_SECURE=true` impose HTTPS, sauf sur `localhost`.
