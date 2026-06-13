# Changesets

This monorepo uses [Changesets](https://github.com/changesets/changesets) to version and publish packages.

When you change a publishable package under `packages/`, add a changeset before opening a PR:

```bash
pnpm changeset
```

Follow the prompts to choose affected packages and bump type (patch / minor / major). That creates a markdown file in `.changeset/`.

After the PR merges to `main`, CI runs and the Release workflow either opens a version-bump PR or publishes to npm (see `.github/workflows/release.yml`).
