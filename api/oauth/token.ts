import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signToken, verifyToken, verifyPkce } from "../../lib/oauth.js";

const ACCESS_TOKEN_TTL = 60 * 60; // 1 heure
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 90; // 90 jours

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const grantType = body.grant_type;

  if (grantType === "authorization_code") {
    const { code, redirect_uri, code_verifier, client_id } = body;

    if (!code || !code_verifier) {
      res.status(400).json({ error: "invalid_request", error_description: "code et code_verifier requis" });
      return;
    }

    const payload = verifyToken(code, "code");
    if (!payload) {
      res.status(400).json({ error: "invalid_grant", error_description: "Code invalide ou expiré" });
      return;
    }

    if (payload.redirectUri && redirect_uri && payload.redirectUri !== redirect_uri) {
      res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri ne correspond pas" });
      return;
    }

    if (payload.codeChallenge && !verifyPkce(code_verifier, payload.codeChallenge)) {
      res.status(400).json({ error: "invalid_grant", error_description: "code_verifier invalide (PKCE)" });
      return;
    }

    const clientId = client_id || payload.clientId;
    const now = Math.floor(Date.now() / 1000);

    const accessToken = signToken({ type: "access", clientId, exp: now + ACCESS_TOKEN_TTL });
    const refreshToken = signToken({ type: "refresh", clientId, exp: now + REFRESH_TOKEN_TTL });

    res.status(200).json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
    });
    return;
  }

  if (grantType === "refresh_token") {
    const { refresh_token } = body;

    if (!refresh_token) {
      res.status(400).json({ error: "invalid_request", error_description: "refresh_token requis" });
      return;
    }

    const payload = verifyToken(refresh_token, "refresh");
    if (!payload) {
      res.status(400).json({ error: "invalid_grant", error_description: "refresh_token invalide ou expiré" });
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const accessToken = signToken({ type: "access", clientId: payload.clientId, exp: now + ACCESS_TOKEN_TTL });

    res.status(200).json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
    });
    return;
  }

  res.status(400).json({ error: "unsupported_grant_type" });
}
