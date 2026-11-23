type RandomSource = { getRandomValues?: (bytes: Uint8Array) => Uint8Array; randomUUID?: () => string };

/**
 * An id made on the phone (UUID v4). The server saves a new item, list, pin or
 * set under it, so a change made without internet can be sent again later
 * without making a second copy.
 */
export function newId(): string {
  const source = (globalThis as { crypto?: RandomSource }).crypto;
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof source?.getRandomValues === "function") source.getRandomValues(bytes);
  else for (let index = 0; index < 16; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
