# Hexa Sort Arena — v6

Refonte du jeu [Hexa Sort de beboxos](https://github.com/beboxos/hexa-sort), avec un moteur déterministe partagé entre le navigateur et le serveur. Le jeu v5 reste disponible dans `legacy/index.html` (liens d’application ajustés, règles originales conservées).

**Site solo prévu : https://xairon.github.io/hexa-sort/**

## Lancer

Node.js **24 ou supérieur** est requis, notamment pour SQLite intégré. Aucune dépendance npm à installer.

```bash
npm start
```

Ouvrir **http://localhost:3000**. Pour tester un duel, ouvrir un deuxième profil de navigateur ou une fenêtre privée, créer un salon et rejoindre avec son code. Deux onglets d’un même profil partagent la même identité et ne représentent pas deux joueurs.

```bash
npm run check
npm test
```

## Ce qui fonctionne

- Parcours de 500 niveaux, quatre difficultés et progression locale.
- Survie avec rochers, coups comptés, Chrono et défi quotidien d’entraînement.
- Glisser-déposer, clic pile/case, clavier et plateau alternatif en boutons.
- Symboles en plus des couleurs, effets réduits, son désactivable.
- Annulation des 20 dernières actions en solo, hors Chrono et défi quotidien.
- Duels classés : salons publics par code, même graine et règles pour deux joueurs, 40 piles chacun, limite de dix minutes.
- Classement Elo à somme constante, résultat unique par duel, abandon et expiration des salons.
- Défi quotidien UTC classé, une tentative par profil invité et par jour, reprise possible.
- Moteur exécuté côté serveur pour les parties classées : seuls les coups sont envoyés, jamais un score accepté sur parole.
- SQLite persistant : profils invités, sessions hachées, salons, actions de duel, classements et défis.
- Solo hors ligne après une première ouverture réussie, via service worker.

## Règles et différences avec v5

Dix jetons ou plus de la même couleur au sommet d’une pile sont collectés. Les groupes de sommets voisins de même couleur sont regroupés, puis les nouvelles possibilités sont résolues jusqu’à stabilité. Les cascades multiplient les points et déclenchent la fièvre à cinq étapes.

La génération et le rythme des cascades ont changé : **les scores v5 et v6 ne sont pas comparables**. La vue présente le résultat atomique d’un coup avec des effets courts, plutôt que les longs vols de jetons de v5. Le moteur ne dépend plus des animations.

La progression et les meilleurs scores de niveaux v5 sont migrés de façon bornée. La partie v5 en cours n’est pas convertie, car ses règles et son format diffèrent. La clé `hexa-sort-v5` reste intacte, et la version originale peut toujours la lire. Les classements en ligne sont nouveaux.

Le Chrono mesure le temps réellement écoulé, même si la page est masquée ou rechargée ; le ralenti visuel ne change pas sa durée. Le défi quotidien utilise la date **UTC** pour tous les joueurs.

## Hébergement

GitHub Pages peut servir **le solo uniquement**, sous le nom de dépôt `hexa-sort`. Le workflow `.github/workflows/pages.yml` exporte les seuls fichiers publics et publie après validation sur `main`. Activer la source **GitHub Actions** dans Settings → Pages lors de la première publication. Le multijoueur et les classements nécessitent le serveur Node et son disque persistant, sur le même domaine que l’interface. Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) pour Docker et un reverse proxy HTTPS.

Les profils sont des **invités liés à un cookie**, pas des comptes vérifiés. Le classement est amical : les validations empêchent de falsifier directement un score, mais pas les bots, les comptes multiples ni l’analyse préalable d’une graine. Ajouter une authentification durable et une politique anti-abus avant un classement compétitif public.

## Architecture

| Fichier | Rôle |
| --- | --- |
| `shared/engine.mjs` | État, hasard déterministe, règles, actions atomiques, validation des sauvegardes |
| `shared/storage.mjs` | Sauvegarde locale bornée et migration de progression v5 |
| `app.mjs` | Entrées, rendu canvas, interface, communication avec le serveur |
| `server/main.mjs` | HTTP, sessions, salons, Elo, défi UTC et SQLite |
| `tests/` | Tests du moteur, de l’API, de l’intégration DOM et du service worker |
| `legacy/index.html` | Jeu v5.6 conservé |

État de validation et limites : [docs/VALIDATION.md](docs/VALIDATION.md). Historique de la refonte : [docs/CHANGES.md](docs/CHANGES.md).

## Attribution

Le jeu et les ressources d’origine sont de **beboxos**. Cette branche conserve leur historique dans le fork. Le dépôt source ne fournit pas de licence ; aucune nouvelle licence globale n’est inventée pour ses contenus.
