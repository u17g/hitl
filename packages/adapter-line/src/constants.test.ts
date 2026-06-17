import { describe, expect, it } from "vitest";
import { encodePostback, parsePostback, POSTBACK_KIND_ACTION } from "./constants";

describe("postback payload", () => {
  it("round-trips action payload", () => {
    const data = encodePostback({ k: POSTBACK_KIND_ACTION, r: "req-1", a: "approve" });
    expect(parsePostback(data)).toEqual({ k: POSTBACK_KIND_ACTION, r: "req-1", a: "approve" });
  });

  it("returns undefined for invalid json", () => {
    expect(parsePostback("not-json")).toBeUndefined();
  });
});
