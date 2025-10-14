import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Dev-only proxy for /api/hf so `npm run dev` works without `vercel dev`.
const devHFProxy = {
  name: "dev-hf-proxy",
  configureServer(server: any) {
    server.middlewares.use("/api/hf", async (req: any, res: any, next: any) => {
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
        const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY || process.env.VITE_HUGGINGFACE_API_KEY || process.env.VITE_HF_API_KEY;
        if (!apiKey) { res.statusCode = 500; res.setHeader("Content-Type","application/json"); res.end(JSON.stringify({ error: "Missing HUGGINGFACE_API_KEY/HF_API_KEY" })); return; }

        const model = payload?.model || "HuggingFaceH4/zephyr-7b-beta";
        const messages = Array.isArray(payload?.messages) ? payload.messages : [];
        const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.6;

        const buildPrompt = (msgs: any[]) => {
          let sys = "You are ORA, a concise time-planning assistant."; const parts: string[] = [];
          for (const m of msgs) { if (m.role === 'system') { sys = m.content; continue; } if (m.role==='user') parts.push(`User: ${m.content}`); if (m.role==='assistant') parts.push(`Assistant: ${m.content}`); }
          return `${sys}\n${parts.join("\n")}\nAssistant:`;
        };
        const prompt = buildPrompt(messages);

        const upstream = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "Accept": "application/json"
          },
          body: JSON.stringify({ inputs: prompt, parameters: { max_new_tokens: 256, temperature, return_full_text: false, repetition_penalty: 1.05, top_p: 0.9 } })
        });
        const text = await upstream.text();
        if (!upstream.ok) { res.statusCode = 502; res.setHeader("Content-Type","application/json"); res.end(JSON.stringify({ error: "Upstream error", details: text })); return; }
        res.statusCode = 200; res.setHeader("Content-Type", "application/json"); res.end(text);
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
  if (!process.env.HUGGINGFACE_API_KEY && !process.env.HF_API_KEY) {
    process.env.HUGGINGFACE_API_KEY = env.HUGGINGFACE_API_KEY || env.VITE_HUGGINGFACE_API_KEY || env.HF_API_KEY || env.VITE_HF_API_KEY || process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  }
  return {
  plugins: [
    react(),
    devHFProxy as any,
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
