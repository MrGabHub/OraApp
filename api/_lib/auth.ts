import type { VercelRequest } from "@vercel/node";
import { adminAuth } from "./firebaseAdmin";

export async function requireUidFromBearer(req: VercelRequest): Promise<string> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing bearer token.");
  }
  const token = header.slice("Bearer ".length).trim();
  const decoded = await adminAuth.verifyIdToken(token);
  return decoded.uid;
}
