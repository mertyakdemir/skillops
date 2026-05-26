# GitHub Actions CI

Use SkillOps in pull request CI by running the CLI after dependencies are
installed. SkillOps v0.1.0 ships a CLI package, not a dedicated GitHub Action
package.

## Workspace Workflow

The example workflow in `examples/github-action/skillops.yml` is for this
repository or another repository that vendors the SkillOps pnpm workspace. Copy
it into `.github/workflows` only when the repository contains these workspace
packages:

```sh
mkdir -p .github/workflows
cp examples/github-action/skillops.yml .github/workflows/skillops.yml
```

The example workflow runs on `pull_request`, checks out the repository, sets up
Node.js, enables Corepack, installs dependencies with pnpm, builds the project,
and runs a SkillOps scan.

This repository runs the local workspace CLI with:

```sh
corepack pnpm --filter @skillops/cli skillops scan
```

To scan a fixture or another directory, pass a path:

```sh
corepack pnpm --filter @skillops/cli skillops scan examples/sample-repo
```

## Installed Package Workflow

If your repository installs `@skillops/cli` as a dependency, use the package
binary instead:

```sh
corepack pnpm exec skillops scan
```

For CI, add `@skillops/cli` to your repository's dev dependencies, commit the
lockfile, and run:

```yaml
name: SkillOps

on:
  pull_request:

jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable
      - run: corepack pnpm install --frozen-lockfile
      - run: corepack pnpm exec skillops scan --output skillops-report.json
```

## Run Locally

From the repository root, install dependencies, build the project, and run the
scanner:

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm --filter @skillops/cli skillops scan examples/sample-repo
```

To write a JSON report locally:

```sh
corepack pnpm --filter @skillops/cli skillops scan examples/sample-repo --output skillops-report.json
```

## JSON Output in CI

SkillOps can write a machine-readable report for CI steps:

```sh
corepack pnpm --filter @skillops/cli skillops scan . --output skillops-report.json
```

The report includes summary counts, discovered instruction files, and issue
details. CI workflows can parse `skillops-report.json` in later steps to archive
the report, enforce custom thresholds, or feed another internal reporting
system.

For stdout JSON instead of a file, use:

```sh
corepack pnpm --filter @skillops/cli skillops scan . --json
```

## Exit Codes

SkillOps currently exits successfully when the scan command completes, even when
it finds instruction issues. Findings are reported in terminal output or JSON.

Non-zero exit codes currently indicate command, runtime, or unexpected scanner
errors, not issue severity. If you want CI to fail based on the number or type of
issues, parse `skillops-report.json` in a follow-up CI step and apply your own
thresholds.
