import { afterEach, describe, expect, it } from "vitest";
import { getDatabaseUrl } from "./db-url.js";

describe("getDatabaseUrl", () => {
  const keys = ["HITL_POSTGRES_URL", "DATABASE_URL", "WORKFLOW_POSTGRES_URL"] as const;

  afterEach(() => {
    for (const key of keys) delete process.env[key];
  });

  it("prefers HITL_POSTGRES_URL", () => {
    process.env.HITL_POSTGRES_URL = "postgres://hitl";
    process.env.DATABASE_URL = "postgres://app";
    process.env.WORKFLOW_POSTGRES_URL = "postgres://wdk";
    expect(getDatabaseUrl()).toBe("postgres://hitl");
  });

  it("falls back to DATABASE_URL", () => {
    process.env.DATABASE_URL = "postgres://app";
    process.env.WORKFLOW_POSTGRES_URL = "postgres://wdk";
    expect(getDatabaseUrl()).toBe("postgres://app");
  });

  it("falls back to WORKFLOW_POSTGRES_URL", () => {
    process.env.WORKFLOW_POSTGRES_URL = "postgres://wdk";
    expect(getDatabaseUrl()).toBe("postgres://wdk");
  });

  it("throws when none are set", () => {
    expect(() => getDatabaseUrl()).toThrow(/HITL_POSTGRES_URL/);
  });
});
