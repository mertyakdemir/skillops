# SkillOps

SkillOps is an open-source developer tool that scans repositories for stale,
broken, duplicated, and conflicting AI agent instructions.

## Quickstart

```sh
pnpm install
pnpm build
pnpm --filter @skillops/cli skillops scan
```

The initial CLI supports:

```sh
skillops scan
```

For now, it prints:

```text
SkillOps scanner coming soon.
```

## Current MVP Scope

The MVP is focused on repository scanning for AI-agent instruction files such
as `AGENTS.md`, `.cursorrules`, and similar project guidance. The first
implementation will prioritize:

- discovering instruction files across a repository
- identifying stale or broken references
- detecting duplicated guidance
- surfacing conflicting instructions
- producing clear CLI output for local developer workflows

This scaffold intentionally does not include a web app, API service,
authentication, dashboard, telemetry, GitHub Action, or mobile app.

## Roadmap

- Define the scanner rule model and result schema
- Implement instruction file discovery in `@skillops/core`
- Add checks for stale paths, missing files, duplication, and conflicts
- Expand CLI output formats for humans and automation
- Add fixtures that model real-world AI instruction layouts
- Publish packages for open-source use
