# Hébergement

## Local

Node 24+ fournit les API natives nécessaires, sans `npm install`.

```bash
npm start
```

L’interface et l’API sont servies par le même processus. Le serveur écoute sur `127.0.0.1:3000` par défaut. Les sessions et les classements sont enregistrés dans `data/arena.sqlite` ; sauvegarder ce répertoire avec la base SQLite et ses fichiers WAL associés, ou arrêter le serveur avant copie.

Variables :

| Variable | Défaut | Usage |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Interface réseau d’écoute |
| `PORT` | `3000` | Port HTTP |
| `DATABASE` | `data/arena.sqlite` | Chemin du fichier SQLite |
| `PUBLIC_ORIGIN` | Origines localhost du port courant | Origine autorisée pour les mutations API, sans barre oblique finale |

## Docker Compose

```bash
docker compose up --build -d
```

Ouvrir exactement `http://localhost:3000` avec la configuration fournie. Le volume `hexa-data` conserve la base lors d’un redémarrage. `docker compose down -v` supprimerait ce volume.

Pour un domaine public derrière un reverse proxy HTTPS, créer un fichier `.env` :

```dotenv
PUBLIC_ORIGIN=https://hexa.example.com
```

Le proxy doit transmettre toute la racine et `/api/` vers `127.0.0.1:3000`. Exemple de Caddyfile :

```caddyfile
hexa.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

Avec une origine HTTPS configurée, les cookies sont marqués `Secure`. L’API refuse les mutations provenant d’une autre origine. Ne pas déployer cette configuration dans un sous-chemin sans adapter les routes du serveur ; l’hébergement complet est prévu à la racine du domaine. Les fichiers frontend seuls restent compatibles avec un sous-chemin GitHub Pages.

## GitHub Pages

Le frontend est un site statique sans compilation. Publier les fichiers racine, `shared/`, les icônes et `legacy/`. Les appels API sans serveur échouent proprement et le solo reste disponible. GitHub Pages n’exécute pas le serveur Node : il ne peut pas fournir le multijoueur ou le ladder.

Le service worker ne met en cache que les fichiers explicitement autorisés du solo. Les réponses API et les pages d’erreur ne remplacent jamais le jeu hors ligne. Après une mise à jour, fermer les anciens onglets permet l’activation du nouveau worker. Incrémenter le nom de cache dans `sw.js` avec les nouvelles versions.

## Capacité et exploitation

Cette première version utilise un processus Node et SQLite local, avec interrogation des salons toutes les 1,5 secondes. Elle vise un petit groupe ou un homelab. Elle n’est pas conçue pour plusieurs réplicas partageant une base distante ni pour des milliers de joueurs simultanés. L’expiration serveur est contrôlée toutes les 15 secondes et lors de l’accès à un salon.

Les salons et journaux de coups sont conservés 30 jours. Les classements et profils persistent ; les sessions expirent après 30 jours. L’identité n’a pas de récupération sans cookie. Pour un service public, prévoir comptes authentifiés, récupération de compte, modération des pseudos, quotas globaux et supervision. Les quotas mémoire actuels sont par processus et ne remplacent pas ceux d’un reverse proxy.
