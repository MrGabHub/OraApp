/*
 Vercel Edge Function proxy for Hugging Face Inference API
 - Reads HUGGINGFACE_API_KEY or HF_API_KEY from env
 - Default model: HuggingFaceH4/zephyr-7b-beta (chat/instruct)
 - Non-streaming (returns a single JSON with { content })
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

  const apiKey = process.env.HUGGINGFACE_API_KEY || process.env.HF_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing HUGGINGFACE_API_KEY/HF_API_KEY" }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }

  const model = payload?.model || (process.env.HF_MODEL || "HuggingFaceH4/zephyr-7b-beta");
  const messages: Array<{ role: string; content: string }> = Array.isArray(payload?.messages) ? payload.messages : [];
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.6;
  const maxNewTokens = typeof payload?.max_new_tokens === "number" ? payload.max_new_tokens : 256;

  const prompt = buildPrompt(messages);

  try {
    const resp = await fetch(`https://api-inference.huggingface.co/models/${encodeURIComponent(model)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: maxNewTokens,
          temperature,
          return_full_text: false,
          repetition_penalty: 1.05,
          top_p: 0.9,
        },
      }),
    });

    const text = await resp.text();
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: "Upstream error", details: text }), {
        status: 502,
        headers: { ...corsHeaders(), "Content-Type": "application/json" },
      });
    }

    let data: any;
    try { data = JSON.parse(text); } catch { data = text; }
    let content = "";
    if (Array.isArray(data) && data[0]?.generated_text) content = String(data[0].generated_text);
    else if (typeof data === "object" && data?.generated_text) content = String(data.generated_text);
    else if (typeof data === "string") content = data;

    return new Response(JSON.stringify({ content }), {
      status: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: "Request failed", details: String(err) }), {
      status: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
    });
  }
}

function buildPrompt(messages: Array<{ role: string; content: string }>): string {
  if (!messages?.length) return "You are ORA, a helpful planner.\nUser: Hi\nAssistant:";
  let sys = "You are ORA, a concise time-planning assistant.";
  let parts: string[] = [];
  for (const m of messages) {
    if (m.role === "system") { sys = m.content; continue; }
    if (m.role === "user") parts.push(`User: ${m.content}`);
    if (m.role === "assistant") parts.push(`Assistant: ${m.content}`);
  }
  return `${sys}\n${parts.join("\n")}\nAssistant:`;
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  } as const;
}

