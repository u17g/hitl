import { describe, expect, it } from "vitest";
import { encodeExternalId, decodeExternalId } from "./external-id";

describe("external-id", () => {
  it("encodes destination and message id", () => {
    expect(encodeExternalId("user:U123", "msg-1")).toBe("user:U123#msg-1");
  });

  it("decodes external id", () => {
    expect(decodeExternalId("user:U123#msg-1")).toEqual({
      destination: "user:U123",
      messageId: "msg-1",
    });
  });
});
