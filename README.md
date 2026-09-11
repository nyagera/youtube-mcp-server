# youtube-mcp-server

Serveur MCP (Model Context Protocol) exposant tes données YouTube
personnelles (chaîne, vidéos, analytics) comme outils utilisables
depuis ChatGPT, Claude, ou tout autre client compatible MCP.

## Outils exposés

- `get_channel_stats` — abonnés, vues totales, nombre de vidéos
- `list_my_videos` — dernières vidéos publiées
- `get_video_analytics` — vues, likes, durée de visionnage sur une période
- `search_my_videos` — recherche dans tes propres vidéos

## Installation

```bash
npm install
```

## Configuration

1. Les 4 premières variables d'environnement (`GOOGLE_CLIENT_ID`,
   `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `MCP_AUTH_TOKEN`)
   doivent déjà être configurées dans Vercel (Settings > Environment
   Variables).

2. **Obtenir le refresh token** (une seule fois) :
   - Déploie ce projet sur Vercel
   - Visite `https://<ton-domaine>.vercel.app/api/oauth/start`
   - Connecte-toi avec ton compte Google (celui lié à ta chaîne YouTube)
   - Accepte les permissions demandées
   - Copie le `refresh_token` affiché sur la page de callback
   - Ajoute-le comme variable d'environnement `YOUTUBE_REFRESH_TOKEN`
     dans Vercel, puis **redéploie** le projet

## Connexion depuis ChatGPT / Claude

Ajoute un connecteur MCP personnalisé avec :
- **URL** : `https://<ton-domaine>.vercel.app/api/mcp`
- **Header d'authentification** : `Authorization: Bearer <ton MCP_AUTH_TOKEN>`

## Sécurité

- Ne commite jamais de fichier `.env` contenant de vraies valeurs
  (voir `.env.example` pour la liste des variables nécessaires)
- Le `MCP_AUTH_TOKEN` protège l'accès à `/api/mcp` — ne le partage
  avec personne
- Le `refresh_token` n'est affiché qu'une seule fois lors du premier
  flow OAuth
