# Refonte v6

## Défauts traités

- Le temps du Chrono est séparé du temps d’animation. Aucune limite de 50 ms n’est appliquée au décompte.
- Les coups sont atomiques : un marteau ne laisse aucune tâche différée susceptible de bloquer ou ressusciter une partie expirée.
- Les sauvegardes sont validées : nombres finis, difficultés appartenant à une liste explicite, niveaux bornés à 500, tailles de piles et de plateau contrôlées.
- Le niveau débloqué ne déclenche plus une création de boutons DOM proportionnelle à une valeur arbitraire.
- Le défi quotidien utilise une date UTC attachée à la partie. Le serveur refuse les coups d’une tentative d’un autre jour.
- Le service worker refuse de remplacer une copie valide par une réponse HTTP d’erreur et rattache les écritures au cycle de vie de l’événement.
- Les données de profils et de serveur sont affichées par `textContent`, sans interpolation HTML.
- Le script PowerShell v5 ne peut plus écraser la nouvelle application.

## Base technique

Moteur pur sans DOM ni temporisation. Hasard déterministe sérialisable, actions validées, absence de mutation de l’état fourni par l’appelant, résultat stable des cascades. Le même module calcule le solo et les coups de parties classées côté serveur.

## Multijoueur

Course au score sur deux plateaux identiques. Les adversaires jouent indépendamment ; aucun bonus d’attaque ou échange de jetons n’est introduit. Les salons sont publics et accessibles par code. Deux joueurs maximum. La partie se termine après les deux jeux, un abandon ou dix minutes. Un abandon vaut défaite ; au délai, les scores atteints départagent les joueurs. Égalité possible. Elo K=24, somme des variations nulle et mise à jour transactionnelle unique.

## Fonctionnalités restant à développer

- Comptes authentifiés, récupération et identité multi-appareils.
- Matchmaking automatique et saisons de classement.
- Spectateurs et lecteur de replays (les coups de duel sont déjà journalisés).
- Synchronisation temps réel par WebSocket si l’échelle le nécessite.
- Animations détaillées de transfert, avec durées indépendantes du moteur.
- Tests visuels réels sur Safari iOS et Chrome Android, installation PWA et tests de charge.
