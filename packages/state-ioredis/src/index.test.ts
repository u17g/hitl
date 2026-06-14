import RedisMock from "ioredis-mock";
import type Redis from "ioredis";
import { describe, expect, it } from "vitest";
import { field, actions } from "@hitl-sdk/hitl";
import { approveFields } from "@hitl-sdk/hitl/adapter";
import type { NewHumanRequestRecord } from "@hitl-sdk/hitl/state";
import { describeStateContract } from "@hitl-sdk/hitl/state-contract";
import { IoredisState } from "./index";

async function freshRedis(): Promise<Redis> {
  const redis = new RedisMock();
  await redis.flushdb();
  return redis;
}

describeStateContract(
  "IoredisState",
  { describe, it, expect },
  async () => {
    const redis = await freshRedis();
    const state = new IoredisState(redis);
    await state.ensureSchema();
    return state;
  },
);

function newRecord(id: string): NewHumanRequestRecord {
  return {
    id,
    token: `tok_${id}`,
    channel: "lead-approvals",
    message: "Inbound lead",
    actions: actions()
      .approve({ fields: { subject: field.textField({ label: "Subject" }) } })
      .build(),
  };
}

describe("IoredisState specifics", () => {
  it("shares records across instances on the same Redis", async () => {
    const redis = await freshRedis();
    const first = new IoredisState(redis);
    await first.create(newRecord("a1"));

    const second = new IoredisState(redis);
    expect(await second.get("a1")).toMatchObject({ id: "a1", status: "pending" });
  });

  it("isolates records under a custom table name", async () => {
    const redis = await freshRedis();
    const defaultTable = new IoredisState(redis);
    const customTable = new IoredisState(redis, { tableName: "custom_approvals" });
    await customTable.create(newRecord("a1"));

    expect(await customTable.get("a1")).not.toBeNull();
    expect(await defaultTable.get("a1")).toBeNull();
  });

  it("rejects table names that are not plain identifiers", async () => {
    const redis = await freshRedis();
    expect(() => new IoredisState(redis, { tableName: 'approvals"; DROP TABLE x' })).toThrow(
      /invalid table name/i,
    );
  });

  it("ensureSchema is idempotent", async () => {
    const redis = await freshRedis();
    const state = new IoredisState(redis);
    await state.ensureSchema();
    await state.ensureSchema();
    await state.create(newRecord("a1"));
    expect(await state.get("a1")).not.toBeNull();
  });

  it("lets exactly one of two concurrent resolves win", async () => {
    const redis = await freshRedis();
    const state = new IoredisState(redis);
    await state.create(newRecord("a1"));

    const outcomes = await Promise.allSettled([
      state.resolve("a1", { type: "RESOLVED", actionId: "approve", id: "a1", externalRef: "", feedbacks: {} }),
      state.resolve("a1", { type: "RESOLVED", actionId: "deny", id: "a1", externalRef: "", feedbacks: {} }),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === "fulfilled");
    expect(fulfilled).toHaveLength(1);
    expect((await state.get("a1"))?.status).toBe("resolved");
  });

  it("round-trips nested field definitions through JSON", async () => {
    const redis = await freshRedis();
    const state = new IoredisState(redis);
    const fields = {
      subject: field.textField({ label: "Subject", default: "Hello" }),
      tier: field.select({ label: "Tier", options: ["gold", "silver"], default: "silver" }),
      confirmed: field.confirm({ label: "Confirm?" }),
    };
    await state.create({ ...newRecord("a1"), actions: actions().approve({ fields }).build() });

    expect(approveFields((await state.get("a1"))!.actions)).toEqual(fields);
  });
});
