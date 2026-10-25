#!/bin/sh
# Tourne et monte la vidéo de présentation de Sureau.
#
# Une instance jetable est installée avec les scripts de déploiement (secrets
# aléatoires, projet Compose et volume dédiés), filmée scène par scène, puis
# supprimée. Le résultat reste dans le dossier de travail affiché à la fin.
#
# Prérequis : Docker, Chrome, ffmpeg, et les dépendances de e2e/
# (cd e2e && pnpm install --frozen-lockfile). Un GPU est recommandé pour une
# 3D fluide. Voir docs/presentation/README.md.
#   VIDEO_PORT     port local de l'instance (défaut : 18130)
#   VIDEO_WORKDIR  dossier de travail (défaut : dossier temporaire)

set -eu

here=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
root=$(dirname "$(dirname "$here")")
port=${VIDEO_PORT:-18130}
work=${VIDEO_WORKDIR:-$(mktemp -d)}

export VIDEO_WORKDIR="$work"
export SUREAU_ENV_FILE="$work/instance.env"
export SUREAU_PROJECT=${VIDEO_PROJECT:-sureau-presentation}

sureau() {
  sh "$root/deploy/sureau.sh" "$@"
}

cleanup() {
  status=$?
  sureau compose down -v > /dev/null 2>&1 || true
  rm -f "$SUREAU_ENV_FILE"
  exit "$status"
}
trap cleanup EXIT INT TERM

sureau init --port "$port" > /dev/null
sureau up

VIDEO_ORIGIN="http://127.0.0.1:$port" \
VIDEO_SETUP_TOKEN=$(sed -n 's/^SUREAU_SETUP_TOKEN=//p' "$SUREAU_ENV_FILE") \
  node "$here/record.mjs"
node "$here/montage.mjs"
rm -rf "$work/segments"

echo
echo "Vidéo : $work/out/sureau-presentation.mp4"
echo "Affiche : $work/out/affiche.jpg — planche de relecture : $work/out/planche.jpg"
