import type { FeedbackValues, HitlField } from "./fields";

export class FeedbackValidationError extends Error {
  override name = "FeedbackValidationError";
}

/**
 * Validate raw values from a channel callback against the field definitions.
 * Returns the typed feedbacks; throws `FeedbackValidationError` on mismatch.
 */
export function validateFeedbacks<F extends Record<string, HitlField>>(
  fields: F,
  raw: Record<string, unknown>,
): FeedbackValues<F> {
  for (const key of Object.keys(raw)) {
    if (!(key in fields)) {
      throw new FeedbackValidationError(`Unknown feedback key: "${key}"`);
    }
  }

  const result: Record<string, unknown> = {};
  for (const [key, field] of Object.entries(fields)) {
    result[key] = validateValue(key, field, raw[key]);
  }
  return result as FeedbackValues<F>;
}

function validateValue(key: string, field: HitlField, value: unknown): unknown {
  if (value === undefined || value === null) {
    if (field.default !== undefined) return field.default;
    throw new FeedbackValidationError(`Missing value for feedback "${key}"`);
  }

  switch (field.kind) {
    case "text":
    case "textarea":
      if (typeof value !== "string") {
        throw new FeedbackValidationError(`Feedback "${key}" must be a string`);
      }
      return value;

    case "select":
      if (typeof value !== "string" || !field.options.includes(value)) {
        throw new FeedbackValidationError(
          `Feedback "${key}" must be one of: ${field.options.join(", ")}`,
        );
      }
      return value;

    case "confirm":
      if (typeof value === "boolean") return value;
      if (value === "true") return true;
      if (value === "false") return false;
      throw new FeedbackValidationError(`Feedback "${key}" must be a boolean`);
  }
}
