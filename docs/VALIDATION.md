# Validation — 19 octobre 2026

## Exécuté

- `npm run check` : syntaxe des modules principaux.
- `npm test` : 20 tests automatisés du moteur, serveur, service worker et intégration DOM.
- Simulation de parties pour six modes et vingt graines par mode, jusqu’à cent coups par partie.
- Comparaison de deux jeux recevant les mêmes graines et actions.
- Géométrie du plateau et symétrie des voisins.
- Fusion d’un groupe connecté et collecte ; stabilité après résolution.
- Temps réel du Chrono et expiration autour d’un marteau atomique.
- Rejet de sauvegardes malformées et migration de la progression v5.
- Deux joueurs et un tiers non autorisé via HTTP réel sur un serveur local éphémère.
- Refus d’un coup rejoué, des outils classés et d’un score déclaré par le client.
- Abandon, Elo calculé une seule fois et classement consultable.
- Expiration des salons et des parties.
- Unicité d’une tentative quotidienne, changement de jour UTC, score calculé par le moteur.
- Refus des origines étrangères et des pseudos HTML ; fichiers serveur non exposés.
- Persistance SQLite à travers un arrêt et redémarrage du serveur.
- Service worker : refus de cacher une erreur 404, rattachement des écritures à `waitUntil`, aucune interception API.
- Intégration DOM : démarrage, sélection de pile, coup solo, changement de difficulté, ouverture/reprise d’un salon, abandon et affichage du ladder.

## Limites de cette validation

L’intégration DOM utilise des objets de navigateur simulés et un canvas sans dessin. Elle détecte des erreurs de raccordement mais ne constitue pas une validation visuelle ni une mesure d’ergonomie.

Une tentative de test Playwright a été bloquée par l’absence de Chromium et l’échec de son téléchargement dans l’environnement. Aucun résultat de test visuel desktop/mobile réel n’est donc revendiqué. La procédure ci-dessous reste à exécuter sur un vrai navigateur avant de considérer la version prête pour une publication large.

Docker et le reverse proxy n’ont pas été exécutés ici. Aucun service en ligne n’a été déployé. Les tests HTTP utilisent des serveurs temporaires et une base en mémoire, sauf le test explicite de persistance sur disque temporaire.

## Recette navigateur avant publication

1. Lancer `npm start`, ouvrir Chrome/Firefox et vérifier les présentations desktop et mobile, sans défilement horizontal inattendu.
2. Tester clic, glisser-déposer souris et tactile, annulation de geste, clavier et plateau en boutons.
3. Terminer ou perdre un niveau, recharger, vérifier les scores et la progression sauvegardée.
4. Lancer un Chrono, masquer l’onglet plusieurs secondes puis revenir : le temps doit être décompté entièrement.
5. Créer un salon dans un profil et le rejoindre depuis une fenêtre privée. Vérifier plateau identique, scores opposés, reprise après rechargement et abandon.
6. Jouer le défi quotidien classé ; recharger et vérifier que la tentative reste la même.
7. Installer l’application et vérifier le solo sans réseau. Le classement doit signaler l’absence de serveur.
8. Avec un reverse proxy HTTPS, vérifier `PUBLIC_ORIGIN`, les cookies Secure et la persistance du volume.
