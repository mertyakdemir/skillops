# GitHub Actions CI

Use SkillOps in pull request CI by running the CLI with npx. SkillOps v0.1.0
ships a CLI package, not a dedicated GitHub Action package.

## npx Workflow

The example workflow in `examples/github-action/skillops.yml` runs SkillOps
with npx. Copy it into `.github/workflows`:

```sh
mkdir -p .github/workflows
cp examples/github-action/skillops.yml .github/workflows/skillops.yml
```

The example workflow runs on `pull_request`, checks out the repository, sets up
Node.js, and runs a SkillOps scan with npx.

Run a default scan with:

```sh
npx @mrtykdmr/skillops scan
```

To scan a fixture or another directory, pass a path:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo
```

## Installed Package Workflow

If your repository installs `@mrtykdmr/skillops` as a dependency, use the same
npx command:

```sh
npx @mrtykdmr/skillops scan
```

For CI, add `@mrtykdmr/skillops` to your repository's dev dependencies, commit the
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
      - run: npx @mrtykdmr/skillops scan --output skillops-report.json
```

## Run Locally

From the repository root, run the scanner with npx:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo
```

To write a JSON report locally:

```sh
npx @mrtykdmr/skillops scan examples/sample-repo --output skillops-report.json
```

## JSON Output in CI

SkillOps can write a machine-readable report for CI steps:

```sh
npx @mrtykdmr/skillops scan . --output skillops-report.json
```

The report includes summary counts, discovered instruction files, and issue
details. CI workflows can parse `skillops-report.json` in later steps to archive
the report, enforce custom thresholds, or feed another internal reporting
system.

For stdout JSON instead of a file, use:

```sh
npx @mrtykdmr/skillops scan . --json
```

## Exit Codes

SkillOps currently exits successfully when the scan command completes, even when
it finds instruction issues. Findings are reported in terminal output or JSON.

Non-zero exit codes currently indicate command, runtime, or unexpected scanner
errors, not issue severity. If you want CI to fail based on the number or type of
issues, parse `skillops-report.json` in a follow-up CI step and apply your own
thresholds.
