import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "crypto";

/**
 * ChatGPT/Claude s'enregistrent automatiquement ici avant de démarrer
 * le flow OAuth. Comme ce serveur n'a qu'un seul utilisateur (toi),
 * on accepte n'importe quel client et on lui attribue un identifiant
 * aléatoire — la vraie protection se fait à l'étape /oauth/authorize
 * (mot de passe) et /oauth/token (vérification PKCE).
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "method_not_allowed" });
    return;
  }

  const body = typeof req.body === "object" && req.body ? req.body : {};
  const clientId = randomBytes(16).toString("hex");

  res.status(201).json({
    client_id: clientId,
    client_name: body.client_name || "MCP Client",
    redirect_uris: body.redirect_uris || [],
    token_endpoint_auth_method: "none",
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
  });
}
