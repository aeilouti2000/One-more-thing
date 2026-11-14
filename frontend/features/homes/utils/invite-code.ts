import { normalizeDigits } from "@/lib/numbers";

/** Invite codes look like OMT-1A2B3C4D: a fixed prefix and eight characters (digits and A–F). */
export const INVITE_PREFIX = "OMT-";
export const INVITE_LENGTH = 8;

/**
 * The eight characters after "OMT-", from whatever was typed or pasted: a bare
 * code, a full code, or a whole shared message that contains one.
 *
 * Every letter and digit is kept, so the field always answers a key press; a
 * wrong code is reported when it's sent, not by swallowing what was typed.
 */
export function invitePart(input: string) {
  // Arabic keyboards type their own digits; the code uses Western ones.
  const text = normalizeDigits(input).toUpperCase();
  // A full code inside other text (the shared message).
  const full = /OMT[-\s]+([0-9A-Z]{1,8})/.exec(text);
  if (full) return full[1];
  const plain = text.replace(/[^0-9A-Z]/g, "");
  // Someone typing the prefix themselves: it's already in front of the field.
  return (plain.startsWith("OMT") ? plain.slice(3) : plain).slice(0, INVITE_LENGTH);
}

export function isInviteComplete(part: string) {
  return part.length === INVITE_LENGTH;
}

/** The code as the server knows it. */
export function fullInviteCode(part: string) {
  return `${INVITE_PREFIX}${part}`;
}
