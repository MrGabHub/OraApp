import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireUidFromBearer } from "./_lib/auth.js";
import { getAppBaseUrl, handleOptions, json } from "./_lib/http.js";
import { createOAuthState } from "./_lib/oauthState.js";

export const config = { runtime: "nodejs20.x" } as const;

const GOOGLE_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const stateSecret = process.env.CALENDAR_OAUTH_STATE_SECRET?.trim();
  if (!clientId || !stateSecret) {
    json(res, 500, { error: "Missing OAuth server configuration." });
    return;
  }

  try {
    const uid = await requireUidFromBearer(req);
    const baseUrl = getAppBaseUrl(req);
    const redirectUri = `${baseUrl}/api/calendar-consent-callback`;
    const state = createOAuthState(uid, stateSecret);
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      scope: GOOGLE_SCOPE,
      state,
    });
    json(res, 200, {
      url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
    });
  } catch (error) {
    json(res, 401, { error: error instanceof Error ? error.message : "Unauthorized" });
  }
}
