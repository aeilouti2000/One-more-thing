import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

const dir = mkdtempSync(join(tmpdir(), "omt-icons-"));
let api: TestApi;

beforeAll(async () => {
  api = await startTestApi({ env: { STORAGE_DRIVER: "fs", STORAGE_DIR: dir } });
});

afterAll(async () => {
  await api?.close();
  rmSync(dir, { recursive: true, force: true });
});

async function newHome() {
  const person = await api.signUp("Decorator");
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
  return { ...person, homeId: home.body.id as string };
}

const icons = (home: { token: string; homeId: string }) =>
  api.call("GET", `/homes/${home.homeId}/icons`, { token: home.token });

async function upload(home: { token: string; homeId: string }, fields: Record<string, string>, color = "#c33") {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  const png = await sharp({ create: { width: 900, height: 500, channels: 4, background: color } }).png().toBuffer();
  form.append("file", new Blob([png], { type: "image/png" }), "icon.png");
  return api.call("PUT", `/homes/${home.homeId}/icons/image`, { token: home.token, form });
}

describe("icons for categories and shops", () => {
  it("sets, replaces and resets a category emoji, moving the home's counter", async () => {
    const home = await newHome();
    const before = await api.call("GET", `/homes/${home.homeId}/changes`, { token: home.token });

    const set = await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "category", key: "meat", emoji: "🍗" },
    });
    expect(set.status).toBe(200);
    expect(set.body).toEqual({ kind: "category", key: "meat", label: null, emoji: "🍗", imageId: null });

    const changes = await api.call("GET", `/homes/${home.homeId}/changes?since=${before.body.version}`, {
      token: home.token,
    });
    expect(changes.body.icons).toEqual([set.body]);

    await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "category", key: "meat", emoji: "🥩" },
    });
    expect((await icons(home)).body).toEqual([expect.objectContaining({ key: "meat", emoji: "🥩" })]);

    const reset = await api.call("DELETE", `/homes/${home.homeId}/icons?kind=category&key=meat`, { token: home.token });
    expect(reset.status).toBe(200);
    expect((await icons(home)).body).toEqual([]);
  });

  it("refuses two emoji, plain letters, and a category the home cannot use", async () => {
    const home = await newHome();
    for (const emoji of ["🍗🥩", "a", "ب"]) {
      const response = await api.call("PUT", `/homes/${home.homeId}/icons`, {
        token: home.token,
        body: { kind: "category", key: "meat", emoji },
      });
      expect(response.status).toBe(400);
    }
    const unknown = await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "category", key: "no-such-category", emoji: "🍗" },
    });
    expect(unknown.status).toBe(400);
  });

  it("keys a shop icon by its name, so every spelling of one shop shares it", async () => {
    const home = await newHome();
    await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "shop", name: "  City Mart ", emoji: "🏬" },
    });
    await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "shop", name: "CITY MART", emoji: "🛒" },
    });
    expect((await icons(home)).body).toEqual([
      { kind: "shop", key: "city mart", label: "CITY MART", emoji: "🛒", imageId: null },
    ]);
    const empty = await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "shop", name: "   ", emoji: "🛒" },
    });
    expect(empty.status).toBe(400);
  });

  it("uploads a square image, serves it by redirect, and deletes the old file after a replace", async () => {
    const home = await newHome();
    const first = await upload(home, { kind: "shop", name: "Bakery" });
    expect(first.status).toBe(200);
    const firstId = first.body.imageId as string;
    const file = (id: string) => join(dir, "homes", home.homeId, "icons", `${id}.webp`);
    expect(existsSync(file(firstId))).toBe(true);

    const image = await api.call("GET", `/icons/${firstId}`);
    expect(image.status).toBe(200);
    expect(await sharp(image.raw as Buffer).metadata()).toMatchObject({ format: "webp", width: 192, height: 192 });

    const second = await upload(home, { kind: "shop", name: "bakery" }, "#3c3");
    expect(second.body.imageId).not.toBe(firstId);
    await api.call("POST", "/internal/maintenance/run", { headers: { "x-cron-secret": "test-cron-secret" } });
    expect(existsSync(file(firstId))).toBe(false);
    expect(existsSync(file(second.body.imageId))).toBe(true);

    // Switching to an emoji removes the image file too.
    await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "shop", name: "Bakery", emoji: "🥖" },
    });
    await api.call("POST", "/internal/maintenance/run", { headers: { "x-cron-secret": "test-cron-secret" } });
    expect(existsSync(file(second.body.imageId))).toBe(false);
  });

  it("removes a custom category's icon with the category", async () => {
    const home = await newHome();
    const category = await api.call("POST", `/homes/${home.homeId}/categories`, {
      token: home.token,
      body: { name: "Bakery" },
    });
    expect(category.status).toBe(201);
    await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: home.token,
      body: { kind: "category", key: category.body.id, emoji: "🥐" },
    });
    await api.call("DELETE", `/homes/${home.homeId}/categories/${category.body.id}`, { token: home.token });
    expect((await icons(home)).body).toEqual([]);
  });

  it("limits uploaded icon images to the plan's number", async () => {
    const home = await newHome();
    await api.t.sql(
      `insert into home_icons (home_id, kind, key, image_id)
       select $1, 'shop', 'shop ' || g, gen_random_uuid() from generate_series(1, 100) g`,
      [home.homeId],
    );
    const response = await upload(home, { kind: "shop", name: "One more" });
    expect(response.status).toBe(409);
    expect(response.body.code ?? response.body.error).toBeDefined();
  });

  it("refuses someone who is not in the home", async () => {
    const home = await newHome();
    const stranger = await api.signUp("Stranger");
    const response = await api.call("PUT", `/homes/${home.homeId}/icons`, {
      token: stranger.token,
      body: { kind: "category", key: "meat", emoji: "🍗" },
    });
    expect(response.status).toBe(403);
  });
});
