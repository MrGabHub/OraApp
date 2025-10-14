import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev-only proxy for /api/openai so `npm run dev` works without `vercel dev`.
const devOpenAIProxy = {
  name: "dev-openai-proxy",
  configureServer(server: any) {
    server.middlewares.use("/api/openai", async (req: any, res: any, next: any) => {
      if (req.method !== "POST" && req.method !== "OPTIONS") return next();

      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
      if (req.method === "OPTIONS") { res.statusCode = 204; res.end(); return; }

      try {
        let body = "";
        for await (const chunk of req) body += chunk;
        const payload = JSON.parse(body || "{}");

        const url = new URL(req.url, "http://localhost");
        const wantStream = url.searchParams.get("stream") === "1" || payload?.stream === true;
        const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
        if (!apiKey) { res.statusCode = 500; res.setHeader("Content-Type","application/json"); res.end(JSON.stringify({ error: "Missing OPENAI_API_KEY" })); return; }

        const model = payload?.model || "gpt-4o-mini";
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.6;

        const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            ...(wantStream ? { Accept: "text/event-stream" } : { Accept: "application/json" })
          },
          body: JSON.stringify({ model, messages, temperature, stream: wantStream })
        });
        if (!upstream.ok) {
          const text = await upstream.text();
          res.statusCode = 502; res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: "Upstream error", details: text })); return;
        }

        if (wantStream) {
          res.statusCode = 200;
          res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache, no-transform");
          res.setHeader("Connection", "keep-alive");
          // Pipe chunks
          const reader: any = (upstream as any).body?.getReader?.();
          if (reader) {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              res.write(Buffer.from(value));
            }
            res.end();
          } else {
            (upstream as any).body?.pipe(res);
          }
        } else {
          const text = await upstream.text();
          res.statusCode = 200; res.setHeader("Content-Type", "application/json");
          res.end(text);
        }
      } catch (err: any) {
        res.statusCode = 500; res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ error: "Request failed", details: String(err) }));
      }
    });
  }
};

export default defineConfig(({ mode }) => {
  // Load env (from .env, .env.local). Ensure server middleware can read the key.
  const env = loadEnv(mode, process.cwd(), "");
  if (!process.env.OPENAI_API_KEY) {
    process.env.OPENAI_API_KEY = env.OPENAI_API_KEY || env.VITE_OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  }
  return {
  plugins: [
    react(),
    devOpenAIProxy as any,
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: [
        "favicon.ico",
        "favicon.svg",
        "apple-touch-icon.png",
        "robots.txt"
      ],
      manifest: {
        name: "OraApp",
        short_name: "Ora",
        description: "Mascotte interactive avec suivi du regard",
        theme_color: "#f6e7d3",
        background_color: "#f6e7d3",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable"
          }
        ]
      }
    })
  ]
  };
});
