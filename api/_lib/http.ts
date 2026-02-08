import type { VercelRequest, VercelResponse } from "@vercel/node";

export const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Cron-Secret",
} as const;

export function applyCors(res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", CORS_HEADERS["Access-Control-Allow-Origin"]);
  res.setHeader("Access-Control-Allow-Methods", CORS_HEADERS["Access-Control-Allow-Methods"]);
  res.setHeader("Access-Control-Allow-Headers", CORS_HEADERS["Access-Control-Allow-Headers"]);
}

export function json(res: VercelResponse, status: number, body: unknown) {
  res.status(status);
  applyCors(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.send(JSON.stringify(body));
}

export function handleOptions(req: VercelRequest, res: VercelResponse): boolean {
  if (req.method !== "OPTIONS") return false;
  res.status(204);
  applyCors(res);
  res.end();
  return true;
}

export function getAppBaseUrl(req: VercelRequest): string {
  if (process.env.APP_BASE_URL?.trim()) return process.env.APP_BASE_URL.trim();
  const host = req.headers.host;
  if (!host) throw new Error("Missing host header.");
  const protocol = host.includes("localhost") ? "http" : "https";
  return `${protocol}://${host}`;
}
