import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

const dir = mkdtempSync(join(tmpdir(), "omt-photos-"));
let api: TestApi;

beforeAll(async () => {
  api = await startTestApi({ env: { STORAGE_DRIVER: "fs", STORAGE_DIR: dir } });
});

afterAll(async () => {
  await api?.close();
  rmSync(dir, { recursive: true, force: true });
});

const picture = (color: string) =>
  sharp({ create: { width: 2000, height: 1500, channels: 3, background: color } }).png().toBuffer();

async function itemWithPhoto(color = "#d33") {
  const person = await api.signUp("Photographer");
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
  const homeId = home.body.id as string;
  const item = await api.call("POST", `/homes/${homeId}/items`, {
    token: person.token,
    body: { name: "Cheese", quantity: 1, category: "supermarket" },
  });
  const form = new FormData();
  form.append("image", new Blob([await picture(color)], { type: "image/png" }), "cheese.png");
  const upload = await api.call("PUT", `/items/${item.body.id}/image`, { token: person.token, form });
  expect(upload.status).toBe(200);
  return { ...person, homeId, itemId: item.body.id as string, upload: upload.body };
}

const fileOf = (homeId: string, imageId: string, size: "full" | "thumb") =>
  join(dir, "homes", homeId, "photos", imageId, `${size}.jpg`);

const run = () => api.call("POST", "/internal/maintenance/run", { headers: { "x-cron-secret": "test-cron-secret" } });

describe("photos in object storage", () => {
  it("stores two sizes and a placeholder, and answers with a short-lived redirect", async () => {
    const { homeId, upload } = await itemWithPhoto();
    const imageId = upload.imageId as string;
    expect(upload.imageHash).toEqual(expect.any(String));
    expect(existsSync(fileOf(homeId, imageId, "full"))).toBe(true);
    expect(existsSync(fileOf(homeId, imageId, "thumb"))).toBe(true);

    const [row] = await api.t.sql<{ storage: string; data: Buffer | null; width: number; thumb_bytes: number }>(
      `select storage, data, width, thumb_bytes from item_images where id = $1`,
      [imageId],
    );
    expect(row).toMatchObject({ storage: "object", data: null, width: 1280 });

    const redirect = await api.call("GET", `/item-images/${imageId}?size=thumb`, { redirect: "manual" });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toMatch(new RegExp(`/api/local-files/homes/${homeId}/photos/${imageId}/thumb\\.jpg\\?e=\\d+&s=`));

    const followed = await api.call("GET", `/item-images/${imageId}?size=thumb`);
    expect(followed.status).toBe(200);
    const meta = await sharp(followed.raw as Buffer).metadata();
    expect(meta).toMatchObject({ format: "jpeg", width: 256 });
  });

  it("refuses a local file address with a wrong signature", async () => {
    const { homeId, upload } = await itemWithPhoto();
    const response = await api.call("GET", `/local-files/homes/${homeId}/photos/${upload.imageId}/full.jpg?e=9999999999&s=forged`);
    expect(response.status).toBe(404);
  });

  it("deletes the old photo's files after a replace, through the daily job", async () => {
    const first = await itemWithPhoto("#3a3");
    const oldId = first.upload.imageId as string;
    const form = new FormData();
    form.append("image", new Blob([await picture("#33a")], { type: "image/png" }), "new.png");
    const replaced = await api.call("PUT", `/items/${first.itemId}/image`, { token: first.token, form });
    expect(replaced.body.imageId).not.toBe(oldId);

    const trash = await api.t.sql(`select key from storage_trash where key like $1`, [`%${oldId}%`]);
    expect(trash).toHaveLength(2);
    await run();
    expect(existsSync(fileOf(first.homeId, oldId, "full"))).toBe(false);
    expect(existsSync(fileOf(first.homeId, replaced.body.imageId, "full"))).toBe(true);
  });

  it("deletes a photo's files when its item is deleted", async () => {
    const { token, homeId, itemId, upload } = await itemWithPhoto("#aa3");
    await api.call("POST", "/items/delete", { token, body: { ids: [itemId] } });
    await run();
    expect(existsSync(fileOf(homeId, upload.imageId, "thumb"))).toBe(false);
  });

  it("copies photos kept in Postgres to storage, checked, and keeps their ids", async () => {
    const { homeId, itemId } = await itemWithPhoto("#a3a");
    const legacy = await sharp({ create: { width: 640, height: 480, channels: 3, background: "#123" } }).jpeg().toBuffer();
    const [row] = await api.t.sql<{ id: string }>(
      `insert into item_images (item_id, home_id, mime_type, width, height, data, storage)
       values ($1, $2, 'image/jpeg', 640, 480, $3, 'db') returning id`,
      [itemId, homeId, legacy],
    );
    const copy = await api.call("POST", "/internal/maintenance/copy-photos", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(copy.body).toMatchObject({ copied: 1, remaining: 0, storage: true });
    const [after] = await api.t.sql<{ storage: string; data: Buffer | null; thumbhash: string }>(
      `select storage, data, thumbhash from item_images where id = $1`,
      [row.id],
    );
    expect(after).toMatchObject({ storage: "object", data: null, thumbhash: expect.any(String) });
    expect(existsSync(fileOf(homeId, row.id, "full"))).toBe(true);
  });

  it("refuses a file that is not a photo", async () => {
    const person = await api.signUp("Prankster");
    const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
    const item = await api.call("POST", `/homes/${home.body.id}/items`, {
      token: person.token,
      body: { name: "Thing", quantity: 1, category: "other" },
    });
    const form = new FormData();
    form.append("image", new Blob([Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>")], { type: "image/svg+xml" }), "x.svg");
    const response = await api.call("PUT", `/items/${item.body.id}/image`, { token: person.token, form });
    expect(response.status).toBe(400);
  });
});
