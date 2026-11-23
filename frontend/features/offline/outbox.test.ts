import "@/scripts/test-stubs/timers.mjs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOnline, reportRequestFailed, reportRequestOk } from "@/features/offline/network";
import {
  defineChange,
  hasPending,
  onOutboxEvent,
  pendingCount,
  pendingEntries,
  perform,
  send,
  type OutboxEvent,
} from "@/features/offline/outbox";
import { qk, readCache, writeCache } from "@/features/offline/query-client";
import { readThrough } from "@/features/offline/read";
import { isAlreadyGone } from "@/features/offline/rules";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(check: () => boolean, ms = 4000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error("timed out waiting");
    await wait(10);
  }
}

function networkError() {
  // What lib/api does when a request gets no answer.
  reportRequestFailed();
  return Object.assign(new Error("Network request failed"), { code: "NETWORK" });
}

const ran: string[] = [];
const echo = defineChange<{ name: string }, string>("test.echo", async (payload) => {
  ran.push(payload.name);
  await wait(15);
  return payload.name.toUpperCase();
});
const label = (title: string) => ({ action: "add" as const, title });

test("online: a change is sent at once and the answer comes back", async () => {
  ran.length = 0;
  const result = await send(echo, { name: "milk" }, label("Milk"));
  assert.deepEqual(result, { ok: true, queued: false, data: "MILK" });
  assert.equal(pendingCount(), 0);
});

test("offline: changes wait, in order, and go out when the connection returns", async () => {
  ran.length = 0;
  const events: OutboxEvent[] = [];
  const stop = onOutboxEvent((event) => events.push(event));

  reportRequestFailed();
  assert.equal(isOnline(), false);
  const results = await Promise.all(
    ["milk", "bread", "eggs"].map((name) => send(echo, { name }, label(name))),
  );
  assert.deepEqual(results, [
    { ok: true, queued: true },
    { ok: true, queued: true },
    { ok: true, queued: true },
  ]);
  assert.deepEqual(ran, []);
  assert.equal(pendingCount(), 3);
  assert.deepEqual(
    pendingEntries().map((entry) => entry.label.title),
    ["milk", "bread", "eggs"],
  );

  reportRequestOk();
  await until(() => pendingCount() === 0);
  assert.deepEqual(ran, ["milk", "bread", "eggs"]);
  await wait(20);
  // The screens are told to load the server's version once.
  assert.equal(events.filter((event) => event.type === "settled").length >= 1, true);
  assert.equal(events.some((event) => event.type === "refused"), false);
  stop();
});

test("a waiting change the server refuses is dropped and reported; the rest still go", async () => {
  ran.length = 0;
  const events: OutboxEvent[] = [];
  const stop = onOutboxEvent((event) => events.push(event));
  const edit = defineChange<{ id: string }>("test.edit", async (payload) => {
    ran.push(`edit ${payload.id}`);
    throw Object.assign(new Error("Item not found"), { code: "ITEM_NOT_FOUND", status: 404 });
  });

  reportRequestFailed();
  await send(edit, { id: "eggs" }, { action: "edit", title: "Eggs" });
  await send(echo, { name: "milk" }, label("Milk"));
  reportRequestOk();
  await until(() => pendingCount() === 0);
  await wait(20);

  assert.deepEqual(ran, ["edit eggs", "milk"]);
  const refused = events.filter((event) => event.type === "refused");
  assert.equal(refused.length, 1);
  assert.equal(refused[0].type === "refused" && refused[0].entry.label.title, "Eggs");
  stop();
});

test("online: a refusal goes straight back to the screen, not to the outbox", async () => {
  const events: OutboxEvent[] = [];
  const stop = onOutboxEvent((event) => events.push(event));
  const bad = defineChange("test.bad", async () => {
    throw Object.assign(new Error("Nope"), { status: 400 });
  });
  const result = await perform(bad, {}, { action: "edit", title: "X" });
  assert.equal(result.queued, false);
  assert.equal(typeof result.error, "string");
  await wait(20);
  assert.equal(events.some((event) => event.type === "refused"), false);
  stop();
});

test("the connection drops mid-send: the change waits and is sent again later", async () => {
  let tries = 0;
  const flaky = defineChange<{ name: string }, string>("test.flaky", async (payload) => {
    tries += 1;
    if (tries === 1) throw networkError();
    return payload.name;
  });
  const result = await perform(flaky, { name: "milk" }, label("Milk"));
  // The screen is told at once; it does not wait for the connection.
  assert.deepEqual(result, { queued: true, error: null });
  assert.equal(pendingCount(), 1);
  await wait(900);
  reportRequestOk();
  await until(() => pendingCount() === 0);
  assert.equal(tries, 2);
});

