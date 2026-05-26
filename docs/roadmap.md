# SkillOps Roadmap

SkillOps starts as a local-first scanner for AI instruction files. Future
milestones should build on the CLI and JSON report format without adding product
surface before the underlying scanner is useful and stable.

## v0.1 CLI Scanner

- Discover common AI agent instruction files in repositories.
- Report missing owner metadata and stale `last_reviewed` metadata.
- Detect broken repository file references.
- Detect duplicated instruction lines across supported files.
- Report package manager command conflicts.
- Provide human-readable CLI output and JSON reports.

## v0.2 GitHub Action / PR Comments

- Add an official GitHub Action wrapper around the CLI.
- Support pull request annotations or comments for scan findings.
- Provide configurable thresholds for failing CI.
- Keep the CLI usable without GitHub Actions.

## v0.3 Dashboard Import

- Define a stable import format for SkillOps JSON reports.
- Document how teams can archive and compare reports over time.
- Support dashboard ingestion without requiring SkillOps to host a dashboard.

## v0.4 Telemetry SDK

- Provide an opt-in SDK for teams that want to send scan summaries to their own
  internal systems.
- Keep local CLI scans telemetry-free by default.
- Document privacy and data-shaping expectations before implementation.

## v1.0 Stable CLI + CI Workflow

- Stabilize the CLI commands, exit-code behavior, and JSON schema.
- Publish a recommended CI workflow for pull requests.
- Document supported instruction file conventions and rule semantics.
- Commit to backwards-compatible behavior for stable v1 workflows.

## Current Boundary

Do not build a web app, API service, authentication, dashboard, telemetry,
GitHub Action package, or mobile app yet. The current implementation remains
focused on the local scanner and CLI until the MVP is established.
