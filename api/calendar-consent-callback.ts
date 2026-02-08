import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_lib/firebaseAdmin";
import { getAppBaseUrl } from "./_lib/http";
import { verifyOAuthState } from "./_lib/oauthState";

export const config = { runtime: "nodejs20.x" } as const;

function htmlResult(ok: boolean, message: string): string {
  const safe = message.replace(/[<>&]/g, "");
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Aura Calendar Consent</title></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h3>${ok ? "Consentement enregistre" : "Echec du consentement"}</h3>
  <p>${safe}</p>
  <script>
    if (window.opener) { window.opener.postMessage({ type: "aura-calendar-consent", ok: ${ok ? "true" : "false"} }, "*"); window.close(); }
  </script>
</body>
</html>`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    res.status(400).send(htmlResult(false, "Parametres OAuth manquants."));
    return;
  }

  const stateSecret = process.env.CALENDAR_OAUTH_STATE_SECRET?.trim();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!stateSecret || !clientId || !clientSecret) {
    res.status(500).send(htmlResult(false, "Configuration OAuth serveur incomplete."));
    return;
  }

  try {
    const payload = verifyOAuthState(state, stateSecret);
    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/api/calendar-consent-callback`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }).toString(),
    });
    const tokenJson: any = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenJson?.error_description || tokenJson?.error || "Token exchange failed.");
    }

    const refreshToken = typeof tokenJson.refresh_token === "string" ? tokenJson.refresh_token : null;
    const tokenRef = adminDb.collection("calendarTokens").doc(payload.uid);
    const existing = await tokenRef.get();
    const existingRefresh = existing.exists ? (existing.data()?.refreshToken as string | undefined) : undefined;
    const effectiveRefresh = refreshToken ?? existingRefresh;
    if (!effectiveRefresh) {
      throw new Error("Google did not return a refresh token.");
    }

    await tokenRef.set(
      {
        refreshToken: effectiveRefresh,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    await adminDb.collection("users").doc(payload.uid).set(
      {
        calendarConsentStatus: "granted",
        calendarSyncEnabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res.status(200).send(htmlResult(true, "La synchronisation automatique est activee."));
  } catch (error) {
    res.status(400).send(htmlResult(false, error instanceof Error ? error.message : "Consent flow failed."));
  }
}
