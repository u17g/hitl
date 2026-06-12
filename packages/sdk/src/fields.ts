/** Field definitions a reviewer can edit. Builders define the shape; `FeedbackValues` infers the result type. */

export interface TextField {
  kind: "text";
  label: string;
  default?: string;
}

export interface TextAreaField {
  kind: "textarea";
  label: string;
  default?: string;
}

export interface SelectField<O extends string = string> {
  kind: "select";
  label: string;
  options: readonly O[];
  default?: O;
}

export interface ConfirmField {
  kind: "confirm";
  label: string;
  default?: boolean;
}

export type HitlField = TextField | TextAreaField | SelectField | ConfirmField;

/** The typed values a reviewer submits, inferred from a `Record<string, HitlField>`. */
export type FeedbackValues<F extends Record<string, HitlField>> = {
  [K in keyof F]: F[K] extends SelectField<infer O>
    ? O
    : F[K] extends ConfirmField
      ? boolean
      : string;
};

export const hitl = {
  textField(opts: { label: string; default?: string }): TextField {
    return { kind: "text", label: opts.label, default: opts.default };
  },

  textArea(opts: { label: string; default?: string }): TextAreaField {
    return { kind: "textarea", label: opts.label, default: opts.default };
  },

  select<const O extends string>(opts: {
    label: string;
    options: readonly O[];
    default?: O;
  }): SelectField<O> {
    return {
      kind: "select",
      label: opts.label,
      options: opts.options,
      default: opts.default,
    };
  },

  confirm(opts: { label: string; default?: boolean }): ConfirmField {
    return { kind: "confirm", label: opts.label, default: opts.default };
  },
};
