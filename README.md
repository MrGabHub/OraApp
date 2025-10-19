# Ora App

Ora is a React + Vite playground focused on experimenting with planning assistants. The UI exposes a conversational assistant (powered by Groq) and a connections hub where external services like Google Calendar can be linked.

## Environment variables

Create `.env.local` and set:

```
GROQ_API_KEY=your_groq_key
VITE_GOOGLE_CLIENT_ID=your_google_oauth_client_id
```

GROQ powers the assistant API route at `/api/groq`. The front-end uses `VITE_GOOGLE_CLIENT_ID` for OAuth.

## Google Calendar connection

1. Enable Google Calendar API, create an OAuth Web Client in Google Cloud.
2. Add your app origins (local and Vercel) to the Authorized JavaScript origins.
3. Place the Client ID in `VITE_GOOGLE_CLIENT_ID`.
4. Toggle Google Calendar in the Connections view to sign in. Tokens are kept in sessionStorage in the current tab.

## Scripts

- `npm run dev` – start Vite
- `npm run build` – type-check and build
- `npm run preview` – preview build
- `npm run lint` – run ESLint

## Notes

- `/api/groq` uses a Node serverless function with SSE piping for streaming responses.
- The Assistant auto-scrolls and shows detailed error messages for easier debugging.
