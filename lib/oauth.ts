import { createHmac, createHash } from "crypto";

/**
 * Implémentation OAuth 2.1 minimale et sans base de données : les
 * "codes" et "tokens" sont simplement des objets JSON signés avec
 * HMAC-SHA256 (donc infalsifiables sans connaître le secret) et
 * encodés en base64url. Rien n'est stocké côté serveur — toute
 * l'information nécessaire pour valider un token est contenue
 * dans le token lui-même, avec sa date d'expiration.
 *
 * Le secret réutilise MCP_AUTH_TOKEN pour éviter d'avoir à gérer
 * une variable d'environnement supplémentaire.
 */
const SECRET = process.env.MCP_AUTH_TOKEN || "";

export type TokenType = "code" | "access" | "refresh";

export interface TokenPayload {
  type: TokenType;
  clientId: string;
  redirectUri?: string;
  codeChallenge?: string;
  exp: number; // timestamp unix (secondes)
}

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function fromBase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

export function signToken(payload: TokenPayload): string {
  const body = base64url(JSON.stringify(payload));
  const sig = createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyToken(token: string, expectedType?: TokenType): TokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  const expectedSig = createHmac("sha256", SECRET).update(body).digest("base64url");
  if (sig !== expectedSig) return null;

  try {
    const payload: TokenPayload = JSON.parse(fromBase64url(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    if (expectedType && payload.type !== expectedType) return null;
    return payload;
  } catch {
    return null;
  }
}

/** Vérifie un code_verifier PKCE (RFC 7636, méthode S256) contre le code_challenge stocké dans le code d'autorisation. */
export function verifyPkce(codeVerifier: string, codeChallenge: string): boolean {
  const hash = createHash("sha256").update(codeVerifier).digest("base64url");
  return hash === codeChallenge;
}
