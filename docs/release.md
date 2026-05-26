# Release Process

SkillOps v0.1.0 is released manually from a clean checkout. The project does
not publish a GitHub Action package, web app, API service, dashboard,
telemetry, auth service, or mobile app in this milestone.

## Prerequisites

- Confirm you have npm publish access for the `@skillops` scope.
- Confirm `@skillops/core` and `@skillops/cli` are available in the npm
  registry or owned by the release maintainer.
- Use Node.js 18 or newer with Corepack enabled.
- Start from a clean git worktree on the intended release commit.

## Verify

Run the release checks from the repository root:

```sh
corepack pnpm install
corepack pnpm build
corepack pnpm test
corepack pnpm lint
corepack pnpm --filter @skillops/cli skillops scan examples/sample-repo
```

Confirm the package versions are aligned at `0.1.0`:

```sh
node -p "require('./package.json').version"
node -p "require('./packages/core/package.json').version"
node -p "require('./packages/cli/package.json').version"
```

## Pack Inspection

Build the packages, then create local package tarballs without publishing:

```sh
corepack pnpm build
mkdir -p /tmp/skillops-pack
corepack pnpm --filter @skillops/core pack --pack-destination /tmp/skillops-pack --json
corepack pnpm --filter @skillops/cli pack --pack-destination /tmp/skillops-pack --json
```

The package contents should include compiled `dist/index.js` files,
declaration files, source maps, and `package.json`. They should not include
source files, tests, fixtures, build info files, or local reports.

Use `pnpm pack` or `pnpm publish` for release packaging so workspace
dependencies are converted to registry versions in the packed package metadata.

## Publish

Publish `@skillops/core` before `@skillops/cli` because the CLI depends on the
core package:

```sh
corepack pnpm --filter @skillops/core publish --access public
corepack pnpm --filter @skillops/cli publish --access public
```

After publishing, verify the CLI can be installed in a temporary repository and
can scan that repository with:

```sh
corepack pnpm exec skillops scan
```

Do not create a GitHub Release for v0.1.0.
