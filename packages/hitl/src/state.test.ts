import { describe, expect, it } from "vitest";
import { InMemoryState } from "./state";
import { describeStateContract } from "./state-contract";

describeStateContract("InMemoryState", { describe, it, expect }, () => new InMemoryState());
