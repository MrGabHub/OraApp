/*
 Minimal Vercel Serverless Function to proxy chat to xAI Grok.
 Set env var XAI_API_KEY in Vercel (Project Settings → Environment Variables).
*/

export const config = { runtime: "edge" } as const;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing XAI_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const model = payload?.model || "grok-2-mini"; // lightweight Grok
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.7;
  const wantStream = (new URL(req.url).searchParams.get("stream") === "1") || payload?.stream === true;

  try {
    const resp = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, messages, temperature, stream: wantStream }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      return new Response(JSON.stringify({ error: "Upstream error", details: text }), {
        status: 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    if (wantStream) {
      // Pass-through SSE stream from xAI to client
      const headers = new Headers({
        ...corsHeaders(),
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });
      return new Response(resp.body, { status: 200, headers });
    } else {
      const data = await resp.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Request failed", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as const;
}
