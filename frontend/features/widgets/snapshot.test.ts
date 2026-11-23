import assert from "node:assert/strict";
import { test } from "node:test";
import type { Household } from "@/features/homes/types/household";
import type { Pin } from "@/features/items/api/pins";
import type { Purchase } from "@/features/items/types/purchase";
import { buildWidgetSnapshot, compactNumber, type WidgetSnapshotInput } from "./snapshot";

const NOW = new Date(2026, 10, 20, 12, 0);
/** Lines carry an invisible direction mark (see `directed` in snapshot.ts). */
const LTR = "\u200E";
const RTL = "\u200F";
const minutesAgo = (minutes: number) => new Date(NOW.getTime() - minutes * 60_000).toISOString();

const home: Household = {
  id: "home-1",
  name: "Our place",
  inviteCode: "ABC123",
  members: [
    { id: "me", name: "Ahmad", role: "owner" },
    { id: "sara", name: "Sara", role: "partner" },
  ],
  costsEnabled: true,
  currency: "USD",
  askCostOnSingleBuy: true,
  askCostOnBulkBuy: true,
  askCostOnTripEnd: true,
  tripCostMode: "items",
  notificationsEnabled: true,
  monthlyBudget: 500,
  tripAskName: false,
  tripAutoEndHours: null,
  tripSummary: true,
  tripShopTogether: false,
  tripEstimate: true,
  tripAskHome: true,
  monthlyRecap: true,
};

let nextId = 0;
function item(fields: Partial<Purchase> & { name: string }): Purchase {
  nextId += 1;
  return {
    id: `item-${nextId}`,
    quantity: 1,
    category: "other",
    status: "needed",
    urgent: false,
    listId: "list-1",
    addedByName: "Sara",
    addedById: "sara",
    createdAt: minutesAgo(60 * 24 * 30),
    ...fields,
  };
}

function bought(name: string, cost: number, minutes: number, fields: Partial<Purchase> = {}) {
  return item({
    name,
    status: "bought",
    cost,
    boughtAt: minutesAgo(minutes),
    boughtByName: "Ahmad",
    boughtById: "me",
    ...fields,
  });
}

function pin(name: string, fields: Partial<Pin> = {}): Pin {
  return {
    id: `pin-${name}`,
    name,
    quantity: 1,
    category: "other",
    urgent: false,
    intervalDays: 7,
    monthDay: null,
    nextDueAt: NOW.toISOString(),
    listId: null,
    ...fields,
  };
}

function input(fields: Partial<WidgetSnapshotInput> = {}): WidgetSnapshotInput {
  return {
    now: NOW,
    locale: "en",
    theme: { preference: "system", accent: "#2196F3", surfaceDepth: "default" },
    style: { style: "theme", tint: "auto", clarity: 2 },
    user: { id: "me" },
    household: home,
    items: [],
    list: { id: "list-1", title: "List" },
    listCount: 1,
    pins: [],
    ...fields,
  };
}

test("nobody signed in: only a message, in the app's language", () => {
  const snapshot = buildWidgetSnapshot(input({ user: null, household: null }));
  assert.equal(snapshot.state, "signedOut");
  assert.equal(snapshot.messageTitle, "Sign in to see your list");
  assert.deepEqual(snapshot.list.items, []);

  const arabic = buildWidgetSnapshot(input({ user: null, household: null, locale: "ar" }));
  assert.equal(arabic.rtl, true);
  assert.equal(arabic.messageTitle, "سجّل الدخول لعرض قائمتك");
});

test("signed in without a home is its own state", () => {
  const snapshot = buildWidgetSnapshot(input({ household: null }));
  assert.equal(snapshot.state, "noHome");
  assert.equal(snapshot.messageTitle, "No home yet");
});

test("the list shows what is waiting on the app's current list, in its order", () => {
  const snapshot = buildWidgetSnapshot(
    input({
      items: [
        item({ name: "Milk", urgent: true, quantity: 2 }),
        item({ name: "Rice", quantity: 2, unit: "kg" }),
        item({ name: "Chicken", category: "meat" }),
        item({ name: "Salt" }),
        item({ name: "Charcoal", laterAt: minutesAgo(5) }),
        item({ name: "Balloons", listId: "list-2" }),
        item({ name: "Unsaved", id: "temp-1" }),
        bought("Bread", 1, 30),
      ],
    }),
  );
  assert.equal(snapshot.state, "ready");
  assert.equal(snapshot.list.title, "Our place");
  assert.equal(snapshot.list.subtitle, "4 to buy");
  assert.deepEqual(
    snapshot.list.items.map((row) => [row.name, row.flag, row.detail]),
    [
      ["Milk", "Urgent", `${LTR}×2`],
      ["Rice", "", "2 kg"],
      ["Chicken", "", "Meat"],
      ["Salt", "", ""],
    ],
  );
});

