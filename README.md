# SkillOps

Find stale AI instructions before they mislead your coding agents.

SkillOps is an open-source CLI scanner for stale, broken, duplicated, and
conflicting AI agent instructions in a repository.

SkillOps scans AI instruction files across Codex, Claude Code, Cursor, Copilot,
and custom coding agents.

## Why

AI coding agents are only as reliable as the project instructions they read.
Those instructions often drift as repositories change: referenced files move,
setup commands switch package managers, duplicated rules diverge, and ownership
or review metadata gets forgotten.

SkillOps gives developers a local-first way to catch that drift before an agent
follows outdated guidance.

## Quickstart

Run SkillOps with npx:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo
```

The sample fixture intentionally contains representative instruction issues. To
scan the repository you are currently in, omit the path or pass `.`:

```sh
npx @mrtykdmr/skillops scan
npx @mrtykdmr/skillops scan .
```

The CLI supports human-readable output by default, JSON on stdout, and JSON
reports written to disk:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo
npx @mrtykdmr/skillops scan examples/sample-repo --json
npx @mrtykdmr/skillops scan examples/sample-repo --output skillops-report.json
```

## Example Output

Human-readable output is designed for local development and pull request logs:

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

## JSON Output

Use JSON output for CI, scripts, or internal reporting:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo --json
```

To write the report to a file:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo --output skillops-report.json
```

Example JSON report:

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

## CI

See [GitHub Actions CI](docs/ci.md) for a pull request workflow example that
runs the scanner and writes a JSON report.

## Supported Instruction Files

SkillOps currently discovers:

- `AGENTS.md`
- `CLAUDE.md`
- `.codex/**/*.md`
- `.cursor/rules/**/*.md`
- `.github/copilot-instructions.md`
- `docs/ai/**/*.md`
- `docs/ai-guidelines.md`

It ignores dependency, build, and Git internals such as `node_modules`, `dist`,
and `.git`.

## Current Checks

The v0.1 scanner currently reports:

- missing `owner` metadata
- missing, invalid, or stale `last_reviewed` metadata
- broken repository file references
- duplicated instruction lines across supported files
- package manager command conflicts, such as `npm install` in a pnpm repository

## Roadmap

See the full [roadmap](docs/roadmap.md). Planned milestones:

- v0.1 CLI scanner
- v0.2 GitHub Action / PR comments
- v0.3 dashboard import
- v0.4 telemetry SDK
- v1.0 stable CLI + CI workflow

The current repository remains focused on the local scanner and CLI. It does
not include a web app, API service, authentication, dashboard, telemetry,
GitHub Action package, or mobile app yet.

## Contributing

Contributions are welcome. Keep changes focused on the current scanner and CLI
MVP, add or update tests for behavior changes, and run the project checks before
opening a pull request:

```sh
corepack pnpm build
corepack pnpm test
corepack pnpm lint
```

## License

SkillOps is released under the [MIT License](LICENSE).
