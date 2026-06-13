import { afterEach, describe, expect, it, vi } from "vitest";
import { authorizeInternalApi, timingSafeEqualString } from "./auth";

describe("timingSafeEqualString", () => {
  it("matches equal strings", () => {
    expect(timingSafeEqualString("secret-1", "secret-1")).toBe(true);
  });

  it("rejects different strings of equal length", () => {
    expect(timingSafeEqualString("secret-1", "secret-2")).toBe(false);
  });

  it("rejects strings of different length", () => {
    expect(timingSafeEqualString("secret", "secret-longer")).toBe(false);
  });

  it("rejects empty against non-empty", () => {
    expect(timingSafeEqualString("", "secret")).toBe(false);
  });
});

describe("authorizeInternalApi", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function request(headers?: Record<string, string>): Request {
    return new Request("http://hitl.test/.well-known/hitldev/v1/requests", {
      method: "POST",
      headers,
    });
  }

  it("accepts a matching bearer token", () => {
    expect(
      authorizeInternalApi(request({ authorization: "Bearer s3cret" }), "s3cret"),
    ).toBe(true);
  });

  it("rejects a wrong bearer token", () => {
    expect(
      authorizeInternalApi(request({ authorization: "Bearer wrong" }), "s3cret"),
    ).toBe(false);
  });

  it("rejects a missing authorization header", () => {
    expect(authorizeInternalApi(request(), "s3cret")).toBe(false);
  });

  it("rejects a non-bearer authorization header", () => {
    expect(authorizeInternalApi(request({ authorization: "Basic s3cret" }), "s3cret")).toBe(false);
  });

  it("skips auth and warns once when no secret is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(authorizeInternalApi(request(), undefined)).toBe(true);
    expect(authorizeInternalApi(request(), undefined)).toBe(true);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/HITL_SECRET/);
  });
});
