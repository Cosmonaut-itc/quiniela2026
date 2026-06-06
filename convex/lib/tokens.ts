// convex/lib/tokens.ts
export function newToken(): string {
  // Web Crypto is available in the Convex runtime.
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}
