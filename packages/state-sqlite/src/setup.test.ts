import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { actions } from "hitl";
import { DatabaseSync } from "node:sqlite";
import { SqliteState } from "./index.js";
import { runSetup } from "./setup.js";

describe("setup command", () => {
  it("creates the default approvals table in a database file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "state-sqlite-setup-"));
    const dbPath = join(dir, "human_requests.db");

    try {
      runSetup(["--db", dbPath]);

      const db = new DatabaseSync(dbPath);
      try {
        const state = new SqliteState(db);
        await state.create({
          id: "a1",
          token: "tok_a1",
          channel: "lead-approvals",
          message: "Approve?",
          actions: actions().approve().build(),
        });
        expect(await state.get("a1")).toMatchObject({ id: "a1", status: "pending" });
      } finally {
        db.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("requires --db", () => {
    expect(() => runSetup([])).toThrow(/--db is required/i);
  });
});
