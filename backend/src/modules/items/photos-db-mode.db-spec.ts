import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import sharp from "sharp";
import { startTestApi, type TestApi } from "../../database/testing/test-api";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi({ env: { STORAGE_DRIVER: "db" } });
});

afterAll(async () => {
  await api?.close();
});

describe("photos while no object storage is set up (STORAGE_DRIVER=db)", () => {
  it("keeps the photo in Postgres, with its placeholder, and serves the bytes as before", async () => {
    const person = await api.signUp("Classic");
    const home = await api.call("POST", "/homes", { token: person.token, body: { name: "Home" } });
    const item = await api.call("POST", `/homes/${home.body.id}/items`, {
      token: person.token,
      body: { name: "Bread", quantity: 1, category: "supermarket" },
    });
    const png = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#eb4" } }).png().toBuffer();
    const form = new FormData();
    form.append("image", new Blob([png], { type: "image/png" }), "bread.png");
    const upload = await api.call("PUT", `/items/${item.body.id}/image`, { token: person.token, form });
    expect(upload.status).toBe(200);
    expect(upload.body.imageHash).toEqual(expect.any(String));

    const [row] = await api.t.sql<{ storage: string; has_data: boolean }>(
      `select storage, data is not null as has_data from item_images where id = $1`,
      [upload.body.imageId],
    );
    expect(row).toEqual({ storage: "db", has_data: true });

    const response = await api.call("GET", `/item-images/${upload.body.imageId}`, { redirect: "manual" });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/jpeg");

    const copy = await api.call("POST", "/internal/maintenance/copy-photos", {
      headers: { "x-cron-secret": "test-cron-secret" },
    });
    expect(copy.body).toMatchObject({ copied: 0, storage: false });
  });
});
