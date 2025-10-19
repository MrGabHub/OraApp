/*
 Vercel Serverless Function proxy for Groq Chat Completions API.
 - Reads GROQ_API_KEY (or VITE_GROQ_API_KEY) from env.
 - Default model: llama-3.1-8b-instant (fallback even if env has deprecated values).
 - Supports SSE streaming via ?stream=1 or body.stream=true.
*/

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { Readable } from "node:stream";

export const config = { runtime: "nodejs20.x" } as const;

type Payload = {
  model?: string;
  messages?: any[];
  temperature?: number;
  stream?: boolean;
};

const BASE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
} as const;

function applyCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", BASE_HEADERS["Access-Control-Allow-Origin"]);
  res.setHeader("Access-Control-Allow-Methods", BASE_HEADERS["Access-Control-Allow-Methods"]);
  res.setHeader("Access-Control-Allow-Headers", BASE_HEADERS["Access-Control-Allow-Headers"]);
}

function sendJson(res: VercelResponse, status: number, body: unknown) {
  res.status(status);
  res.setHeader("Content-Type", "application/json");
  applyCors(res);
  res.send(JSON.stringify(body));
}

async function readBody(req: VercelRequest): Promise<string> {
  if (typeof req.body === "string") return req.body;
  if (req.body && typeof req.body === "object") return JSON.stringify(req.body);

  return await new Promise<string>((resolve, reject) => {
    let data = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => resolve(data));
    req.on("error", (err) => reject(err));
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "OPTIONS") {
    res.status(204);
    applyCors(res);
    res.end();
    return;
  }

  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  let payload: Payload = {};
  try {
    const raw = await readBody(req);
    if (raw) {
      payload = JSON.parse(raw);
    }
  } catch (err) {
    console.error("[groq] Failed to parse request body", err);
    sendJson(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const apiKey = (process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || "")
    .toString()
    .trim();
  if (!apiKey) {
    console.error("[groq] Missing GROQ_API_KEY environment variable.");
    sendJson(res, 500, { error: "Missing GROQ_API_KEY" });
    return;
  }

  const payloadModel = typeof payload?.model === "string" ? payload.model.trim() : "";
  const envModelRaw = (process.env.GROQ_MODEL || "").toString().trim();
  const deprecatedPattern = /^llama3-.*-8192$/i;
  const envModel = envModelRaw && !deprecatedPattern.test(envModelRaw) ? envModelRaw : "";
  const fallbackModel = "llama-3.1-8b-instant";
  const model = payloadModel || envModel || fallbackModel;
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const temperature = typeof payload?.temperature === "number" ? payload.temperature : 0.6;

  const queryStreamParam = req.query?.stream;
  const queryStream =
    typeof queryStreamParam === "string"
      ? queryStreamParam === "1" || queryStreamParam.toLowerCase() === "true"
      : Array.isArray(queryStreamParam)
      ? queryStreamParam.some((value) => value === "1" || value.toLowerCase() === "true")
      : false;

  const wantStream = payload?.stream === true || queryStream;

  try {
    const upstream = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        ...(wantStream ? { Accept: "text/event-stream" } : { Accept: "application/json" }),
      },
      body: JSON.stringify({ model, messages, temperature, stream: wantStream }),
    });

    if (!upstream.ok) {
      const text = await upstream.text();
      console.error("[groq] Upstream error", upstream.status, text);
      sendJson(res, 502, { error: "Upstream error", details: text, model });
      return;
    }

    if (wantStream) {
      if (!upstream.body) {
        sendJson(res, 502, { error: "Upstream stream missing", model });
        return;
      }

      res.status(200);
      applyCors(res);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");

      const readable = Readable.fromWeb(upstream.body as any);
      readable.on("error", (err) => {
        console.error("[groq] Stream piping error", err);
        if (!res.headersSent) {
          sendJson(res, 500, { error: "Stream piping error", details: String(err) });
        } else {
          res.end();
        }
      });
      readable.pipe(res);
    } else {
      const data = await upstream.json();
      sendJson(res, 200, data);
    }
  } catch (err: any) {
    console.error("[groq] Request failed", err);
    sendJson(res, 500, { error: "Request failed", details: String(err) });
  }
}

