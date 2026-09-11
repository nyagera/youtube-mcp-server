import type { VercelRequest, VercelResponse } from "@vercel/node";
import { google } from "googleapis";

/**
 * Google redirige ici après ton autorisation (voir /api/oauth/start).
 * Cette page affiche le refresh token UNE SEULE FOIS : copie-le
 * immédiatement dans les variables d'environnement Vercel
 * (YOUTUBE_REFRESH_TOKEN), puis tu peux fermer/oublier cette page.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const error = req.query.error as string | undefined;

  if (error) {
    res.status(400).send(`Autorisation refusée : ${error}`);
    return;
  }

  if (!code) {
    res.status(400).send("Paramètre 'code' manquant.");
    return;
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);

    if (!tokens.refresh_token) {
      res.status(200).send(`
        <html><body style="font-family: sans-serif; padding: 40px;">
          <h2>⚠️ Pas de refresh_token reçu</h2>
          <p>Google n'envoie un refresh_token que lors du tout premier consentement.
          Révoque l'accès sur
          <a href="https://myaccount.google.com/permissions" target="_blank">myaccount.google.com/permissions</a>
          puis relance <code>/api/oauth/start</code>.</p>
        </body></html>
      `);
      return;
    }

    res.status(200).send(`
      <html><body style="font-family: sans-serif; padding: 40px; max-width: 700px;">
        <h2>✅ Autorisation réussie</h2>
        <p>Copie cette valeur et ajoute-la comme variable d'environnement
        <code>YOUTUBE_REFRESH_TOKEN</code> dans Vercel (Settings &gt; Environment Variables) :</p>
        <pre style="background:#eee; padding:15px; word-break:break-all; white-space:pre-wrap;">${tokens.refresh_token}</pre>
        <p>⚠️ Ne partage jamais cette valeur avec qui que ce soit. Une fois copiée,
        tu peux fermer cette page — elle ne réaffichera plus ce token.</p>
      </body></html>
    `);
  } catch (err: any) {
    res.status(500).send(`Erreur lors de l'échange du code : ${err.message}`);
  }
}