test("deleting something already gone counts as done, also after waiting", async () => {
  const events: OutboxEvent[] = [];
  const stop = onOutboxEvent((event) => events.push(event));
  const remove = defineChange(
    "test.remove",
    async () => {
      throw Object.assign(new Error("Item not found"), { status: 404 });
    },
    { tolerate: isAlreadyGone },
  );
  assert.deepEqual(await perform(remove, {}, { action: "delete", count: 1 }), {
    data: undefined,
    queued: false,
    error: null,
  });
  reportRequestFailed();
  await perform(remove, {}, { action: "delete", count: 1 });
  reportRequestOk();
  await until(() => pendingCount() === 0);
  await wait(20);
  assert.equal(events.some((event) => event.type === "refused"), false);
  stop();
});

test("the widget's direct calls skip the queue and report a missing connection", async () => {
  const offlineOnly = defineChange("test.direct", async () => {
    throw networkError();
  });
  const result = await perform(offlineOnly, {}, label("Milk"), { direct: true });
  assert.equal(result.queued, false);
  assert.equal(typeof result.error, "string");
  assert.equal(pendingCount(), 0);
  reportRequestOk();
});

test("waiting changes are saved on the phone", async () => {
  reportRequestFailed();
  await send(echo, { name: "saved" }, label("Saved"));
  // Longer than the short wait before a save.
  await wait(400);
  const stored = JSON.parse(globalThis.localStorage.getItem("omt.query.v1") ?? "{}");
  assert.equal(stored.buster, "test-user");
  const mutations = stored.clientState.mutations as {
    scope?: { id: string };
    state: { variables: { kind: string; label: { title: string } } };
  }[];
  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].state.variables.kind, "test.echo");
  assert.equal(mutations[0].state.variables.label.title, "Saved");
  // The scope is what keeps the order after a restart.
  assert.equal(mutations[0].scope?.id, "omt-outbox");
  reportRequestOk();
  await until(() => pendingCount() === 0);
});

test("loading keeps the phone's copy while a change is still waiting", async () => {
  const key = qk.items("home-1");
  writeCache(key, ["milk (added offline)"]);
  reportRequestFailed();
  await send(echo, { name: "milk" }, label("Milk"));
  assert.equal(hasPending(), true);

  let asked = 0;
  const offline = await readThrough<string[]>(key, async () => {
    asked += 1;
    return ["server list without milk"];
  });
  assert.deepEqual(offline.data, ["milk (added offline)"]);
  assert.equal(offline.offline, true);
  assert.equal(asked, 0);

  reportRequestOk();
  await until(() => pendingCount() === 0);
  const fresh = await readThrough<string[]>(key, async () => ["milk"]);
  assert.deepEqual(fresh.data, ["milk"]);
  assert.equal(fresh.offline, false);
  assert.deepEqual(readCache<string[]>(key), ["milk"]);
});

test("loading falls back to the phone's copy when the server does not answer", async () => {
  const key = qk.lists("home-1");
  writeCache(key, ["Groceries"]);
  const result = await readThrough<string[]>(key, async () => {
    throw networkError();
  });
  assert.deepEqual(result.data, ["Groceries"]);
  assert.equal(result.offline, true);
  assert.equal(result.error, null);

  const nothingSaved = await readThrough<string[]>(qk.pins("home-9"), async () => {
    throw networkError();
  });
  assert.equal(nothingSaved.data, undefined);
  assert.equal(nothingSaved.offline, true);
  reportRequestOk();
});

test("a load that started before a change does not overwrite it", async () => {
  const key = qk.sets("home-1");
  writeCache(key, ["old"]);
  let calls = 0;
  const result = await readThrough<string[]>(key, async () => {
    calls += 1;
    if (calls === 1) {
      // A change is made and saved while the first answer is on its way.
      await send(echo, { name: "during" }, label("During"));
      return ["answer from before the change"];
    }
    return ["answer after the change"];
  });
  assert.equal(calls, 2);
  assert.deepEqual(result.data, ["answer after the change"]);
});

test("slow work in its own lane does not hold up the quick changes", async () => {
  ran.length = 0;
  const upload = defineChange<{ name: string }>(
    "test.upload",
    async (payload) => {
      await wait(300);
      ran.push(`uploaded ${payload.name}`);
    },
    { lane: "photos" },
  );
  const uploading = send(upload, { name: "photo" }, { action: "photo", title: "Milk" });
  const started = Date.now();
  const quick = await send(echo, { name: "bread" }, label("Bread"));
  // Answered while the upload is still running.
  assert.equal(quick.ok && !quick.queued, true);
  assert.equal(Date.now() - started < 250, true);
  await uploading;
  assert.deepEqual(ran, ["bread", "uploaded photo"]);
});
