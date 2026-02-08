export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function buildDefaultHandle(input: {
  uid: string;
  displayName?: string | null;
  email?: string | null;
}): string {
  const baseCandidate = input.displayName ?? (input.email ? input.email.split("@")[0] : "ora");
  let base = normalizeHandle(baseCandidate || "ora");
  if (base.length < 3) base = "ora";
  const suffix = input.uid.slice(0, 4).toLowerCase();
  return `${base}_${suffix}`;
}

export function normalizeEmail(email?: string | null): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}
