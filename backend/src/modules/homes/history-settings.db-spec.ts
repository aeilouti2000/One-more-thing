import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { startTestApi, type TestApi } from "../../database/testing/test-api";
import { PLANS } from "../plans/plans";

let api: TestApi;

beforeAll(async () => {
  api = await startTestApi();
});

afterAll(async () => {
  await api?.close();
});

const DAY = 86_400_000;

async function newHome(name = "Host") {
  const person = await api.signUp(name);
  const home = await api.call("POST", "/homes", { token: person.token, body: { name: `${name}'s home` } });
  expect(home.status).toBe(201);
  return { ...person, homeId: home.body.id as string, inviteCode: home.body.inviteCode as string };
}

const choose = (token: string, homeId: string, body: unknown) =>
  api.call("PATCH", `/homes/${homeId}/history-settings`, { token, body });

const columns = async (homeId: string) => {
  const [row] = await api.t.sql<{ history_months: number; history_months_before: number | null; history_months_changed_at: Date | null }>(
    `select history_months, history_months_before, history_months_changed_at from homes where id = $1`,
    [homeId],
  );
  return row;
};

describe("PATCH /homes/:homeId/history-settings", () => {
  it("starts a new home on 3 months with nothing waiting, and says so in the home answer", async () => {
    const host = await newHome();
    const home = await api.call("GET", `/homes/${host.homeId}`, { token: host.token });
    expect(home.body.history).toEqual({ chosen: 3, months: 3, pending: null, options: [3, 6, 12] });
  });

  it("lets only the host change it", async () => {
    const host = await newHome();
    const partner = await api.signUp("Partner");
    const joined = await api.call("POST", "/homes/join", { token: partner.token, body: { code: host.inviteCode } });
    expect(joined.status).toBe(201);
    const response = await choose(partner.token, host.homeId, { historyMonths: 12 });
    expect(response.status).toBe(403);
    expect(response.body.code).toBe("ONLY_HOST_CAN_UPDATE_HISTORY");
    const stranger = await api.signUp("Stranger");
    expect((await choose(stranger.token, host.homeId, { historyMonths: 12 })).status).toBe(403);
    expect((await columns(host.homeId)).history_months).toBe(3);
  });

  it("accepts only 3, 6 or 12", async () => {
    const host = await newHome();
    for (const body of [{ historyMonths: 4 }, { historyMonths: 0 }, { historyMonths: null }, {}, { historyMonths: 12, extra: 1 }]) {
      expect((await choose(host.token, host.homeId, body)).status).toBe(400);
    }
  });

  it("refuses a period above the plan's limit", async () => {
    const host = await newHome();
    const limits = PLANS.early as { historyMonths: number };
    const original = limits.historyMonths;
    limits.historyMonths = 6;
    try {
      const response = await choose(host.token, host.homeId, { historyMonths: 12 });
      expect(response.status).toBe(409);
      expect(response.body.code).toBe("HISTORY_PERIOD_LIMIT");
      const home = await api.call("GET", `/homes/${host.homeId}`, { token: host.token });
      expect(home.body.history.options).toEqual([3, 6]);
    } finally {
      limits.historyMonths = original;
    }
  });

  it("lengthens at once, shortens after a 30-day notice, and going back clears the notice", async () => {
    const host = await newHome();
    const longer = await choose(host.token, host.homeId, { historyMonths: 12 });
    expect(longer.status).toBe(200);
    expect(longer.body.history).toEqual({ chosen: 12, months: 12, pending: null, options: [3, 6, 12] });

    const before = Date.now();
    const shorter = await choose(host.token, host.homeId, { historyMonths: 3 });
    expect(shorter.status).toBe(200);
    expect(shorter.body.history).toMatchObject({ chosen: 3, months: 12, pending: { months: 3 } });
    const from = new Date(shorter.body.history.pending.from).getTime();
    expect(from).toBeGreaterThanOrEqual(before + 30 * DAY - 1000);
    expect(from).toBeLessThanOrEqual(Date.now() + 30 * DAY + 1000);
    expect(await columns(host.homeId)).toMatchObject({ history_months: 3, history_months_before: 12 });

    const back = await choose(host.token, host.homeId, { historyMonths: 12 });
    expect(back.body.history).toMatchObject({ chosen: 12, months: 12, pending: null });
    expect(await columns(host.homeId)).toEqual({
      history_months: 12,
      history_months_before: null,
      history_months_changed_at: null,
    });
  });

  it("changes nothing when the same period is chosen again (the waiting date stays)", async () => {
    const host = await newHome();
    await choose(host.token, host.homeId, { historyMonths: 12 });
    await choose(host.token, host.homeId, { historyMonths: 6 });
    const first = await columns(host.homeId);
    const [{ version }] = await api.t.sql<{ version: string }>(`select version from homes where id = $1`, [host.homeId]);
    const again = await choose(host.token, host.homeId, { historyMonths: 6 });
    expect(again.status).toBe(200);
    expect(await columns(host.homeId)).toEqual(first);
    const [after] = await api.t.sql<{ version: string }>(`select version from homes where id = $1`, [host.homeId]);
    expect(after.version).toBe(version);
  });

  it("reaches the other phones in the next changes answer", async () => {
    const host = await newHome();
    const first = await api.call("GET", `/homes/${host.homeId}/changes`, { token: host.token });
    await choose(host.token, host.homeId, { historyMonths: 6 });
    const next = await api.call("GET", `/homes/${host.homeId}/changes?since=${first.body.version}`, { token: host.token });
    expect(next.body.home.history).toMatchObject({ chosen: 6, months: 6, pending: null });
  });
});
