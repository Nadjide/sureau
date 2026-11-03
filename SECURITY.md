# Politique de sécurité

## Versions concernées

Sureau n’a pas encore de version publiée. Les correctifs de sécurité sont apportés sur la branche `main` ; mettez votre instance à jour à partir de celle-ci (voir le [guide d’exploitation](docs/exploitation.md)).

## Signaler une faille

**N’ouvrez pas de ticket public** pour une faille de sécurité. Utilisez le signalement privé de GitHub : onglet **Security**, puis **Report a vulnerability** ([formulaire](https://github.com/Nadjide/sureau/security/advisories/new)).

Pour un traitement rapide, indiquez si possible :

- la partie concernée (API, interface, scripts d’installation, Kubernetes) et la version ou le commit ;
- les étapes ou la requête qui reproduisent le problème ;
- l’impact constaté ou supposé : données lues ou modifiées, droits contournés, déni de service ;
- une piste de correction, si vous en avez une.

## Ce qui suit un signalement

Le projet est maintenu par une seule personne. Vous recevez une première réponse dès que possible, en général sous quelques jours. Une fois la faille confirmée, le correctif est préparé en privé, puis publié avec un avis de sécurité qui vous crédite si vous le souhaitez.

## Bonnes pratiques d’installation

Une instance exposée sur Internet doit être servie en HTTPS, avec le cookie sécurisé activé (`SUREAU_COOKIE_SECURE=true`). Le fichier d’environnement de l’instance contient ses secrets : ne le publiez jamais. Le [guide d’installation](docs/installation.md) détaille ces réglages.
