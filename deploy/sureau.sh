#!/bin/sh
# Pilote une instance Sureau installée avec Docker Compose (Linux, macOS, WSL).
# Seul Docker est nécessaire sur la machine : ni Java ni Node.
#
#   deploy/sureau.sh init [--port 8080]   crée la configuration et ses secrets
#   deploy/sureau.sh up                   construit et démarre l'instance
#   deploy/sureau.sh down                 arrête l'instance, données conservées
#   deploy/sureau.sh status | logs [...]  état et journaux
#   deploy/sureau.sh backup [--output D]  sauvegarde complète de la base
#   deploy/sureau.sh restore FICHIER [--yes]
#                                         remplace les données par une sauvegarde
#   deploy/sureau.sh update               sauvegarde, reconstruit, redémarre
#   deploy/sureau.sh compose [...]        toute autre commande « docker compose »
#
# Variables facultatives pour gérer plusieurs instances sur un même hôte :
#   SUREAU_ENV_FILE    fichier de configuration (défaut : .env.instance à la racine)
#   SUREAU_PROJECT     nom du projet Compose, qui détermine volume et réseaux
#   SUREAU_BACKUP_DIR  dossier des sauvegardes (défaut : backups à la racine)

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(dirname "$script_dir")
compose_file="$root/docker-compose.install.yml"
template="$script_dir/instance.env.example"
env_file=${SUREAU_ENV_FILE:-$root/.env.instance}
backup_dir=${SUREAU_BACKUP_DIR:-$root/backups}
project=${SUREAU_PROJECT:-sureau-instance}

fail() {
  echo "Erreur : $*" >&2
  exit 1
}

usage() {
  sed -n '2,/^$/p' "$0" | sed 's/^# \{0,1\}//'
}

random_hex() {
  od -An -N"$1" -tx1 /dev/urandom | tr -d ' \n'
}

env_value() {
  sed -n "s/^$1=//p" "$env_file" | tail -n 1
}

compose() {
  if [ -n "${SUREAU_PROJECT:-}" ]; then
    docker compose -f "$compose_file" -p "$SUREAU_PROJECT" --env-file "$env_file" "$@"
  else
    docker compose -f "$compose_file" --env-file "$env_file" "$@"
  fi
}

require_instance() {
  command -v docker >/dev/null 2>&1 || fail "Docker n'est pas installé ou n'est pas dans le PATH."
  docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 est requis."
  [ -f "$env_file" ] || fail "$env_file est introuvable. Lancez d'abord : deploy/sureau.sh init"
}

cmd_init() {
  port=8080
  while [ $# -gt 0 ]; do
    case $1 in
      --port)
        [ $# -ge 2 ] || fail "--port attend un numéro de port."
        port=$2
        shift 2
        ;;
      *) fail "Option inconnue : $1" ;;
    esac
  done
  case $port in
    '' | *[!0-9]*) fail "Le port doit être un nombre." ;;
  esac
  [ "$port" -ge 1 ] && [ "$port" -le 65535 ] || fail "Le port doit être compris entre 1 et 65535."

  if [ -e "$env_file" ]; then
    echo "$env_file existe déjà : rien n'a été modifié."
    return 0
  fi

  db_password=$(random_hex 32)
  setup_token=$(random_hex 24)
  # Le fichier est créé en lecture/écriture pour son propriétaire seulement,
  # et jamais par-dessus un fichier existant (noclobber).
  (
    umask 077
    set -C
    sed \
      -e "s|^SUREAU_DB_PASSWORD=.*|SUREAU_DB_PASSWORD=$db_password|" \
      -e "s|^SUREAU_SETUP_TOKEN=.*|SUREAU_SETUP_TOKEN=$setup_token|" \
      -e "s|^SUREAU_HTTP_PORT=.*|SUREAU_HTTP_PORT=$port|" \
      "$template" > "$env_file"
  ) || fail "Impossible de créer $env_file."

  echo "Configuration créée : $env_file"
  echo "Conservez ce fichier et sauvegardez-le avec vos données : il contient les secrets de l'instance."
  echo
  echo "Clé d'installation du premier administrateur (à saisir une seule fois dans l'interface) :"
  echo "  $setup_token"
  echo
  echo "Étape suivante : deploy/sureau.sh up"
}

