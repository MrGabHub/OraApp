# Friends + Auto-Sync QA Checklist

## 1. Firebase / Vercel pre-check
1. Firestore rules deployed from `firestore.rules`.
2. Vercel env vars set:
   - `GOOGLE_OAUTH_CLIENT_ID`
   - `GOOGLE_OAUTH_CLIENT_SECRET`
   - `CALENDAR_OAUTH_STATE_SECRET`
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `CALENDAR_SYNC_CRON_SECRET` (or `CRON_SECRET`)
   - `APP_BASE_URL` (recommended)
3. Google Cloud OAuth redirect URI:
   - `https://<your-domain>/api/calendar-consent-callback`
   - `http://localhost:5173/api/calendar-consent-callback` (local)

## 2. Friend request flow
1. User A searches user B by email.
2. A sends request.
3. B sees incoming request.
4. B accepts request.
5. B is redirected to Google consent.
6. After consent, B returns to app.

Expected:
- `friendRequests/{A_B}.status == "accepted"`
- `friendRequests/{A_B}.toAutoSync == true`
- both users see each other in friends list

## 3. Consent persistence
1. Open Firestore doc `users/{B}`.
2. Verify:
   - `calendarConsentStatus == "granted"`
   - `calendarSyncEnabled == true`
3. Verify doc exists:
   - `calendarTokens/{B}` with `refreshToken`

## 4. Auto-sync execution
1. Trigger manually:
   - `POST /api/calendar-sync`
   - header `Authorization: Bearer <CALENDAR_SYNC_CRON_SECRET>`
2. Check response JSON:
   - `ok: true`
   - `synced >= 1`

Expected in Firestore:
- `availability/{B}/days/{YYYY-MM-DD}` created/updated
- slots contain only `free|busy` + `confidenceLevel`
- no event title/location stored

## 5. Friend availability read
1. User A opens Friends page after B synced.
2. A sees B status (`free` / `busy` / `stale`).

Expected:
- No permissions error.
- No raw event details visible.

## 6. Negative tests
1. B declines Google consent:
   - Request should still be accepted.
   - `calendarConsentStatus` should not be `granted`.
2. Revoke Google access in Google account:
   - next sync should mark user as revoked and disable sync.
3. Unauthorized cron call:
   - `/api/calendar-sync` without secret must return 401.

