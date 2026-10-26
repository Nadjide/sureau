# Installer Sureau sur Kubernetes

Cette installation déploie **une instance dédiée** : l'application (une réplique) et sa base PostgreSQL (un `StatefulSet` avec volume persistant), dans leur propre namespace. Elle n'offre pas de haute disponibilité : une panne du nœud ou de la base interrompt le service jusqu'au redémarrage des pods. Elle n'est pas conçue pour mutualiser plusieurs organisations dans une même base ; chaque organisation a son instance, avec ses secrets et ses données.

Les manifestes (Kustomize) ont été vérifiés sur un cluster kind (Kubernetes 1.36) : installation, redémarrage de l'application, suppression du pod PostgreSQL avec conservation des données, sauvegarde et restauration. Ils respectent le profil de sécurité `restricted` de Kubernetes : utilisateur non-root, système de fichiers de l'application en lecture seule, capacités retirées, profil seccomp par défaut.

## Prérequis

- Un cluster Kubernetes et `kubectl` (Kustomize est intégré à `kubectl`). **Vérifiez le contexte actif avant d'appliquer quoi que ce soit** : `kubectl config current-context`.
- Une classe de stockage par défaut, ou une classe à indiquer dans un overlay (`storageClassName` du volume de la base).
- Une image de l'application accessible depuis le cluster : une image publiée (un registre privé demande un `imagePullSecret`) ou une image construite par vos soins avec le `Dockerfile` de la racine.

## Installation

Les commandes sont écrites pour un shell POSIX (Linux, macOS, WSL, Git Bash), depuis la racine du dépôt.

1. **Choisissez la version de l'image** dans un overlay à vous, qui reprend la base :

   ```yaml
   # mon-instance/kustomization.yaml
   apiVersion: kustomize.config.k8s.io/v1beta1
   kind: Kustomization
   resources:
     - ../deploy/kubernetes/base
   images:
     - name: sureau
       newName: ghcr.io/<propriétaire>/sureau
       newTag: <version>
   ```

   Pour un essai avec un cluster kind, construisez l'image puis chargez-la : `docker build -t sureau:local .` puis `kind load docker-image sureau:local --name <cluster>`. La base utilise `sureau:local` tant que vous ne la remplacez pas.

2. **Créez le namespace puis les secrets.** Le namespace est géré séparément de la base Kustomize afin qu'une désinstallation conserve les données. Cette étape est obligatoire pour une nouvelle instance ; les valeurs des secrets ne sont jamais dans le dépôt :

   ```sh
   kubectl apply -f deploy/kubernetes/base/namespace.yaml
   kubectl -n sureau create secret generic sureau-secrets \
     --from-literal=db-password="$(openssl rand -hex 32)" \
     --from-literal=setup-token="$(openssl rand -hex 24)"
   ```

   Le secret `sureau-secrets` peut aussi venir d'un gestionnaire de secrets externe (External Secrets, Sealed Secrets, etc.) : seuls son nom et ses deux clés, `db-password` et `setup-token`, comptent. Si votre overlay change le namespace, créez ce namespace avec les mêmes labels de sécurité que `namespace.yaml` et utilisez son nom dans toutes les commandes `kubectl -n`.

   Pour une instance déjà installée, conservez son namespace et son secret existants : une mise à jour par `kubectl apply -k` ne les supprime pas et ne nécessite pas de recréer les secrets.

3. **Appliquez et attendez.**

   ```sh
   kubectl apply -k mon-instance          # ou deploy/kubernetes/base
   kubectl -n sureau rollout status statefulset/postgres
   kubectl -n sureau rollout status deployment/sureau
   ```

4. **Créez le premier administrateur.** Ouvrez l'application (voir ci-dessous) et saisissez la clé d'installation :

   ```sh
   kubectl -n sureau get secret sureau-secrets -o jsonpath='{.data.setup-token}' | base64 -d
   ```

## Accéder à l'application

- **Essai local** : `kubectl -n sureau port-forward svc/sureau 8080:80`, puis `http://localhost:8080`.
- **Exposition réelle** : un `Ingress` avec TLS, dont `deploy/kubernetes/examples/ingress.yaml` donne un modèle. Sureau se place à la racine d'un domaine ou sous-domaine, pas sous un sous-chemin.

Le cookie de session est marqué `Secure` par défaut (`SUREAU_COOKIE_SECURE=true` dans la ConfigMap) : il n'est envoyé qu'en HTTPS, ce que les navigateurs acceptent aussi sur `localhost`. Si vous devez servir l'instance en HTTP clair ailleurs que sur `localhost`, ce qui est déconseillé, passez la valeur à `false` dans votre overlay.

Le cookie s'appelle `SUREAU_SESSION_<namespace>`. Deux instances jointes sous le même nom d'hôte, par exemple deux `port-forward` vers `localhost`, ne ferment donc pas la session l'une de l'autre. Lors de la mise à jour vers la version qui a introduit ce nom, chacun doit se reconnecter une fois ; les données ne sont pas touchées.

## Connexion d'entreprise (SSO)