# Démarre ou met à jour l'application. L'image est construite à partir des
# sources, sauf si SUREAU_IMAGE désigne une image publiée : elle est alors
# téléchargée, ce qui évite d'avoir les sources sur la machine.
deploy_app() {
  image=${SUREAU_IMAGE:-$(env_value SUREAU_IMAGE)}
  if [ -n "$image" ] && [ "$image" != sureau:local ]; then
    compose pull app || return 1
    compose up -d --wait --wait-timeout 300
  else
    compose up -d --build --wait --wait-timeout 300
  fi
}

cmd_up() {
  require_instance
  deploy_app
  bind=$(env_value SUREAU_HTTP_BIND)
  echo
  echo "Sureau est démarré : http://${bind:-127.0.0.1}:$(env_value SUREAU_HTTP_PORT)"
}

# Exécute une commande shell dans le conteneur de la base. Les chemins du
# conteneur restent dans la chaîne, à l'abri de la conversion de chemins de
# certains shells Windows.
in_db() {
  compose exec -T postgres sh -c "$1" < /dev/null
}

# Même chose, mais l'entrée standard (le fichier de sauvegarde) est transmise.
# Les autres appels la coupent : « compose exec » sinon avalerait la réponse
# de l'utilisateur à la confirmation.
in_db_stdin() {
  compose exec -T postgres sh -c "$1"
}

require_database() {
  [ -n "$(compose ps -q --status running postgres)" ] ||
    fail "La base de données n'est pas démarrée. Lancez d'abord : deploy/sureau.sh up"
}

# Écrit une sauvegarde complète et vérifiée dans le dossier $1, avec le préfixe
# $2. Son chemin est placé dans backup_file, sa taille dans backup_size.
make_backup() {
  mkdir -p "$1"
  backup_file="$1/$2-$(date -u +%Y%m%d-%H%M%S).dump"
  # Le contenu des sessions est exclu : une sauvegarde ne doit jamais permettre
  # de réutiliser une connexion ouverte.
  in_db 'pg_dump --username=sureau --dbname=sureau \
      --format=custom --no-owner --no-privileges \
      --exclude-table-data=spring_session --exclude-table-data=spring_session_attributes \
      --file=/tmp/sureau.dump && pg_restore --list /tmp/sureau.dump > /dev/null' ||
    fail "La sauvegarde de la base a échoué."
  # Le fichier transite par la sortie standard du conteneur, sans réencodage.
  if ! (umask 077; in_db 'cat /tmp/sureau.dump' > "$backup_file"); then
    rm -f "$backup_file"
    fail "La copie de la sauvegarde a échoué."
  fi
  expected=$(in_db 'wc -c < /tmp/sureau.dump' | tr -d ' \r\n')
  backup_size=$(wc -c < "$backup_file" | tr -d ' ')
  in_db 'rm -f /tmp/sureau.dump'
  if [ "$expected" != "$backup_size" ]; then
    rm -f "$backup_file"
    fail "La sauvegarde copiée est incomplète ($backup_size sur $expected octets) ; elle a été supprimée."
  fi
}

cmd_backup() {
  dir=$backup_dir
  while [ $# -gt 0 ]; do
    case $1 in
      --output)
        [ $# -ge 2 ] || fail "--output attend un dossier."
        dir=$2
        shift 2
        ;;
      *) fail "Option inconnue : $1" ;;
    esac
  done
  require_instance
  require_database
  make_backup "$dir" "$project"
  echo "Sauvegarde créée : $backup_file ($backup_size octets)"
  echo "Elle contient tous les comptes, l'inventaire et les plans de l'instance : rangez-la hors de cette machine et protégez-la."
  echo "Elle ne contient pas $env_file : conservez-le séparément."
}

