import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { getYouTubeClient, getAnalyticsClient } from "../lib/google.js";

/**
 * Vérifie le bearer token envoyé par le client MCP (ChatGPT/Claude)
 * contre le secret MCP_AUTH_TOKEN configuré dans Vercel.
 */
function isAuthorized(req: VercelRequest): boolean {
  const header = req.headers["authorization"];
  if (!header || Array.isArray(header)) return false;
  const token = header.replace(/^Bearer\s+/i, "");
  return Boolean(process.env.MCP_AUTH_TOKEN) && token === process.env.MCP_AUTH_TOKEN;
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

  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!isAuthorized(req)) {
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