La connexion par OpenID Connect est facultative ; son fonctionnement est décrit dans [le guide d'installation](../../docs/installation.md#connexion-dentreprise-sso). Pour l'activer, ajoutez à la ConfigMap de votre overlay `SUREAU_OIDC_ISSUER`, `SUREAU_OIDC_CLIENT_ID` et, si vous le souhaitez, `SUREAU_OIDC_NAME`, et au secret la clé `oidc-client-secret` :

```sh
kubectl -n sureau patch secret sureau-secrets --type merge -p '{"stringData":{"oidc-client-secret":"<secret>"}}'
```

L'adresse de retour à déclarer chez le fournisseur est `https://<votre domaine>/login/oauth2/code/oidc`. Redémarrez ensuite le Deployment (`kubectl -n sureau rollout restart deployment/sureau`).

## Sondes, ressources et réseau

- La sonde de disponibilité de l'application vérifie PostgreSQL ; celle de vie, non : une panne de la base retire l'application du service sans la redémarrer en boucle. Sans base, la sonde répond 503 en 3 s au plus, dans son délai de 5 s.
- Requêtes et limites sont modestes (application : 512 Mo à 1 Go ; base : 256 à 512 Mo). Ajustez-les dans un overlay selon votre usage.
- La `NetworkPolicy` ne laisse joindre la base que par l'application. Elle n'agit que si le plugin réseau du cluster applique les `NetworkPolicy`.

## Sauvegarder et restaurer

L'export JSON de l'atelier ne remplace pas une sauvegarde complète. Celle-ci contient les comptes, l'inventaire, les plans et leurs associations, sans le contenu des sessions. Le secret `sureau-secrets` se sauvegarde séparément, avec votre gestionnaire de secrets.

```sh
# Sauvegarde
kubectl -n sureau exec postgres-0 -- sh -c 'pg_dump --username=sureau --dbname=sureau --format=custom --no-owner --no-privileges --exclude-table-data=spring_session --exclude-table-data=spring_session_attributes --file=/tmp/sureau.dump'
kubectl -n sureau cp postgres-0:/tmp/sureau.dump ./sureau.dump
kubectl -n sureau exec postgres-0 -- rm /tmp/sureau.dump
```

La restauration **remplace toutes les données** de l'instance. Lisez d'abord l'archive en entier : la conversion en SQL refuse une archive tronquée ou corrompue avant toute modification. Arrêtez ensuite l'application et faites une sauvegarde de l'état actuel avec les commandes ci-dessus. Le remplacement se fait enfin en une seule transaction : au moindre échec, PostgreSQL annule tout et les données restent celles d'avant.

```sh
kubectl -n sureau cp ./sureau.dump postgres-0:/tmp/restore.dump
kubectl -n sureau exec postgres-0 -- pg_restore --no-owner --no-privileges --file=/tmp/restore.sql /tmp/restore.dump
kubectl -n sureau scale deployment/sureau --replicas=0
# … sauvegarde de l'état actuel (voir ci-dessus) …
kubectl -n sureau exec postgres-0 -- psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET client_min_messages TO warning" -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public" \
  -f /tmp/restore.sql -c "TRUNCATE public.spring_session, public.spring_session_attributes"
kubectl -n sureau exec postgres-0 -- rm -f /tmp/restore.dump /tmp/restore.sql
kubectl -n sureau scale deployment/sureau --replicas=1
```

Les sessions sont purgées : chacun doit se reconnecter. Restaurez une sauvegarde issue de la même version de Sureau ou d'une version plus ancienne, jamais d'une version plus récente.

## Mettre à jour

1. Sauvegardez la base (ci-dessus).
2. Changez `newTag` dans votre overlay puis `kubectl apply -k mon-instance`. La stratégie `Recreate` arrête l'ancienne version avant de démarrer la nouvelle, qui applique ses migrations au démarrage.
3. En cas d'échec, revenez à l'ancien `newTag` et, si les migrations ont déjà modifié la base, restaurez la sauvegarde.

## Désinstaller

Avec cette version des manifestes, `kubectl delete -k mon-instance` retire l'application, le StatefulSet PostgreSQL et leurs ressources de service, mais **conserve le namespace, le PVC `data-postgres-0` et le secret `sureau-secrets`**. Le namespace et les secrets ne font pas partie de la base Kustomize ; le StatefulSet garde explicitement ses PVC lors d'une suppression ou d'une réduction du nombre de répliques. Gardez aussi votre overlay et une sauvegarde récente hors du cluster.

Cette conservation suppose que votre overlay n'ajoute pas le namespace, les secrets ou le PVC dans ses propres `resources`. Avant de désinstaller, vérifiez le rendu avec `kubectl kustomize mon-instance`. **Les anciennes versions de la base incluaient le namespace : ne lancez pas leur commande de suppression en supposant que les données seront conservées.**

Pour réinstaller, utilisez le même namespace, le même overlay, la même version de l'image et les identifiants conservés :

```sh
kubectl apply -k mon-instance
kubectl -n sureau rollout status statefulset/postgres
kubectl -n sureau rollout status deployment/sureau
```

Le StatefulSet retrouve son PVC et l'application retrouve ses données. Ne recréez pas le secret avec un nouveau mot de passe : PostgreSQL conserve celui de l'initialisation dans le volume.

**Supprimer le namespace ou le PVC retire l'accès aux données et peut supprimer le volume physique**, selon la politique du stockage. La rétention du StatefulSet ne protège pas ces suppressions : elles doivent rester des opérations distinctes et volontaires, après sauvegarde vérifiée. Un PVC conservé dans le cluster ne remplace pas une sauvegarde.