cmd_restore() {
  file=
  assume_yes=no
  while [ $# -gt 0 ]; do
    case $1 in
      --yes)
        assume_yes=yes
        shift
        ;;
      -*) fail "Option inconnue : $1" ;;
      *)
        [ -z "$file" ] || fail "Un seul fichier de sauvegarde est attendu."
        file=$1
        shift
        ;;
    esac
  done
  [ -n "$file" ] || fail "Indiquez le fichier de sauvegarde à restaurer."
  [ -f "$file" ] || fail "$file est introuvable."
  require_instance
  require_database

  # Rien n'est modifié tant que l'archive n'a pas été lue en entier : la convertir
  # en script SQL décompresse chacun de ses blocs, si bien qu'une archive
  # tronquée ou corrompue est refusée ici, avant tout arrêt.
  in_db_stdin 'cat > /tmp/restore.dump' < "$file"
  if ! in_db 'pg_restore --list /tmp/restore.dump 2>/dev/null | grep -q flyway_schema_history &&
      pg_restore --no-owner --no-privileges --file=/tmp/restore.sql /tmp/restore.dump 2>/dev/null'; then
    in_db 'rm -f /tmp/restore.dump /tmp/restore.sql'
    fail "$file n'est pas une sauvegarde Sureau complète et lisible. Rien n'a été modifié."
  fi

  if [ "$assume_yes" != yes ]; then
    echo "Toutes les données de l'instance « $project » (comptes, inventaire, plans)"
    echo "seront remplacées par le contenu de $file."
    echo "Une sauvegarde de sécurité de l'état actuel est créée avant."
    printf 'Tapez « restaurer » pour continuer : '
    answer=
    read -r answer || true
    if [ "$answer" != restaurer ]; then
      in_db 'rm -f /tmp/restore.dump /tmp/restore.sql'
      fail "Restauration annulée, rien n'a été modifié."
    fi
  fi

  # L'application est arrêtée avant la sauvegarde de sécurité : rien ne peut
  # plus s'écrire entre cette sauvegarde et le remplacement.
  compose stop app
  make_backup "$backup_dir" "$project-avant-restauration"
  safety=$backup_file
  echo "Sauvegarde de sécurité : $safety"

  # Une seule transaction remplace le schéma, recharge les données et purge les
  # sessions (tout le monde doit se reconnecter). Au moindre échec, PostgreSQL
  # annule l'ensemble : la base reste exactement dans son état précédent.
  if ! in_db 'psql --quiet --username=sureau --dbname=sureau -v ON_ERROR_STOP=1 --single-transaction \
      -c "SET client_min_messages TO warning" -c "DROP SCHEMA public CASCADE" -c "CREATE SCHEMA public" \
      -f /tmp/restore.sql -c "TRUNCATE public.spring_session, public.spring_session_attributes"'; then
    in_db 'rm -f /tmp/restore.dump /tmp/restore.sql'
    compose up -d --wait --wait-timeout 300 || true
    fail "La restauration a échoué et a été annulée : les données de l'instance n'ont pas changé."
  fi
  in_db 'rm -f /tmp/restore.dump /tmp/restore.sql'
  compose up -d --wait --wait-timeout 300 ||
    fail "L'application ne démarre pas après la restauration. Si la sauvegarde vient d'une version plus récente de Sureau, revenez d'abord à cette version. État précédent : deploy/sureau.sh restore $safety --yes"
  echo
  echo "Restauration terminée. Toutes les sessions ont été fermées : reconnectez-vous."
  echo "État précédent conservé dans $safety"
}

cmd_update() {
  require_instance
  require_database
  make_backup "$backup_dir" "$project-avant-mise-a-jour"
  echo "Sauvegarde avant mise à jour : $backup_file"
  deploy_app ||
    fail "La mise à jour a échoué. Revenez à la version précédente (sources ou SUREAU_IMAGE) puis restaurez : deploy/sureau.sh restore $backup_file --yes"
  echo
  echo "Mise à jour terminée."
}

[ $# -ge 1 ] || { usage >&2; exit 2; }
command=$1
shift

case $command in
  init) cmd_init "$@" ;;
  backup) cmd_backup "$@" ;;
  restore) cmd_restore "$@" ;;
  update) cmd_update ;;
  up) cmd_up ;;
  down) require_instance; compose down ;;
  status) require_instance; compose ps ;;
  logs) require_instance; compose logs "$@" ;;
  compose) require_instance; compose "$@" ;;
  -h | --help | help) usage ;;
  *) usage >&2; fail "Commande inconnue : $command" ;;
esac
