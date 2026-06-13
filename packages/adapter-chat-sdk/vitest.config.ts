import { defineConfig } from "vitest/config";

// chat cards are authored as JSX compiled by its own runtime; mirror tsconfig's
// jsxImportSource so .tsx test/source files transpile the same way under vitest.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "chat" },
});
