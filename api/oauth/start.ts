import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";

/**
 * Visite cette URL une seule fois dans ton navigateur pour autoriser
 * l'accès à tes données YouTube et obtenir le refresh token.
 *
 * https://<ton-domaine>.vercel.app/api/oauth/start
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline", // indispensable pour recevoir un refresh_token
    prompt: "consent", // force Google à toujours renvoyer un refresh_token
    scope: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/yt-analytics.readonly",
    ],
  });

  res.redirect(url);
}
