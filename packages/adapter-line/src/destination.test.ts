import { describe, expect, it } from "vitest";
import { parseDestination, destinationFromSource } from "./destination";

describe("destination", () => {
  it("parses user destination", () => {
    expect(parseDestination("user:Uabc")).toEqual({
      kind: "user",
      ref: "user:Uabc",
      to: "Uabc",
    });
  });

  it("parses group destination", () => {
    expect(parseDestination("group:Cabc")).toEqual({
      kind: "group",
      ref: "group:Cabc",
      to: "Cabc",
    });
  });

  it("throws on invalid prefix", () => {
    expect(() => parseDestination("slack:C123")).toThrow(/user:, group:, or room:/);
  });

  it("maps webhook source to destination ref", () => {
    expect(destinationFromSource({ type: "user", userId: "U1" })).toBe("user:U1");
    expect(destinationFromSource({ type: "group", groupId: "C1", userId: "U1" })).toBe("group:C1");
  });
});
