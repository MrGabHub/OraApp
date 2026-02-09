import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { getAppBaseUrl } from "./_lib/http.js";
import { verifyOAuthState } from "./_lib/oauthState.js";

export const config = { runtime: "nodejs20.x" } as const;

function htmlResult(ok: boolean, message: string, baseUrl: string, friendUid?: string): string {
  const safe = message.replace(/[<>&]/g, "");
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const redirectUrl = `${normalizedBaseUrl}/?tab=friends&calendarConsent=${ok ? "ok" : "error"}`;
  const safeRedirectUrl = redirectUrl.replace(/"/g, "&quot;");
  const safeFriendUid = (friendUid ?? "").replace(/"/g, "");
  return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Aura Calendar Consent</title></head>
<body style="font-family: Arial, sans-serif; padding: 20px;">
  <h3>${ok ? "Consentement enregistre" : "Echec du consentement"}</h3>
  <p>${safe}</p>
  <script>
    (function () {
      var payload = { type: "aura-calendar-consent", ok: ${ok ? "true" : "false"}, friendUid: "${safeFriendUid}" };
      try { localStorage.setItem("aura-calendar-consent-result", JSON.stringify(payload)); } catch (e) {}
      if (window.opener) {
        try { window.opener.postMessage(payload, "*"); } catch (e) {}
        window.setTimeout(function () { try { window.close(); } catch (e) {} }, 200);
        return;
      }
      window.location.replace("${safeRedirectUrl}");
    })();
  </script>
</body>
</html>`;
}

function isTokenRevokedError(message: string): boolean {
  return /invalid_grant|token has been expired or revoked/i.test(message);
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new Error("Missing Google OAuth credentials.");
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  const data: any = await resp.json();
  if (!resp.ok || !data?.access_token) {
    const msg = data?.error_description || data?.error || "Failed to refresh access token.";
    throw new Error(msg);
  }
  return data.access_token as string;
}

async function ensureFriendShareAcl(ownerAccessToken: string, friendEmail: string) {
  const aclResp = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/acl", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ownerAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      role: "reader",
      scope: { type: "user", value: friendEmail },
    }),
  });
  if (aclResp.ok) return;
  const aclJson: any = await aclResp.json().catch(() => ({}));
  const reason =
    aclJson?.error?.errors?.[0]?.reason ??
    aclJson?.error?.status ??
    aclJson?.error?.message ??
    "";
  if (aclResp.status === 409 || reason === "duplicate") {
    return;
  }
  throw new Error(
    typeof aclJson?.error?.message === "string"
      ? aclJson.error.message
      : `Failed to share calendar (HTTP ${aclResp.status}).`,
  );
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "GET") {
    res.status(405).send("Method not allowed");
    return;
  }

  const baseUrl = getAppBaseUrl(req);

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) {
    res.status(400).send(htmlResult(false, "Parametres OAuth manquants.", baseUrl));
    return;
  }

  const stateSecret = process.env.CALENDAR_OAUTH_STATE_SECRET?.trim();
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  if (!stateSecret || !clientId || !clientSecret) {
    res.status(500).send(htmlResult(false, "Configuration OAuth serveur incomplete.", baseUrl));
    return;
  }

  try {
    const payload = verifyOAuthState(state, stateSecret);
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
    const accessToken = typeof tokenJson.access_token === "string" ? tokenJson.access_token : null;
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

    if (payload.action === "friend_share" && payload.friendUid) {
      const friendRequestIdA = `${payload.uid}_${payload.friendUid}`;
      const friendRequestIdB = `${payload.friendUid}_${payload.uid}`;
      const [requestA, requestB] = await Promise.all([
        adminDb.collection("friendRequests").doc(friendRequestIdA).get(),
        adminDb.collection("friendRequests").doc(friendRequestIdB).get(),
      ]);
      const accepted =
        (requestA.exists && requestA.data()?.status === "accepted") ||
        (requestB.exists && requestB.data()?.status === "accepted");
      if (!accepted) {
        throw new Error("Friend request is not accepted. Calendar sharing denied.");
      }

      const friendUser = await adminDb.collection("users").doc(payload.friendUid).get();
      const friendEmail = friendUser.data()?.email as string | undefined;
      if (!friendEmail) {
        throw new Error("Friend email not found.");
      }

      const ownerAccessToken = accessToken ?? (await refreshAccessToken(effectiveRefresh));
      await ensureFriendShareAcl(ownerAccessToken, friendEmail);

      if (requestA.exists && requestA.data()?.status === "accepted") {
        await requestA.ref.set(
          {
            fromCalendarShared: true,
          },
          { merge: true },
        );
      } else if (requestB.exists && requestB.data()?.status === "accepted") {
        await requestB.ref.set(
          {
            toCalendarShared: true,
          },
          { merge: true },
        );
      }
    }

    await adminDb.collection("users").doc(payload.uid).set(
      {
        calendarConsentStatus: "granted",
        calendarSyncEnabled: true,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    res
      .status(200)
      .send(htmlResult(true, "La synchronisation automatique est activee.", baseUrl, payload.friendUid));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Consent flow failed.";
    if (isTokenRevokedError(message)) {
      try {
        const payload = verifyOAuthState(state, stateSecret);
        await adminDb.collection("users").doc(payload.uid).set(
          {
            calendarConsentStatus: "revoked",
            calendarSyncEnabled: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      } catch {
        // Ignore fallback update errors and return the original consent error.
      }
    }
    res.status(400).send(htmlResult(false, message, baseUrl));
  }
}
