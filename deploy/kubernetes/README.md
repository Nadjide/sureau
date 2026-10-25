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

2. **Créez le namespace puis les secrets.** Ils ne sont jamais dans le dépôt :

   ```sh
   kubectl apply -f deploy/kubernetes/base/namespace.yaml
   kubectl -n sureau create secret generic sureau-secrets \
     --from-literal=db-password="$(openssl rand -hex 32)" \
     --from-literal=setup-token="$(openssl rand -hex 24)"
   ```

   Le secret `sureau-secrets` peut aussi venir d'un gestionnaire de secrets externe (External Secrets, Sealed Secrets, etc.) : seuls son nom et ses deux clés, `db-password` et `setup-token`, comptent.

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

## Sondes, ressources et réseau

- La sonde de disponibilité de l'application vérifie PostgreSQL ; celle de vie, non : une panne de la base retire l'application du service sans la redémarrer en boucle.
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

La restauration **remplace toutes les données** de l'instance. Faites d'abord une sauvegarde de l'état actuel avec les commandes ci-dessus.

```sh
kubectl -n sureau scale deployment/sureau --replicas=0
kubectl -n sureau cp ./sureau.dump postgres-0:/tmp/restore.dump
kubectl -n sureau exec postgres-0 -- sh -c 'psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 -c "SET client_min_messages TO warning; DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && pg_restore --username=sureau --dbname=sureau --no-owner --no-privileges --single-transaction --exit-on-error /tmp/restore.dump && psql --quiet --username=sureau --dbname=sureau -c "TRUNCATE spring_session, spring_session_attributes" && rm /tmp/restore.dump'
kubectl -n sureau scale deployment/sureau --replicas=1
```

Les sessions sont purgées : chacun doit se reconnecter. Restaurez une sauvegarde issue de la même version de Sureau ou d'une version plus ancienne, jamais d'une version plus récente.

## Mettre à jour

1. Sauvegardez la base (ci-dessus).
2. Changez `newTag` dans votre overlay puis `kubectl apply -k mon-instance`. La stratégie `Recreate` arrête l'ancienne version avant de démarrer la nouvelle, qui applique ses migrations au démarrage.
3. En cas d'échec, revenez à l'ancien `newTag` et, si les migrations ont déjà modifié la base, restaurez la sauvegarde.

## Désinstaller

`kubectl delete -k mon-instance` retire l'application et la base, mais **conserve le volume persistant** (`data-postgres-0`) et les secrets. Supprimer le namespace efface tout, données comprises : ne le faites qu'après avoir mis une sauvegarde en lieu sûr.
