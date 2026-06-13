import { describe, expect, it } from "vitest";
import { parseDuration } from "./duration";

// Test list:
// - "72h" -> 72 * 60 * 60 * 1000
// - "30m" -> 30 * 60 * 1000
// - "10s" -> 10 * 1000
// - plain number passes through as ms
// - invalid strings throw

describe("parseDuration", () => {
  it("parses weeks", () => {
    expect(parseDuration("2w")).toBe(2 * 7 * 86_400_000);
  });

  it("parses days", () => {
    expect(parseDuration("7d")).toBe(7 * 86_400_000);
  });

  it("parses hours", () => {
    expect(parseDuration("72h")).toBe(72 * 60 * 60 * 1000);
  });

  it("parses minutes", () => {
    expect(parseDuration("30m")).toBe(30 * 60 * 1000);
  });

  it("parses seconds", () => {
    expect(parseDuration("10s")).toBe(10 * 1000);
  });

  it("parses fractional values", () => {
    expect(parseDuration("1.5h")).toBe(1.5 * 60 * 60 * 1000);
  });

  it("passes through numbers as milliseconds", () => {
    expect(parseDuration(5000)).toBe(5000);
  });

  it("throws on an unknown unit", () => {
    expect(() => parseDuration("10x")).toThrow(/invalid duration/i);
  });

  it("throws on a missing value", () => {
    expect(() => parseDuration("h")).toThrow(/invalid duration/i);
  });

  it("throws on an empty string", () => {
    expect(() => parseDuration("")).toThrow(/invalid duration/i);
  });
});
