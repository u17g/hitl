import { describe, expect, it } from "vitest";
import { InMemoryStore } from "./store";
import { describeStoreContract } from "./store-contract";

describeStoreContract("InMemoryStore", { describe, it, expect }, () => new InMemoryStore());
