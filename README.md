# SkillOps

SkillOps is an open-source developer tool that scans repositories for stale,
broken, duplicated, and conflicting AI agent instructions.

SkillOps scans AI instruction files across Codex, Claude Code, Cursor, Copilot,
and custom coding agents.

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
- AGENTS.md (agents, 162 bytes)
- CLAUDE.md (claude, 150 bytes)
- docs/ai-guidelines.md (docs-ai-guidelines, 72 bytes)
- docs/ai/assistant.md (docs-ai, 72 bytes)
Found 2 issues.
- broken_file_reference [medium] in AGENTS.md
  Instruction file references missing file "docs/release.md".
  Evidence: Line 4: Review docs/release.md before documenting release changes.
  Suggestion: Create the referenced file or update the instruction to point at an existing path.
- package_manager_conflict [medium] in CLAUDE.md
  Instruction file uses npm command "npm install" but this repository uses pnpm.
  Evidence: Line 4: Run npm install before changing dependencies.
  Suggestion: Replace npm commands with pnpm equivalents, or update the repository package manager metadata if npm is intended.
```

## Current MVP Scope

The MVP is focused on repository scanning for AI-agent instruction files such
as `AGENTS.md`, `CLAUDE.md`, `.codex/**/*.md`, `.cursor/rules/**/*.md`, and
similar project guidance across Codex, Claude Code, Cursor, Copilot, and custom
coding agents. The first implementation will prioritize:

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
