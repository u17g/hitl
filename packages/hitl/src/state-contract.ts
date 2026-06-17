import { field } from "./fields";
import { actions } from "./human-actions-builder";
import type { HumanRequestRecord, NewHumanRequestRecord, NewBatchRecord, State } from "./state";

/**
 * Test-runner hooks injected by the caller so this module stays free of any
 * runtime dependency on vitest/jest. Pass `{ describe, it, expect }` straight
 * from your test framework.
 */
export interface StateContractApi {
  describe(name: string, fn: () => void): void;
  it(name: string, fn: () => void | Promise<void>): void;
  expect(actual: unknown): any;
}

/**
 * Executable specification every `State` implementation must satisfy.
 * `factory` must return a fresh, empty state on each call.
 */
export function describeStateContract(
  name: string,
  api: StateContractApi,
  factory: () => State | Promise<State>,
): void {
  const { describe, it, expect } = api;

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

  function newBatch(id: string): NewBatchRecord {
    return {
      id,
      channel: "lead-approvals",
      message: "Outbound emails",
    };
  }

  describe(name, () => {
    it("creates and gets a pending record", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));

      const record = await state.get("a1");
      expect(record).toMatchObject({
        id: "a1",
        token: "tok_a1",
        channel: "lead-approvals",
        status: "pending",
      });
      expect(record?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown id", async () => {
      const state = await factory();
      expect(await state.get("missing")).toBeNull();
    });

    it("attaches an external id", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.setExternalId("a1", "slack-ts-123");

      expect((await state.get("a1"))?.externalId).toBe("slack-ts-123");
      expect(await state.findByExternalId("slack-ts-123")).toMatchObject({ id: "a1" });
    });

    it("attaches per-channel external ids for escalation deliveries", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.setExternalId("a1", "slack-ts-primary");
      await state.setExternalId("a1", "slack-ts-oncall", "oncall");

      const record = await state.get("a1");
      expect(record?.externalId).toBe("slack-ts-primary");
      expect(record?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
      expect(await state.findByExternalId("slack-ts-oncall")).toMatchObject({ id: "a1" });
    });

    it("resolves a record with a result", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      const resolved = {
        type: "RESOLVED" as const,
        actionId: "approve" as const,
        id: "a1",
        externalRef: "",
        feedbacks: {},
      };
      await state.resolve("a1", resolved);

      const record = await state.get("a1");
      expect(record?.status).toBe("resolved");
      expect(record?.result).toEqual(resolved);
      expect(record?.resolvedAt).toBeTruthy();
    });

    it("throws when resolving twice", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      const first = {
        type: "RESOLVED" as const,
        actionId: "approve" as const,
        id: "a1",
        externalRef: "",
        feedbacks: {},
      };
      await state.resolve("a1", first);

      await expect(
        state.resolve("a1", {
          type: "RESOLVED",
          actionId: "deny",
          id: "a1",
          externalRef: "",
          feedbacks: {},
        }),
      ).rejects.toThrow(/already resolved/i);
    });

    it("lists pending records only", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));
      await state.resolve("a1", {
        type: "RESOLVED",
        actionId: "approve",
        id: "a1",
        externalRef: "",
        feedbacks: {},
      });

      const pending = await state.list({ status: "pending" });
      expect(pending.items.map((r) => r.id)).toEqual(["a2"]);

      const all = await state.list();
      expect(all.items).toHaveLength(2);
    });

    it("lists resolved records only", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));
      await state.resolve("a1", {
        type: "RESOLVED",
        actionId: "approve",
        id: "a1",
        externalRef: "",
        feedbacks: {},
      });

      const resolved = await state.list({ status: "resolved" });
      expect(resolved.items.map((r) => r.id)).toEqual(["a1"]);
    });

    it("pages results newest-first via limit and cursor", async () => {
      const state = await factory();
      const ids = ["a1", "a2", "a3", "a4", "a5"];
      for (const id of ids) await state.create(newRecord(id));

      const seen: HumanRequestRecord[] = [];
      let cursor: string | undefined;
      let pages = 0;
      let lastCursor: string | undefined;
      do {
        const page = await state.list({ limit: 2, cursor });
        expect(page.items.length).toBeLessThanOrEqual(2);
        seen.push(...page.items);
        lastCursor = page.nextCursor;
        cursor = page.nextCursor;
        expect(++pages).toBeLessThan(10); // guard against runaway loops
      } while (cursor);

      // Covers everything exactly once.
      expect(seen.map((r) => r.id).sort()).toEqual([...ids].sort());
      expect(new Set(seen.map((r) => r.id)).size).toBe(ids.length);
      // Last page exposes no further cursor.
      expect(lastCursor).toBeUndefined();
      // Globally newest-first: non-increasing in (createdAt desc, id desc).
      for (let i = 1; i < seen.length; i++) {
        const prev = seen[i - 1]!;
        const curr = seen[i]!;
        const ordered =
          prev.createdAt > curr.createdAt ||
          (prev.createdAt === curr.createdAt && prev.id >= curr.id);
        expect(ordered).toBe(true);
      }
    });

    it("paginates within a status filter", async () => {
      const state = await factory();
      for (const id of ["p1", "p2", "p3"]) await state.create(newRecord(id));
      await state.create(newRecord("r1"));
      await state.resolve("r1", {
        type: "RESOLVED",
        actionId: "approve",
        id: "r1",
        externalRef: "",
        feedbacks: {},
      });

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await state.list({ status: "pending", limit: 2, cursor });
        seen.push(...page.items.map((r) => r.id));
        cursor = page.nextCursor;
      } while (cursor);

      expect(new Set(seen)).toEqual(new Set(["p1", "p2", "p3"]));
    });

    it("returns null for an unknown external id", async () => {
      const state = await factory();
      expect(await state.findByExternalId("missing")).toBeNull();
    });

    it("finds a record by resume token", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      await state.create(newRecord("a2"));

      expect(await state.findByToken("tok_a2")).toMatchObject({ id: "a2" });
    });

    it("returns null for an unknown token", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      expect(await state.findByToken("missing")).toBeNull();
    });

    it("throws when attaching an external id to an unknown human request", async () => {
      const state = await factory();
      await expect(state.setExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown human request/i,
      );
    });

    it("throws when resolving an unknown human request", async () => {
      const state = await factory();
      await expect(
        state.resolve("missing", {
          type: "RESOLVED",
          actionId: "approve",
          id: "missing",
          externalRef: "",
          feedbacks: {},
        }),
      ).rejects.toThrow(/unknown human request/i);
    });

    it("creates and gets a batch", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));

      const batch = await state.getBatch("b1");
      expect(batch).toMatchObject({
        id: "b1",
        channel: "lead-approvals",
        message: "Outbound emails",
      });
      expect(batch?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown batch id", async () => {
      const state = await factory();
      expect(await state.getBatch("missing")).toBeNull();
    });

    it("attaches a batch external id", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.setBatchExternalId("b1", "slack-ts-123");

      const batch = await state.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-123");
    });

    it("attaches per-channel batch external ids for escalation deliveries", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.setBatchExternalId("b1", "slack-ts-primary");
      await state.setBatchExternalId("b1", "slack-ts-oncall", "oncall");

      const batch = await state.getBatch("b1");
      expect(batch?.externalId).toBe("slack-ts-primary");
      expect(batch?.externalIds).toEqual({
        "lead-approvals": "slack-ts-primary",
        oncall: "slack-ts-oncall",
      });
    });

    it("throws when attaching an external id to an unknown batch", async () => {
      const state = await factory();
      await expect(state.setBatchExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown batch/i,
      );
    });

    it("round-trips batchId and batchIndex on human request records", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 0 });

      const record = await state.get("a1");
      expect(record?.batchId).toBe("b1");
      expect(record?.batchIndex).toBe(0);
    });

    it("lists batch items in batch index order regardless of insertion order", async () => {
      const state = await factory();
      await state.createBatch(newBatch("b1"));
      await state.create({ ...newRecord("a2"), batchId: "b1", batchIndex: 2 });
      await state.create({ ...newRecord("a0"), batchId: "b1", batchIndex: 0 });
      await state.create({ ...newRecord("a1"), batchId: "b1", batchIndex: 1 });
      await state.create(newRecord("loose"));

      const items = await state.listByBatch("b1");
      expect(items.map((r) => r.id)).toEqual(["a0", "a1", "a2"]);
    });

    it("returns an empty list for an unknown batch", async () => {
      const state = await factory();
      await state.create(newRecord("a1"));
      expect(await state.listByBatch("missing")).toEqual([]);
    });

    it("appends and lists timeline entries by thread id", async () => {
      const state = await factory();
      await state.appendTimeline({
        id: "t1",
        threadId: "step-1",
        message: "CRM context",
        detail: { link: "https://example.com" },
        createdAt: "2026-01-01T00:00:00.000Z",
      });
      await state.appendTimeline({
        id: "t2",
        threadId: "step-1",
        message: "Follow-up",
        createdAt: "2026-01-01T00:01:00.000Z",
      });

      expect(await state.timeline("step-1")).toEqual([
        {
          id: "t1",
          threadId: "step-1",
          message: "CRM context",
          detail: { link: "https://example.com" },
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "t2",
          threadId: "step-1",
          message: "Follow-up",
          createdAt: "2026-01-01T00:01:00.000Z",
        },
      ]);
      expect(await state.timeline("missing")).toEqual([]);
    });

    it("creates and gets a notify delivery record", async () => {
      const state = await factory();
      await state.createNotifyDelivery({
        id: "n1",
        channel: "lead-approvals",
        message: "Deploy started",
        groupId: "step-1",
      });

      const delivery = await state.getNotifyDelivery("n1");
      expect(delivery).toMatchObject({
        id: "n1",
        channel: "lead-approvals",
        message: "Deploy started",
        groupId: "step-1",
      });
      expect(delivery?.createdAt).toBeTruthy();
    });

    it("returns null for an unknown notify delivery id", async () => {
      const state = await factory();
      expect(await state.getNotifyDelivery("missing")).toBeNull();
    });

    it("attaches an external id to a notify delivery", async () => {
      const state = await factory();
      await state.createNotifyDelivery({
        id: "n1",
        channel: "lead-approvals",
        message: "ping",
        groupId: "step-1",
      });
      await state.setNotifyDeliveryExternalId("n1", "slack-ts-123");

      expect((await state.getNotifyDelivery("n1"))?.externalId).toBe("slack-ts-123");
    });

    it("throws when attaching an external id to an unknown notify delivery", async () => {
      const state = await factory();
      await expect(state.setNotifyDeliveryExternalId("missing", "slack-ts-123")).rejects.toThrow(
        /unknown notify delivery/i,
      );
    });
  });
}
