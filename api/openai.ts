/*
 Vercel Edge Function proxy for OpenAI Chat Completions
 - Reads OPENAI_API_KEY from env
 - Default model: gpt-4o-mini
 - Supports SSE streaming pass-through when `?stream=1` or body.stream=true
*/

export const config = { runtime: "edge" } as const;

export default async function handler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  let payload: any = {};
  try { payload = await req.json(); } catch {}

  const apiKey = process.env.OPENAI_API_KEY || process.env.NEXT_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing OPENAI_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const model = payload?.model || "gpt-4o-mini";
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.6;
  const wantStream = (new URL(req.url).searchParams.get("stream") === "1") || payload?.stream === true;

  try {
    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(wantStream ? { Accept: "text/event-stream" } : { Accept: "application/json" }),
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
      return new Response(resp.body, {
        status: 200,
        headers: new Headers({
          ...corsHeaders(),
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        }),
      });
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

