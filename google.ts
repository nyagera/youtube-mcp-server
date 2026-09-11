import { google } from "googleapis";

/**
 * Construit un client OAuth2 authentifié avec le refresh token
 * stocké dans les variables d'environnement Vercel.
 *
 * Le refresh token ne périme pas (sauf révocation manuelle depuis
 * https://myaccount.google.com/permissions), donc pas besoin de
 * refaire le flow OAuth complet à chaque appel : la lib googleapis
 * échange automatiquement le refresh token contre un access token
 * frais à chaque requête.
 */
function getOAuth2Client() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  oauth2Client.setCredentials({
    refresh_token: process.env.YOUTUBE_REFRESH_TOKEN,
  });

  return oauth2Client;
}

export function getYouTubeClient() {
  const auth = getOAuth2Client();
  return google.youtube({ version: "v3", auth });
}

export function getAnalyticsClient() {
  const auth = getOAuth2Client();
  return google.youtubeAnalytics({ version: "v2", auth });
}
