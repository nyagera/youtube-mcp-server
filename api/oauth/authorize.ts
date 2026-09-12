import type { VercelRequest, VercelResponse } from "@vercel/node";
import { signToken } from "../../lib/oauth.js";

function renderForm(params: Record<string, string>, error?: string) {
  const hidden = Object.entries(params)
    .map(([key, value]) => `<input type="hidden" name="${key}" value="${escapeHtml(value)}" />`)
    .join("\n");

  return `
    <html>
      <head><meta charset="utf-8" /><title>Autoriser l'accès</title></head>
      <body style="font-family: sans-serif; max-width: 420px; margin: 80px auto; padding: 0 20px;">
        <h2>🔐 Autoriser l'accès à tes données YouTube</h2>
        <p>Un client MCP (ChatGPT, Claude, ...) demande à accéder à tes outils YouTube.</p>
        ${error ? `<p style="color: #c00;">${escapeHtml(error)}</p>` : ""}
        <form method="POST">
          ${hidden}
          <label for="password" style="display:block; margin-bottom: 6px;">Mot de passe (ton MCP_AUTH_TOKEN) :</label>
          <input type="password" name="password" id="password" style="width:100%; padding:8px; margin-bottom: 16px;" autofocus />
          <button type="submit" style="padding: 8px 20px;">Autoriser</button>
        </form>
      </body>
    </html>
  `;
}

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  const query = req.query as Record<string, string>;

  const params = {
    response_type: query.response_type || "code",
    client_id: query.client_id || "",
    redirect_uri: query.redirect_uri || "",
    state: query.state || "",
    code_challenge: query.code_challenge || "",
    code_challenge_method: query.code_challenge_method || "S256",
    scope: query.scope || "",
  };

  if (req.method === "GET") {
    if (!params.redirect_uri) {
      res.status(400).send("Paramètre redirect_uri manquant.");
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(renderForm(params));
    return;
  }

  if (req.method === "POST") {
    const body = typeof req.body === "object" && req.body ? req.body : {};
    const submittedParams = { ...params, ...body };
    const password = body.password || "";

    if (!process.env.MCP_AUTH_TOKEN || password !== process.env.MCP_AUTH_TOKEN) {
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.status(401).send(renderForm(submittedParams, "Mot de passe incorrect."));
      return;
    }

    const code = signToken({
      type: "code",
      clientId: submittedParams.client_id,
      redirectUri: submittedParams.redirect_uri,
      codeChallenge: submittedParams.code_challenge,
      exp: Math.floor(Date.now() / 1000) + 300, // 5 minutes
    });

    const redirectUrl = new URL(submittedParams.redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (submittedParams.state) redirectUrl.searchParams.set("state", submittedParams.state);

    res.redirect(302, redirectUrl.toString());
    return;
  }

  res.status(405).json({ error: "method_not_allowed" });
}
