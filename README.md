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
Discovered 7 instruction files.
- .codex/review.md (codex, 99 bytes)
- .cursor/rules/typescript.md (cursor-rules, 92 bytes)
- .github/copilot-instructions.md (github-copilot, 100 bytes)
- AGENTS.md (agents, 103 bytes)
- CLAUDE.md (claude, 104 bytes)
- docs/ai-guidelines.md (docs-ai-guidelines, 72 bytes)
- docs/ai/assistant.md (docs-ai, 72 bytes)
```

## Current MVP Scope

The MVP is focused on repository scanning for AI-agent instruction files such
as `AGENTS.md`, `CLAUDE.md`, `.codex/**/*.md`, `.cursor/rules/**/*.md`, and
similar project guidance. The first implementation will prioritize:

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
