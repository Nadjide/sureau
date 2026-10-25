#!/bin/sh
# Parcours de bout en bout sur une instance Sureau réellement installée.
#
# Le script crée une instance jetable (application + PostgreSQL, secrets
# aléatoires, projet Compose et volume dédiés), puis enchaîne :
#   1. l'installation par l'interface et la création de données,
#   2. un redémarrage de l'application,
#   3. une sauvegarde complète puis sa restauration,
#   4. deux restaurations qui doivent échouer sans rien modifier : une archive
#      tronquée, puis une erreur SQL provoquée au milieu du remplacement,
# en vérifiant à chaque étape que comptes, inventaire et plan sont conservés.
# L'instance et ses données sont supprimées à la fin.
#
# Prérequis : Docker, pnpm et un navigateur (voir e2e/package.json).
#   SUREAU_E2E_PORT     port local de l'instance (défaut : 18090)
#   SUREAU_E2E_CHANNEL  chrome pour utiliser le Chrome installé
#   PNPM                commande pnpm à utiliser (défaut : pnpm)

set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(dirname "$here")
port=${SUREAU_E2E_PORT:-18090}
pnpm=${PNPM:-pnpm}
work=$(mktemp -d)

export SUREAU_ENV_FILE="$work/instance.env"
export SUREAU_PROJECT=${SUREAU_E2E_PROJECT:-sureau-e2e}
export SUREAU_BACKUP_DIR="$work/backups"

sureau() {
  sh "$root/deploy/sureau.sh" "$@"
}

cleanup() {
  status=$?
  sureau compose down -v > /dev/null 2>&1 || true
  rm -rf "$work"
  exit "$status"
}
trap cleanup EXIT INT TERM

# La clé d'installation n'est pas affichée : elle ne sert qu'à cette exécution.
sureau init --port "$port" > /dev/null
token=$(sed -n 's/^SUREAU_SETUP_TOKEN=//p' "$SUREAU_ENV_FILE")
[ -z "${GITHUB_ACTIONS:-}" ] || echo "::add-mask::$token"

sureau up

export SUREAU_E2E_ORIGIN="http://127.0.0.1:$port"
export SUREAU_E2E_SETUP_TOKEN=$token
export SUREAU_E2E_STATE="$work/state.json"

e2e() {
  echo
  echo "== $1"
  (cd "$here" && "$pnpm" exec playwright test --project="$1")
}

e2e install

echo
echo "== Redémarrage de l'application"
sureau compose restart app
sureau compose up -d --wait --wait-timeout 300
e2e after-restart

echo
echo "== Sauvegarde puis restauration complètes"
sureau backup
backup=$(ls -1 "$SUREAU_BACKUP_DIR"/*.dump | head -n 1)
sureau restore "$backup" --yes
e2e after-restore

echo
echo "== Restaurations refusées ou annulées, données intactes"
size=$(wc -c < "$backup")
head -c $((size * 2 / 3)) "$backup" > "$work/tronquee.dump"
if sureau restore "$work/tronquee.dump" --yes; then
  echo "Une archive tronquée a été restaurée." >&2
  exit 1
fi
# Un déclencheur refuse toute création de table : la restauration échoue après
# avoir supprimé le schéma, dans la même transaction, qui doit être annulée.
psql_test() {
  sureau compose exec -T postgres psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 -c "$1"
}
psql_test "CREATE SCHEMA e2e_guard;
  CREATE FUNCTION e2e_guard.deny() RETURNS event_trigger LANGUAGE plpgsql
    AS \$\$ BEGIN RAISE EXCEPTION 'restauration interrompue par le test'; END \$\$;
  CREATE EVENT TRIGGER e2e_deny ON ddl_command_start WHEN TAG IN ('CREATE TABLE') EXECUTE FUNCTION e2e_guard.deny();"
if sureau restore "$backup" --yes; then
  echo "Une restauration interrompue a été présentée comme réussie." >&2
  exit 1
fi
psql_test "DROP EVENT TRIGGER e2e_deny; DROP SCHEMA e2e_guard CASCADE;"
e2e after-restore
