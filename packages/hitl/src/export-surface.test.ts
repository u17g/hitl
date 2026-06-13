import { describe, expect, it } from "vitest";
import * as main from "./index";

/** Runtime exports allowed on the main `hitl` entry — workflow DSL + server only. */
const ALLOWED_RUNTIME_EXPORTS = [
  "ActionsBuilder",
  "DEFAULT_ESCALATE_MESSAGE",
  "DEFAULT_REMIND_MESSAGE",
  "Hitl",
  "WEEKEND_DAYS",
  "actions",
  "escalate",
  "escalateMessage",
  "field",
  "isEscalate",
  "isResolved",
  "remind",
  "remindMessage",
] as const;

describe("main export surface", () => {
  it("exposes only workflow and server runtime symbols", () => {
    expect(Object.keys(main).sort()).toEqual([...ALLOWED_RUNTIME_EXPORTS].sort());
  });
});
