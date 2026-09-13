import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getYouTubeClient, getAnalyticsClient } from "../lib/google.js";
import { verifyToken } from "../lib/oauth.js";

/**
 * Vérifie le bearer token OAuth envoyé par le client MCP (ChatGPT/Claude).
 * Le token doit être un access token signé émis par /api/oauth/token.
 */
function isAuthorized(req: VercelRequest): boolean {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header)) return false;
  const token = header.replace(/^Bearer\s+/i, "");
  return Boolean(verifyToken(token, "access"));
}

function buildServer() {
  const server = new McpServer({
    name: "youtube-mcp-server",
    version: "1.0.0",
  });

  server.tool(
    "get_channel_stats",
    "Récupère les statistiques globales de ta chaîne YouTube : nom, nombre d'abonnés, vues totales, nombre de vidéos.",
    {},
    async () => {
      const youtube = getYouTubeClient();
      const result = await youtube.channels.list({
        part: ["snippet", "statistics"],
        mine: true,
      });
      const channel = result.data.items?.[0];
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              {
                title: channel?.snippet?.title,
                subscribers: channel?.statistics?.subscriberCount,
                totalViews: channel?.statistics?.viewCount,
                videoCount: channel?.statistics?.videoCount,
              },
              null,
              2
            ),
          },
        ],
      };
    }
  );

  server.tool(
    "list_my_videos",
    "Liste les vidéos les plus récentes de ta chaîne YouTube, triées par date de publication.",
    {
      maxResults: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe("Nombre de vidéos à retourner (max 50)"),
    },
    async ({ maxResults }) => {
      const youtube = getYouTubeClient();
      const channelResult = await youtube.channels.list({
        part: ["contentDetails"],
        mine: true,
      });
      const uploadsPlaylistId =
        channelResult.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

      if (!uploadsPlaylistId) {
        return { content: [{ type: "text", text: "Aucune playlist d'uploads trouvée." }] };
      }

      const videosResult = await youtube.playlistItems.list({
        part: ["snippet"],
        playlistId: uploadsPlaylistId,
        maxResults,
      });

      const videos = videosResult.data.items?.map((item) => ({
        title: item.snippet?.title,
        videoId: item.snippet?.resourceId?.videoId,
        publishedAt: item.snippet?.publishedAt,
      }));

      return { content: [{ type: "text", text: JSON.stringify(videos, null, 2) }] };
    }
  );

  server.tool(
    "get_video_analytics",
    "Récupère les analytics d'une vidéo précise (vues, likes, durée moyenne de visionnage, minutes regardées) sur une période donnée.",
    {
      videoId: z.string().describe("L'identifiant de la vidéo YouTube"),
      startDate: z.string().describe("Date de début au format YYYY-MM-DD"),
      endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
    },
    async ({ videoId, startDate, endDate }) => {
      const analytics = getAnalyticsClient();
      const result = await analytics.reports.query({
        ids: "channel==MINE",
        startDate,
        endDate,
        metrics: "views,likes,averageViewDuration,estimatedMinutesWatched",
        filters: `video==${videoId}`,
      });

      return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  server.tool(
    "search_my_videos",
    "Recherche parmi tes propres vidéos YouTube par mot-clé dans le titre/description.",
    {
      query: z.string().describe("Le terme de recherche"),
    },
    async ({ query }) => {
      const youtube = getYouTubeClient();
      const result = await youtube.search.list({
        part: ["snippet"],
        forMine: true,
        type: ["video"],
        q: query,
        maxResults: 25,
      });

      const results = result.data.items?.map((item) => ({
        title: item.snippet?.title,
        videoId: item.id?.videoId,
        publishedAt: item.snippet?.publishedAt,
      }));

      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    }
  );

  server.tool(
    "get_search_keywords",
    "Récupère les mots-clés de recherche YouTube qui apportent des vues, classés du plus au moins performant. " +
      "Utilise la dimension insightTrafficSourceDetail filtrée sur insightTrafficSourceType==YT_SEARCH " +
      "(seul cas où ce détail contient de vrais termes de recherche, pas des titres de vidéos suggérées). " +
      "Peut être filtré par vidéo précise et/ou par pays, et croisé avec le temps (dimension 'day') pour voir " +
      "l'évolution d'un mot-clé. Attention : ces données ont un délai de traitement de 24 à 72h côté Google, " +
      "les vidéos très récentes n'auront donc pas encore de détail exploitable même si les vues brutes sont à jour.",
    {
      startDate: z.string().describe("Date de début au format YYYY-MM-DD"),
      endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
      videoId: z
        .string()
        .optional()
        .describe("Limiter aux mots-clés d'une vidéo précise (optionnel)"),
      country: z
        .string()
        .optional()
        .describe("Code pays ISO 3166-1 alpha-2 (ex: 'FR', 'ES') pour filtrer par zone géographique (optionnel)"),
      byDay: z
        .boolean()
        .default(false)
        .describe("Si true, ajoute la dimension 'day' pour voir l'évolution de chaque mot-clé dans le temps"),
      maxResults: z
        .number()
        .min(1)
        .max(200)
        .default(25)
        .describe("Nombre maximum de mots-clés à retourner (défaut 25)"),
    },
    async ({ startDate, endDate, videoId, country, byDay, maxResults }) => {
      const analytics = getAnalyticsClient();

      const dimensions = byDay
        ? "day,insightTrafficSourceDetail"
        : "insightTrafficSourceDetail";

      const filterParts = ["insightTrafficSourceType==YT_SEARCH"];
      if (videoId) filterParts.push(`video==${videoId}`);
      if (country) filterParts.push(`country==${country}`);

      const result = await analytics.reports.query({
        ids: "channel==MINE",
        startDate,
        endDate,
        metrics: "views",
        dimensions,
        filters: filterParts.join(";"),
        sort: "-views",
        maxResults,
      });

      return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  server.tool(
    "get_search_traffic_trend",
    "Récupère l'évolution jour par jour du nombre de vues venant de la recherche YouTube (toutes requêtes confondues). " +
      "Utile pour voir si le trafic 'recherche' global est en hausse ou en baisse dans le temps. " +
      "Note : l'API YouTube Analytics ne permet pas de croiser la dimension 'day' avec le détail des mots-clés " +
      "(insightTrafficSourceDetail) — cet outil montre donc la tendance agrégée, pas mot-clé par mot-clé. " +
      "Pour ça, utilise get_search_keywords avec un videoId précis à la place. " +
      "Attention : délai de traitement de 24 à 72h côté Google.",
    {
      startDate: z.string().describe("Date de début au format YYYY-MM-DD"),
      endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
      videoId: z
        .string()
        .optional()
        .describe("Limiter à une vidéo précise (optionnel)"),
      country: z
        .string()
        .optional()
        .describe("Code pays ISO 3166-1 alpha-2 (ex: 'FR', 'ES') pour filtrer par zone géographique (optionnel)"),
    },
    async ({ startDate, endDate, videoId, country }) => {
      const analytics = getAnalyticsClient();

      const filterParts = ["insightTrafficSourceType==YT_SEARCH"];
      if (videoId) filterParts.push(`video==${videoId}`);
      if (country) filterParts.push(`country==${country}`);

      const result = await analytics.reports.query({
        ids: "channel==MINE",
        startDate,
        endDate,
        metrics: "views",
        dimensions: "day",
        filters: filterParts.join(";"),
        sort: "day",
      });

      return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  server.tool(
    "get_audience_demographics",
    "Récupère la répartition démographique de ton audience YouTube : pourcentage de vues par tranche d'âge " +
      "(13-17, 18-24, 25-34, 35-44, 45-54, 55-64, 65+) et par genre (masculin/féminin). " +
      "Peut être limité à une vidéo précise et/ou un pays. " +
      "Attention : ces données ont aussi un délai de traitement de 24 à 72h côté Google.",
    {
      startDate: z.string().describe("Date de début au format YYYY-MM-DD"),
      endDate: z.string().describe("Date de fin au format YYYY-MM-DD"),
      videoId: z
        .string()
        .optional()
        .describe("Limiter la démographie à une vidéo précise (optionnel)"),
      country: z
        .string()
        .optional()
        .describe("Code pays ISO 3166-1 alpha-2 (ex: 'FR', 'ES') pour filtrer par zone géographique (optionnel)"),
    },
    async ({ startDate, endDate, videoId, country }) => {
      const analytics = getAnalyticsClient();

      const filterParts: string[] = [];
      if (videoId) filterParts.push(`video==${videoId}`);
      if (country) filterParts.push(`country==${country}`);

      const result = await analytics.reports.query({
        ids: "channel==MINE",
        startDate,
        endDate,
        metrics: "viewerPercentage",
        dimensions: "ageGroup,gender",
        filters: filterParts.length > 0 ? filterParts.join(";") : undefined,
        sort: "-viewerPercentage",
      });

      return { content: [{ type: "text", text: JSON.stringify(result.data, null, 2) }] };
    }
  );

  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
    const origin = `https://${req.headers.host}`;
    res.setHeader(
      "WWW-Authenticate",
      `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`
    );
    res.status(401).json({ error: "Unauthorized: missing or invalid bearer token" });
    return;
  }

  const server = buildServer();

  // Mode stateless : pas de session ID, chaque requête HTTP est
  // traitée indépendamment. Adapté aux fonctions serverless Vercel
  // qui ne maintiennent pas de connexion persistante entre requêtes.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  res.on("close", () => {
    transport.close();
    server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
