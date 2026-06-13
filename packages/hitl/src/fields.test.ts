import { describe, expect, expectTypeOf, it } from "vitest";
import { field, type FeedbackValues, type HitlField } from "./fields";

// Test list:
// - textField / textArea / select / confirm carry kind, label, default
// - select carries options
// - FeedbackValues maps text fields to string, confirm to boolean,
//   select to the union of its option values

describe("field builders", () => {
  it("textField carries label and default", () => {
    expect(field.textField({ label: "Subject", default: "Hello" })).toEqual({
      kind: "text",
      label: "Subject",
      default: "Hello",
    });
  });

  it("textArea carries label and default", () => {
    expect(field.textArea({ label: "Body" })).toEqual({
      kind: "textarea",
      label: "Body",
      default: undefined,
    });
  });

  it("select carries options and default", () => {
    expect(
      field.select({ label: "Priority", options: ["low", "high"], default: "low" }),
    ).toEqual({
      kind: "select",
      label: "Priority",
      options: ["low", "high"],
      default: "low",
    });
  });

  it("confirm carries label and default", () => {
    expect(field.confirm({ label: "CC sales?", default: true })).toEqual({
      kind: "confirm",
      label: "CC sales?",
      default: true,
    });
  });
});

describe("FeedbackValues type inference", () => {
  it("infers value types per field kind", () => {
    const fields = {
      subject: field.textField({ label: "Subject" }),
      body: field.textArea({ label: "Body" }),
      priority: field.select({ label: "Priority", options: ["low", "high"] }),
      ccSales: field.confirm({ label: "CC sales?" }),
    };

    expectTypeOf<FeedbackValues<typeof fields>>().toEqualTypeOf<{
      subject: string;
      body: string;
      priority: "low" | "high";
      ccSales: boolean;
    }>();
  });

  it("every builder result is assignable to HitlField", () => {
    expectTypeOf(field.textField({ label: "x" })).toMatchTypeOf<HitlField>();
    expectTypeOf(field.textArea({ label: "x" })).toMatchTypeOf<HitlField>();
    expectTypeOf(field.select({ label: "x", options: ["a"] })).toMatchTypeOf<HitlField>();
    expectTypeOf(field.confirm({ label: "x" })).toMatchTypeOf<HitlField>();
  });
});
