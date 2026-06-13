import { field } from "hitl";
import { describe, expect, it } from "vitest";
import { needsModal, parseFieldValue, parseModalValues } from "./fields";

// Test list:
// - needsModal: true when an approval carries fields, false when empty
// - parseFieldValue: confirm yes/no -> boolean, select/text pass through
// - parseModalValues: keys feedbacks by field name, skips absent values,
//   applies the per-kind coercion

describe("needsModal", () => {
  it("is true when fields are present", () => {
    expect(needsModal({ subject: field.textField({ label: "Subject" }) })).toBe(true);
  });

  it("is false when there are no fields", () => {
    expect(needsModal({})).toBe(false);
  });
});

describe("parseFieldValue", () => {
  it("coerces a confirm field's yes/no to a boolean", () => {
    const confirm = field.confirm({ label: "Send?" });
    expect(parseFieldValue(confirm, "yes")).toBe(true);
    expect(parseFieldValue(confirm, "no")).toBe(false);
    expect(parseFieldValue(confirm, "true")).toBe(true);
    expect(parseFieldValue(confirm, "false")).toBe(false);
  });

  it("passes select and text values through unchanged", () => {
    expect(parseFieldValue(field.select({ label: "P", options: ["a", "b"] }), "b")).toBe("b");
    expect(parseFieldValue(field.textField({ label: "S" }), "hello")).toBe("hello");
  });
});

describe("parseModalValues", () => {
  const fields = {
    subject: field.textField({ label: "Subject" }),
    send: field.confirm({ label: "Send?" }),
  };

  it("maps submitted values to feedbacks with coercion", () => {
    expect(parseModalValues(fields, { subject: "Hi", send: "no" })).toEqual({
      subject: "Hi",
      send: false,
    });
  });

  it("skips fields with no submitted value", () => {
    expect(parseModalValues(fields, { subject: "Hi" })).toEqual({ subject: "Hi" });
  });
});
