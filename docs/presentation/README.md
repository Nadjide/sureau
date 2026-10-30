# Vidéo de présentation

La vidéo du [README](../../README.md#présentation-vidéo) est tournée automatiquement sur une **instance réelle** de Sureau, installée pour l'occasion avec les scripts de déploiement. L'interface filmée est celle de l'application ; seules les légendes, le curseur, les cartes de titre et les zooms de caméra sont ajoutés par la mise en scène (`stage.js`). Les données sont fictives : l'entreprise « Studio Lumen », ses 26 matériels, ses 4 salles sur 2 étages et son équipe n'existent pas.

La refaire après une évolution de l'interface, ou pour une autre langue, ne demande aucun montage manuel.

## Tourner

```sh
cd e2e && pnpm install --frozen-lockfile && cd ..
sh docs/presentation/tourner.sh
```

Prérequis :

- Docker ;
- Chrome ;
- ffmpeg (avec `libx264`) ;
- les dépendances du dossier `e2e/` (Playwright) ;
- un **GPU** fortement recommandé. Sans lui, la 3D tombe à quelques images par seconde. Sous Windows, le rendu passe par Direct3D (`--use-angle=d3d11`). Ailleurs, l'option par défaut est `--use-angle=gl`, que l'on adapte avec `VIDEO_CHROME_ARGS`.

Le script crée une instance jetable (port `VIDEO_PORT`, 18130 par défaut), filme les scènes, monte la vidéo, puis supprime l'instance et ses données. Le dossier de travail affiché à la fin contient :

| Fichier | Contenu |
| --- | --- |
| `sureau-presentation.mp4` | 1920 × 1080, 30 images/s, H.264 et AAC, avec chapitres |
| `affiche.jpg` | Image d'aperçu, prise dans la vue 3D, pour une publication ailleurs que sur GitHub |
| `planche.jpg` | Une image toutes les 2 s, pour relire le montage d'un coup d'œil |

Pour publier une nouvelle version :

1. copier `sureau-presentation.mp4` vers `frontend/docs/videos/sureau-presentation.mp4` : c'est la version de référence, en Full HD ;
2. préparer la copie lue dans le README. GitHub n'y affiche un lecteur que pour une vidéo déposée par son site, limitée à 10 Mo sur un compte gratuit. Deux passes à 500 kbit/s gardent le 1080p sous cette limite sans perte visible :

   ```sh
   ffmpeg -i sureau-presentation.mp4 -c:v libx264 -preset slow -b:v 500k -pix_fmt yuv420p -pass 1 -an -f null -
   ffmpeg -i sureau-presentation.mp4 -map_chapters -1 -c:v libx264 -preset slow -b:v 500k -pix_fmt yuv420p -pass 2 -c:a aac -b:a 96k -movflags +faststart sureau-presentation-readme.mp4
   ```

3. glisser `sureau-presentation-readme.mp4` dans une zone de commentaire du dépôt sur GitHub (inutile de publier le commentaire), puis remplacer dans le README le lien `https://github.com/user-attachments/assets/…`, seul sur sa ligne, par celui que GitHub vient d'insérer. Dans un dépôt privé, la vidéo reste visible uniquement par les personnes qui y ont accès ;
4. mettre à jour la durée et la taille indiquées dans le README.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `tourner.sh` | Prépare l'instance, lance le tournage puis le montage, nettoie |
| `record.mjs` | Scénario : chaque scène est capturée image par image (screencast Chrome) avec ses horodatages |
| `montage.mjs` | Passage à une cadence fixe, fondus enchaînés, musique, chapitres, affiche |
| `stage.js` | Mise en scène injectée dans la page : curseur, légendes, cartes, zoom |
| `demo-data.mjs` | Jeu de données fictif ; utilisable seul : `node demo-data.mjs <adresse> <clé d'installation>` |
| `musique-originale.m4a` | Musique originale de 2 minutes, synthétisée à partir d'oscillateurs et de bruit, sans échantillon ni musique tierce |
| `generate_music.py` | Générateur de cette musique (Python, NumPy, SciPy, ffmpeg) |

L'interface est mise en page en 1440 × 810 et rendue avec une densité de 4/3. La capture est ainsi en 1920 × 1080 natif, avec un texte net et une interface lisible même en petit. Les mots de passe des comptes de démonstration sont tirés au hasard à chaque tournage.
