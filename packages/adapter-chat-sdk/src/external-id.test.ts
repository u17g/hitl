import { describe, expect, it } from "vitest";
import { decodeExternalId, encodeExternalId } from "./external-id";

// Test list:
// - encode/decode round-trips, including a channel ref that itself contains ":"
// - decode splits on the first "#" so message ids are preserved verbatim

describe("external-id codec", () => {
  it("round-trips a channel ref and message id", () => {
    const externalId = encodeExternalId("slack:C123", "1700000000.123456");
    expect(externalId).toBe("slack:C123#1700000000.123456");
    expect(decodeExternalId(externalId)).toEqual({
      channel: "slack:C123",
      messageId: "1700000000.123456",
    });
  });

  it("splits on the first '#' only", () => {
    expect(decodeExternalId("teams:conv:1#a#b")).toEqual({
      channel: "teams:conv:1",
      messageId: "a#b",
    });
  });
});
