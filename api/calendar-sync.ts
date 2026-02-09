import type { VercelRequest, VercelResponse } from "@vercel/node";
import { FieldValue } from "firebase-admin/firestore";
import { buildAvailabilityFromBusy } from "./_lib/availability.js";
import { adminDb } from "./_lib/firebaseAdmin.js";
import { handleOptions, json } from "./_lib/http.js";

export const config = { runtime: "nodejs20.x", maxDuration: 60 } as const;

type TokenRefreshResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type FreeBusyResponse = {
  calendars?: Record<string, { busy?: Array<{ start: string; end: string }> }>;
};

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
  const data = (await resp.json()) as TokenRefreshResponse;
  if (!resp.ok || !data.access_token) {
    const msg = data.error_description || data.error || "Failed to refresh access token.";
    throw new Error(msg);
  }
  return data.access_token;
}

async function fetchBusyBlocks(accessToken: string, timeMin: string, timeMax: string) {
  const resp = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      timeMin,
      timeMax,
      items: [{ id: "primary" }],
    }),
  });
  const data = (await resp.json()) as FreeBusyResponse & { error?: { message?: string } };
  if (!resp.ok) {
    throw new Error(data?.error?.message || "Failed to read freebusy.");
  }
  return data.calendars?.primary?.busy ?? [];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (handleOptions(req, res)) return;
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  const secret = process.env.CALENDAR_SYNC_CRON_SECRET?.trim() || process.env.CRON_SECRET?.trim();
  const headerSecret = (req.headers["x-cron-secret"] as string | undefined)?.trim();
  const authHeader = (req.headers.authorization as string | undefined)?.trim();
  const bearerSecret = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  const provided = headerSecret || bearerSecret;
  if (!secret || provided !== secret) {
    json(res, 401, { error: "Unauthorized" });
    return;
  }

  const start = new Date();
  const end = new Date(start);
  end.setDate(end.getDate() + 14);
  const timeMin = start.toISOString();
  const timeMax = end.toISOString();

  const usersSnap = await adminDb
    .collection("users")
    .where("calendarConsentStatus", "==", "granted")
    .where("calendarSyncEnabled", "==", true)
    .limit(250)
    .get();

  let synced = 0;
  const revoked: string[] = [];
  const failed: Array<{ uid: string; error: string }> = [];

  for (const userDoc of usersSnap.docs) {
    const uid = userDoc.id;
    try {
      const tokenDoc = await adminDb.collection("calendarTokens").doc(uid).get();
      const refreshToken = tokenDoc.data()?.refreshToken as string | undefined;
      if (!refreshToken) {
        failed.push({ uid, error: "Missing refresh token." });
        continue;
      }

      const accessToken = await refreshAccessToken(refreshToken);
      const busy = await fetchBusyBlocks(accessToken, timeMin, timeMax);
      const days = buildAvailabilityFromBusy({
        busy,
        startDate: start,
        days: 14,
        slotMinutes: 30,
      });

      const batch = adminDb.batch();
      for (const [dayKey, slots] of Object.entries(days)) {
        const ref = adminDb.collection("availability").doc(uid).collection("days").doc(dayKey);
        batch.set(
          ref,
          {
            slots,
            source: "google_calendar",
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
      }
      batch.set(
        adminDb.collection("users").doc(uid),
        {
          lastCalendarSyncAt: FieldValue.serverTimestamp(),
          calendarConsentStatus: "granted",
        },
        { merge: true },
      );
      await batch.commit();
      synced += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown sync error.";
      if (/invalid_grant|token has been expired or revoked/i.test(message)) {
        await adminDb.collection("users").doc(uid).set(
          {
            calendarConsentStatus: "revoked",
            calendarSyncEnabled: false,
            updatedAt: FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
        revoked.push(uid);
      } else {
        failed.push({ uid, error: message });
      }
    }
  }

  json(res, 200, {
    ok: true,
    scanned: usersSnap.size,
    synced,
    revoked,
    failed,
  });
}