test("with several lists the widget names the one it shows", () => {
  const snapshot = buildWidgetSnapshot(
    input({ items: [item({ name: "Milk" })], list: { id: "list-1", title: "Weekly" }, listCount: 2 }),
  );
  assert.equal(snapshot.list.subtitle, "Weekly · 1 to buy");
});

test("a pin is marked when its item already waits on a list, whatever the spelling", () => {
  const snapshot = buildWidgetSnapshot(
    input({
      items: [item({ name: "  milk " }), item({ name: "Eggs", laterAt: minutesAgo(5) }), bought("Coffee", 5, 10)],
      pins: [pin("Milk"), pin("Eggs"), pin("Coffee"), pin("قهوة")],
    }),
  );
  assert.deepEqual(
    snapshot.pins.items.map((tile) => [tile.name, tile.glyph, tile.onList]),
    [
      ["Milk", "M", true],
      ["Eggs", "E", false],
      ["Coffee", "C", false],
      ["قهوة", "ق", false],
    ],
  );
});

test("the pulse groups what one person did in one go, newest first", () => {
  const snapshot = buildWidgetSnapshot(
    input({
      items: [
        item({ name: "Milk", createdAt: minutesAgo(2) }),
        item({ name: "Eggs", createdAt: minutesAgo(3) }),
        item({ name: "Soap", createdAt: minutesAgo(200), addedByName: "Ahmad", addedById: "me" }),
        bought("Bread", 1, 60),
        bought("Rice", 2, 61),
        bought("Oil", 3, 62),
        item({
          name: "Saffron",
          notFoundAt: minutesAgo(90),
          notFoundByName: "Sara",
          notFoundById: "sara",
        }),
        // Too old to mention.
        bought("Old thing", 1, 60 * 24 * 20),
      ],
    }),
  );
  assert.deepEqual(
    snapshot.pulse.items.map((row) => row.text),
    [
      "Sara added Milk +1",
      "You bought 3 items",
      "Sara couldn't find Saffron",
      "You added Soap",
    ].map((line) => `${LTR}${line}`),
  );
  const [first] = snapshot.pulse.items;
  assert.equal(first.initial, "S");
  assert.equal(first.at, NOW.getTime() - 2 * 60_000);
  // One person keeps one colour.
  assert.equal(snapshot.pulse.items[0].color, snapshot.pulse.items[2].color);
});

test("an Arabic line that starts with a Latin name still reads right to left", () => {
  const snapshot = buildWidgetSnapshot(
    input({ locale: "ar", items: [item({ name: "Yogurt", createdAt: minutesAgo(1), quantity: 2 })] }),
  );
  assert.equal(snapshot.pulse.items[0].text, `${RTL}Sara أضاف Yogurt`);
  assert.equal(snapshot.list.items[0].detail, `${LTR}×2`);
});

test("budget: on track shows what is left and the daily pace", () => {
  const snapshot = buildWidgetSnapshot(input({ items: [bought("Shop", 312, 60)] }));
  assert.deepEqual(snapshot.budget, {
    mode: "ring",
    title: "",
    body: "",
    tone: "accent",
    fraction: 312 / 500,
    center: "312",
    centerSub: "of $ 500",
    line1: "$ 188 left",
    // 20 November: 11 days left, today included.
    line2: "11 days · ≈ $ 17.1 a day",
  });
});

test("budget: warns from 80%, and says so when it is passed", () => {
  const near = buildWidgetSnapshot(input({ items: [bought("Shop", 400, 60)] }));
  assert.equal(near.budget.tone, "warn");

  const over = buildWidgetSnapshot(
    input({ items: [bought("Steak", 400, 60, { category: "meat" }), bought("Soap", 134, 50)] }),
  );
  assert.equal(over.budget.tone, "danger");
  assert.equal(over.budget.fraction, 1);
  assert.equal(over.budget.center, "534");
  assert.equal(over.budget.line1, "$ 34 over");
  assert.equal(over.budget.line2, "Most: Meat");
});

