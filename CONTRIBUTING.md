# Contribuer à Sureau

Merci de votre intérêt pour Sureau. Les signalements de bugs, les idées et les corrections sont les bienvenus.

## Avant de commencer

- **Un bug ou une idée** : ouvrez un ticket avec le modèle correspondant. Indiquez la version (ou le commit) et la façon dont votre instance est installée.
- **Une faille de sécurité** : ne l’exposez pas dans un ticket public. Suivez la [politique de sécurité](SECURITY.md).
- **Un changement important** (nouvelle fonction, modification d’un contrat d’API ou du schéma de la base) : décrivez-le d’abord dans un ticket, pour en discuter avant d’écrire le code.

## Préparer son environnement

Les prérequis et le lancement de la base, de l’API et de l’interface sont décrits dans la section [Développement](README.md#développement) du README. Le [guide frontend](frontend/README.md) détaille le fonctionnement de l’interface.

## Vérifier son changement

Lancez les vérifications de la partie modifiée avant d’ouvrir une pull request ; la CI rejoue les mêmes :

| Partie | Commandes |
| --- | --- |
| Frontend (dans `frontend/`) | `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build` |
| Backend (dans `backend/`) | `./mvnw test`, avec une base de test dédiée (voir [Vérifications](README.md#vérifications)) |
| Installation et parcours complets | `sh e2e/run.sh` |
| Scripts shell | `shellcheck` sur les fichiers `.sh` modifiés |

`pnpm format` met le code du frontend en forme avec Prettier.

## Ce qu’une contribution respecte

- **Une pull request, un changement cohérent**, sur une branche partant de `main`. Une correction de bug et une nouvelle fonction font deux pull requests.
- **Les textes de l’interface** sont écrits en français et passent par `t()`, `msg()` ou `plural()` (`frontend/src/lib/i18n.ts`). Chaque nouveau texte reçoit sa traduction anglaise dans `frontend/src/lib/i18n-en.ts` : un test échoue sinon.
- **L’accessibilité** fait partie du travail : utilisation au clavier, libellés explicites, contrastes WCAG AA. Les parcours de bout en bout vérifient les écrans principaux avec axe-core.
- **Les données restent vraies** : une erreur de l’API s’affiche comme telle, jamais remplacée par des données fictives ou une liste vide. L’espace partagé s’enregistre explicitement, avec un numéro de version qui détecte les modifications concurrentes.
- **Le schéma de la base** évolue par une nouvelle migration Flyway dans `backend/src/main/resources/db/migration`. Une migration déjà publiée n’est jamais modifiée.
- **Les tests** décrivent un comportement attendu (validation, droits, erreurs, cas limites) plutôt que de recopier l’implémentation.

## Messages de commit

Les messages suivent la forme `type(portée): description`, en français, avec un verbe à l’infinitif :

```text
feat(frontend): proposer l’interface en anglais
fix(auth): donner à chaque instance son propre cookie de session
docs: lire la vidéo de présentation dans le README
```

Types courants : `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `build`, `ci`. Le corps du message explique le pourquoi quand il n’est pas évident.

## Licence des contributions

Sureau est distribué sous [licence AGPL-3.0](LICENSE). En proposant une contribution, vous acceptez qu’elle soit publiée sous cette même licence.
