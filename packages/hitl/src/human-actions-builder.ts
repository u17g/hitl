import type { HitlField } from "./fields";
import type { HumanActionDef, HumanActionOpts } from "./human-actions";

export function actions(): ActionsBuilder<readonly []> {
  return new ActionsBuilder([]);
}

export class ActionsBuilder<T extends readonly HumanActionDef[]> {
  constructor(private readonly actions: T) {}

  custom<Id extends string, F extends Record<string, HitlField> = Record<string, never>>(
    id: Id,
    opts?: HumanActionOpts<F>,
  ): ActionsBuilder<readonly [...T, HumanActionDef<Id, F>]> {
    const def: HumanActionDef<Id, F> = { id, ...opts };
    return new ActionsBuilder([...this.actions, def] as readonly [...T, HumanActionDef<Id, F>]);
  }

  approve<F extends Record<string, HitlField> = Record<string, never>>(
    opts?: HumanActionOpts<F>,
  ): ActionsBuilder<readonly [...T, HumanActionDef<"approve", F>]> {
    return this.custom("approve", opts);
  }

  deny<F extends Record<string, HitlField> = Record<string, never>>(
    opts?: HumanActionOpts<F>,
  ): ActionsBuilder<readonly [...T, HumanActionDef<"deny", F>]> {
    return this.custom("deny", opts);
  }

  build(): T {
    return this.actions;
  }
}