test("budget: the last day, no budget, and costs turned off", () => {
  const lastDay = buildWidgetSnapshot(input({ now: new Date(2026, 10, 30, 9), items: [] }));
  assert.equal(lastDay.budget.line2, "Last day of the month");

  const none = buildWidgetSnapshot(
    input({ household: { ...home, monthlyBudget: null }, items: [bought("Shop", 42.5, 60)] }),
  );
  assert.equal(none.budget.fraction, 0);
  assert.equal(none.budget.center, "42.5");
  assert.equal(none.budget.centerSub, "November");
  assert.equal(none.budget.line1, "No budget set");

  const off = buildWidgetSnapshot(input({ household: { ...home, costsEnabled: false } }));
  assert.equal(off.budget.mode, "message");
  assert.equal(off.budget.title, "Costs are off");
});

test("the same data always gives the same text, so nothing redraws for no reason", () => {
  const items = [item({ name: "Milk" }), bought("Bread", 2, 30)];
  const pins = [pin("Milk")];
  assert.equal(
    JSON.stringify(buildWidgetSnapshot(input({ items, pins }))),
    JSON.stringify(buildWidgetSnapshot(input({ items: [...items], pins: [...pins] }))),
  );
});

test("colours: both themes are sent, opaque, and follow the accent", () => {
  const blue = buildWidgetSnapshot(input());
  const green = buildWidgetSnapshot(
    input({ theme: { preference: "dark", accent: "#2E7D32", surfaceDepth: "true" } }),
  );
  assert.equal(blue.themeMode, "system");
  assert.equal(green.themeMode, "dark");
  for (const palette of [blue.light, blue.dark, green.light, green.dark]) {
    for (const value of Object.values(palette)) assert.match(value, /^#[0-9A-F]{6}$/i);
  }
  assert.notEqual(blue.dark.fill, green.dark.fill);
  assert.equal(blue.light.bg, "#FFFFFF");
});

test("the app's glass theme draws ordinary widgets in their dark colours", () => {
  const glass = buildWidgetSnapshot(
    input({ theme: { preference: "glass", accent: "#2196F3", surfaceDepth: "default" } }),
  );
  const dark = buildWidgetSnapshot(
    input({ theme: { preference: "dark", accent: "#2196F3", surfaceDepth: "default" } }),
  );
  assert.equal(glass.themeMode, "dark");
  assert.equal(glass.glass, undefined);
  assert.deepEqual(glass.dark, dark.dark);
});

test("glass widgets: solid colours, with how see-through they are sent apart", () => {
  const glass = (style: Partial<WidgetSnapshotInput["style"]> = {}) =>
    buildWidgetSnapshot(input({ style: { style: "glass", tint: "auto", clarity: 2, ...style } }));

  const auto = glass();
  assert.equal(auto.themeMode, "system");
  assert.equal(glass({ tint: "light" }).themeMode, "light");
  assert.equal(glass({ tint: "dark" }).themeMode, "dark");
  for (const palette of [auto.light, auto.dark]) {
    for (const value of Object.values(palette)) assert.match(value, /^#[0-9A-F]{6}$/i);
  }
  // Light text on the dark tint, dark text on the light one.
  assert.equal(auto.dark.ink, "#F6F8FB");
  assert.equal(auto.light.bg, "#FFFFFF");
  assert.notEqual(auto.light.ink, auto.dark.ink);

  // The slider runs from nearly solid to half see-through.
  assert.equal(glass({ clarity: 0 }).glass?.bg, 0.9);
  assert.equal(auto.glass?.bg, 0.7);
  assert.equal(glass({ clarity: 4 }).glass?.bg, 0.5);
  // Ordinary widgets carry no glass settings at all.
  assert.equal(buildWidgetSnapshot(input()).glass, undefined);
});

test("short numbers for a small widget", () => {
  assert.equal(compactNumber(312.4), "312");
  assert.equal(compactNumber(17.25), "17.3");
  assert.equal(compactNumber(8), "8");
  assert.equal(compactNumber(0), "0");
  assert.equal(compactNumber(Number.NaN), "0");
});
