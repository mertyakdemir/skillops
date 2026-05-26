# SkillOps Sample Repository

This directory contains sample fixtures used to exercise the SkillOps scanner.

From the SkillOps repository root, scan this sample repository with:

```sh
corepack pnpm --filter @skillops/cli skillops scan examples/sample-repo
```

The fixture intentionally includes missing metadata, stale review metadata, a
broken file reference, duplicate guidance, and a package manager command
conflict so the CLI has representative findings to report.
