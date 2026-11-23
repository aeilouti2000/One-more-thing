import "@/scripts/test-stubs/timers.mjs";
// Installs the in-memory storage the app's cache is saved in.
import "expo-sqlite/localStorage/install";
import assert from "node:assert/strict";
import { test } from "node:test";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function savedChange(name: string, submittedAt: number) {
  return {
    mutationKey: ["outbox"],
    scope: { id: "omt-outbox" },
    state: {
      context: undefined,
      data: undefined,
      error: null,
      failureCount: 0,
      failureReason: null,
      // One was on its way when the app closed, the others were waiting.
      isPaused: name !== "milk",
      status: "pending",
      variables: { kind: "test.saved", payload: { name }, label: { action: "add", title: name }, at: submittedAt },
      submittedAt,
    },
  };
}

test("after the app was closed: the saved lists are back and waiting changes are sent in order", async () => {
  const now = Date.now();
  // What the last run left on the phone.
  globalThis.localStorage.setItem(
    "omt.query.v1",
    JSON.stringify({
      buster: "test-user",
      timestamp: now,
      clientState: {
        queries: [
          {
            queryKey: ["items", "home-1"],
            queryHash: '["items","home-1"]',
            state: {
              data: [{ id: "milk", name: "Milk" }],
              dataUpdateCount: 1,
              dataUpdatedAt: now,
              error: null,
              errorUpdateCount: 0,
              errorUpdatedAt: 0,
              fetchFailureCount: 0,
              fetchFailureReason: null,
              fetchMeta: null,
              isInvalidated: false,
              status: "success",
              fetchStatus: "idle",
            },
          },
        ],
        mutations: [savedChange("milk", now - 3000), savedChange("bread", now - 2000), savedChange("eggs", now - 1000)],
      },
    }),
  );

  // The app starts: these read the saved copy as they load.
  const { qk, readCache } = await import("@/features/offline/query-client");
  const { defineChange, pendingCount, pendingEntries, resumeOutbox } = await import(
    "@/features/offline/outbox"
  );

  assert.deepEqual(readCache(qk.items("home-1")), [{ id: "milk", name: "Milk" }]);
  assert.equal(pendingCount(), 3);
  assert.deepEqual(
    pendingEntries().map((entry) => entry.label.title),
    ["milk", "bread", "eggs"],
  );

  const sent: string[] = [];
  defineChange<{ name: string }>("test.saved", async (payload) => {
    sent.push(payload.name);
    await wait(10);
  });
  resumeOutbox();
  const end = Date.now() + 4000;
  while (pendingCount() > 0 && Date.now() < end) await wait(10);
  assert.equal(pendingCount(), 0);
  assert.deepEqual(sent, ["milk", "bread", "eggs"]);
});

test("another person's saved copy is never used", async () => {
  // Checked on the saved file's owner, without loading it into this run.
  const stored = JSON.parse(globalThis.localStorage.getItem("omt.query.v1") ?? "{}");
  assert.equal(stored.buster, "test-user");
  const { setCacheOwner, readCache, qk } = await import("@/features/offline/query-client");
  setCacheOwner("someone-else");
  assert.equal(readCache(qk.items("home-1")), undefined);
  assert.equal(globalThis.localStorage.getItem("omt.query.v1"), null);
});
