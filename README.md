# Ora App

Ora is a React + Vite playground focused on experimenting with planning assistants. The UI exposes a conversational assistant (powered by Groq) and a connections hub where Google Calendar access is granted via Google Sign-In.

## Environment variables

Create `.env.local` and set:

```
GROQ_API_KEY=your_groq_key
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

GROQ powers the assistant API route at `/api/groq`. The front-end uses `VITE_GOOGLE_CLIENT_ID` for OAuth.

## Google Sign-In + Calendar access

1. Enable Google Calendar API, create an OAuth Web Client in Google Cloud.
2. Add your app origins (local and Vercel) to the Authorized JavaScript origins.
3. Place the Client ID in `VITE_GOOGLE_CLIENT_ID`.
4. Sign in with Google once; calendar scopes are requested during the same flow. Tokens are cached in sessionStorage in the current tab.

## Scripts

- `npm run dev` – start Vite
- `npm run build` – type-check and build
- `npm run preview` – preview build
- `npm run lint` – run ESLint

## Notes

- `/api/groq` uses a Node serverless function with SSE piping for streaming responses.
- The Assistant auto-scrolls and shows detailed error messages for easier debugging.

## Friends + background sync

Additional serverless routes:
- `POST /api/calendar-consent-start`
- `GET /api/calendar-consent-callback`
- `POST /api/calendar-sync`

Additional required environment variables:

```
GOOGLE_OAUTH_CLIENT_ID=your_google_oauth_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_google_oauth_client_secret
CALENDAR_OAUTH_STATE_SECRET=long_random_secret
FIREBASE_SERVICE_ACCOUNT_JSON={...}
CALENDAR_SYNC_CRON_SECRET=long_random_secret
APP_BASE_URL=https://your-domain
```

`vercel.json` includes a cron for `/api/calendar-sync` every 15 minutes.
QA checklist: `docs/friends-sync-checklist.md`.
