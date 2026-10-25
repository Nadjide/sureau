#!/bin/sh
# Pilote une instance Sureau installée avec Docker Compose (Linux, macOS, WSL).
# Seul Docker est nécessaire sur la machine : ni Java ni Node.
#
#   deploy/sureau.sh init [--port 8080]   crée la configuration et ses secrets
#   deploy/sureau.sh up                   construit et démarre l'instance
#   deploy/sureau.sh down                 arrête l'instance, données conservées
#   deploy/sureau.sh status | logs [...]  état et journaux
#   deploy/sureau.sh compose [...]        toute autre commande « docker compose »
#
# Variables facultatives pour gérer plusieurs instances sur un même hôte :
#   SUREAU_ENV_FILE  fichier de configuration (défaut : .env.instance à la racine)
#   SUREAU_PROJECT   nom du projet Compose, qui détermine volume et réseaux

set -eu

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(dirname "$script_dir")
compose_file="$root/docker-compose.install.yml"
template="$script_dir/instance.env.example"
env_file=${SUREAU_ENV_FILE:-$root/.env.instance}

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

cmd_up() {
  require_instance
  compose up -d --build --wait --wait-timeout 300
  bind=$(env_value SUREAU_HTTP_BIND)
  echo
  echo "Sureau est démarré : http://${bind:-127.0.0.1}:$(env_value SUREAU_HTTP_PORT)"
}

[ $# -ge 1 ] || { usage >&2; exit 2; }
command=$1
shift

case $command in
  init) cmd_init "$@" ;;
  up) cmd_up ;;
  down) require_instance; compose down ;;
  status) require_instance; compose ps ;;
  logs) require_instance; compose logs "$@" ;;
  compose) require_instance; compose "$@" ;;
  -h | --help | help) usage ;;
  *) usage >&2; fail "Commande inconnue : $command" ;;
esac
