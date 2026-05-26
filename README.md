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
skillops scan --json
skillops scan --output skillops-report.json
```

By default, it prints human-readable terminal output:

```text
Discovered 7 instruction files.
- .codex/review.md (codex, 192 bytes)
- .cursor/rules/typescript.md (cursor-rules, 194 bytes)
- .github/copilot-instructions.md (github-copilot, 201 bytes)
- AGENTS.md (agents, 297 bytes)
- CLAUDE.md (claude, 269 bytes)
- docs/ai-guidelines.md (docs-ai-guidelines, 170 bytes)
- docs/ai/assistant.md (docs-ai, 163 bytes)
Found 7 issues.
- missing_owner [medium] in CLAUDE.md
  Instruction file is missing owner metadata.
  Evidence: owner metadata is missing or empty.
  Suggestion: Add owner metadata to the instruction file frontmatter, for example: owner: platform-team.
- stale_review [medium] in docs/ai-guidelines.md
  Instruction file has invalid last_reviewed metadata.
  Evidence: last_reviewed: not-a-date
  Suggestion: Use a YYYY-MM-DD last_reviewed date, for example: last_reviewed: 2026-05-26.
- stale_review [medium] in docs/ai/assistant.md
  Instruction file review metadata is stale.
  Evidence: last_reviewed: 2026-01-01 (145 days old)
  Suggestion: Review the instruction file and update last_reviewed to the current YYYY-MM-DD date.
- broken_file_reference [medium] in AGENTS.md
  Instruction file references missing file "docs/release.md".
  Evidence: Line 12: Review docs/release.md before documenting release changes.
  Suggestion: Create the referenced file or update the instruction to point at an existing path.
- duplicate_instruction [low] in AGENTS.md
  Instruction duplicates guidance also found in "CLAUDE.md".
  Evidence: Line 11: Keep generated artifacts out of commits.
  Suggestion: Keep this guidance in a single instruction file or remove or reword the duplicate.
- duplicate_instruction [low] in CLAUDE.md
  Instruction duplicates guidance also found in "AGENTS.md".
  Evidence: Line 10: Keep generated artifacts out of commits.
  Suggestion: Keep this guidance in a single instruction file or remove or reword the duplicate.
- package_manager_conflict [medium] in CLAUDE.md
  Instruction file uses npm command "npm install" but this repository uses pnpm.
  Evidence: Line 11: Run npm install before changing dependencies.
  Suggestion: Replace npm commands with pnpm equivalents, or update the repository package manager metadata if npm is intended.
```

For CI, dashboards, and backend ingestion, use JSON output:

```sh
skillops scan --json
```

See [GitHub Actions CI](docs/ci.md) for a pull request workflow example.

To write the same JSON report to a file:

```sh
skillops scan --output skillops-report.json
```

Example JSON output:

```json
{
  "generatedAt": "2026-05-26T12:00:00.000Z",
  "rootDir": "/workspace/example-repo",
  "version": "0.1.0",
  "summary": {
    "totalInstructionFiles": 2,
    "totalIssues": 3,
    "issuesByType": {
      "broken_file_reference": 1,
      "package_manager_conflict": 1,
      "duplicate_instruction": 0,
      "missing_owner": 1,
      "stale_review": 0
    },
    "issuesBySeverity": {
      "low": 0,
      "medium": 3,
      "high": 0
    }
  },
  "instructionFiles": [
    {
      "path": "/workspace/example-repo/AGENTS.md",
      "relativePath": "AGENTS.md",
      "type": "agents",
      "hasFrontmatter": true,
      "metadata": {
        "owner": "platform-team",
        "last_reviewed": "2026-05-26",
        "tags": ["backend", "codex"],
        "status": "active"
      },
      "sizeBytes": 297,
      "modifiedAt": "2026-05-26T11:58:30.000Z"
    }
  ],
  "issues": [
    {
      "id": "broken_file_reference:AGENTS.md:docs/release.md",
      "type": "broken_file_reference",
      "severity": "medium",
      "filePath": "AGENTS.md",
      "message": "Instruction file references missing file \"docs/release.md\".",
      "evidence": "Line 12: Review docs/release.md before documenting release changes.",
      "suggestion": "Create the referenced file or update the instruction to point at an existing path."
    }
  ]
}
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
