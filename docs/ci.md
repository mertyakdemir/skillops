# GitHub Actions CI

Use the example workflow in `examples/github-action/skillops.yml` to run
SkillOps in pull requests.

## Add the Workflow

Copy the example into your repository:

```sh
mkdir -p .github/workflows
cp examples/github-action/skillops.yml .github/workflows/skillops.yml
```

The example workflow runs on `pull_request`, checks out the repository, sets up
Node.js, enables Corepack, installs dependencies with pnpm, builds the project,
and runs a SkillOps scan.

This repository currently runs the local workspace CLI with:

```sh
corepack pnpm --filter @skillops/cli skillops scan
```

If your repository installs SkillOps as a dependency, use the package binary
instead:

```sh
corepack pnpm exec skillops scan
```

## Run Locally

From the repository root, install dependencies, build the project, and run the
scanner:

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm --filter @skillops/cli skillops scan
```

To write a JSON report locally:

```sh
corepack pnpm --filter @skillops/cli skillops scan --output skillops-report.json
```

## JSON Output in CI

SkillOps can write a machine-readable report for CI steps:

```sh
corepack pnpm --filter @skillops/cli skillops scan --output skillops-report.json
```

The report includes summary counts, discovered instruction files, and issue
details. CI workflows can parse `skillops-report.json` in later steps to archive
the report, enforce custom thresholds, or feed another internal reporting
system.

For stdout JSON instead of a file, use:

```sh
corepack pnpm --filter @skillops/cli skillops scan --json
```

## Exit Codes

SkillOps currently exits successfully when the scan command completes, even when
it finds instruction issues. Findings are reported in terminal output or JSON.

Non-zero exit codes currently indicate command, runtime, or unexpected scanner
errors, not issue severity. If you want CI to fail based on the number or type of
issues, parse `skillops-report.json` in a follow-up CI step and apply your own
thresholds.
