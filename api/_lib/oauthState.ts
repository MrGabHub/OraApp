import crypto from "node:crypto";

type StatePayload = {
  uid: string;
  ts: number;
  nonce: string;
  action?: "friend_share";
  friendUid?: string;
};

function base64url(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function unbase64url(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

export function createOAuthState(
  uid: string,
  secret: string,
  extra?: { action?: "friend_share"; friendUid?: string },
): string {
  const payload: StatePayload = {
    uid,
    ts: Date.now(),
    nonce: crypto.randomBytes(12).toString("hex"),
    action: extra?.action,
    friendUid: extra?.friendUid,
  };
  const encoded = base64url(JSON.stringify(payload));
  const signature = sign(encoded, secret);
  return `${encoded}.${signature}`;
}

export function verifyOAuthState(state: string, secret: string, maxAgeMs = 10 * 60 * 1000): StatePayload {
  const [encoded, provided] = state.split(".");
  if (!encoded || !provided) throw new Error("Invalid state format.");
  const expected = sign(encoded, secret);
  if (!crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) {
    throw new Error("Invalid state signature.");
  }
  const payload = JSON.parse(unbase64url(encoded)) as StatePayload;
  if (!payload.uid || !payload.ts) throw new Error("Invalid state payload.");
  if (Date.now() - payload.ts > maxAgeMs) throw new Error("Expired state.");
  return payload;
}
