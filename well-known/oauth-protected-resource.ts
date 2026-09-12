import type { VercelRequest, VercelResponse } from "@vercel/node";

export default function handler(req: VercelRequest, res: VercelResponse) {
  const origin = `https://${req.headers.host}`;

  res.status(200).json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
}
