import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("hex");
}

export function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function tokensMatch(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
