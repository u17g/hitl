import type { HitlField } from "./fields";
import type { ActionStyle, HumanActionDef } from "./human-actions";

export function humanActions(): ActionsBuilder<readonly []> {
  return new ActionsBuilder([]);
}

export class ActionsBuilder<T extends readonly HumanActionDef[]> {
  constructor(private readonly actions: T) {}

  action<Id extends string, F extends Record<string, HitlField> = Record<string, never>>(
    id: Id,
    opts?: { label?: string; style?: ActionStyle; fields?: F },
  ): ActionsBuilder<readonly [...T, HumanActionDef<Id, F>]> {
    const def: HumanActionDef<Id, F> = { id, ...opts };
    return new ActionsBuilder([...this.actions, def] as readonly [...T, HumanActionDef<Id, F>]);
  }

  submit<F extends Record<string, HitlField> = Record<string, never>>(
    opts?: { label?: string; style?: ActionStyle; fields?: F },
  ): ActionsBuilder<readonly [...T, HumanActionDef<"submit", F>]> {
    return this.action("submit", opts);
  }

  deny<F extends Record<string, HitlField> = Record<string, never>>(
    opts?: { label?: string; style?: ActionStyle; fields?: F },
  ): ActionsBuilder<readonly [...T, HumanActionDef<"deny", F>]> {
    return this.action("deny", opts);
  }

  build(): T {
    return this.actions;
  }
}
