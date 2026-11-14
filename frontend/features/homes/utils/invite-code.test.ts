import assert from "node:assert/strict";
import { test } from "node:test";
import { fullInviteCode, invitePart, isInviteComplete } from "./invite-code";

test("keeps the code's eight characters, in capitals", () => {
  assert.equal(invitePart("1a2b3c4d"), "1A2B3C4D");
  assert.equal(invitePart("1a2b 3c4d99"), "1A2B3C4D");
  assert.equal(invitePart("omt-1a2b3c4d"), "1A2B3C4D");
  assert.equal(invitePart("OMT1A2B"), "1A2B");
  // Any letter is accepted while typing; symbols and spaces are not.
  assert.equal(invitePart("hello"), "HELLO");
  assert.equal(invitePart("ab-c d."), "ABCD");
  // Typing the prefix by hand doesn't end up in the code.
  assert.equal(invitePart("omt"), "");
  assert.equal(invitePart("omt-"), "");
});

test("finds the code inside a shared message", () => {
  assert.equal(
    invitePart("Join my home on One More Thing with this invite code: OMT-0FA91C3E"),
    "0FA91C3E",
  );
});

test("builds the full code", () => {
  assert.equal(isInviteComplete("1A2B3C4"), false);
  assert.equal(isInviteComplete("1A2B3C4D"), true);
  assert.equal(fullInviteCode("1A2B3C4D"), "OMT-1A2B3C4D");
});

test("accepts digits typed on an Arabic keyboard", () => {
  assert.equal(invitePart("١A٢B٣C٤D"), "1A2B3C4D");
});
