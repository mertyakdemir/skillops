# SkillOps Agent Instructions

SkillOps is a TypeScript pnpm monorepo for scanning repositories for stale,
broken, duplicated, and conflicting AI agent instructions.

## Project Layout

- `packages/core`: scanner logic and shared types
- `packages/cli`: command-line interface
- `examples/sample-repo`: sample repository fixtures
- `docs`: project documentation

## Development

- Use pnpm workspaces.
- Keep the MIT `LICENSE` unchanged.
- Keep implementation focused on the local scanner and CLI until the MVP is
  established.
- Do not add a web app, API service, auth, dashboard, telemetry, GitHub Action,
  or mobile app yet.

## Checks

Run these before handing off changes:

```sh
pnpm build
pnpm test
pnpm lint
```
