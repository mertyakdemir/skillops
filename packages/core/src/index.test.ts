import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createScanJsonReport,
  detectBrokenFileReferences,
  detectDuplicateInstructions,
  detectInstructionMetadataIssues,
  detectPackageManagerConflicts,
  detectRepositoryPackageManager,
  discoverInstructionFiles,
  scanRepository
} from "./index.js";

const metadataTestDate = new Date("2026-05-26T00:00:00.000Z");

async function createTempRepo(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "skillops-"));
}

async function writeRepoFile(rootDir: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

function dateOnly(date: Date = new Date()): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function healthyInstructionContent(content: string): string {
  return instructionContentWithFrontmatter(
    [
      "owner: platform-team",
      `last_reviewed: ${dateOnly()}`,
      "tags: [backend, codex]",
      "status: active"
    ],
    content
  );
}

function instructionContentWithFrontmatter(frontmatterLines: string[], content: string): string {
  return ["---", ...frontmatterLines, "---", content].join("\n");
}

describe("discoverInstructionFiles", () => {
  it("discovers supported AI instruction files with metadata", async () => {
    const rootDir = await createTempRepo();
    const files = [
      ["AGENTS.md", healthyInstructionContent("Agent instructions")],
      ["CLAUDE.md", healthyInstructionContent("Claude instructions")],
      [".codex/prompts/review.md", healthyInstructionContent("Codex instructions")],
      [".cursor/rules/typescript/style.md", healthyInstructionContent("Cursor rules")],
      [".github/copilot-instructions.md", healthyInstructionContent("Copilot instructions")],
      ["docs/ai/usage.md", healthyInstructionContent("AI docs")],
      ["docs/ai-guidelines.md", healthyInstructionContent("AI guidelines")]
    ] as const;

    await Promise.all(files.map(([relativePath, content]) => writeRepoFile(rootDir, relativePath, content)));
    await writeRepoFile(rootDir, "docs/notes.md", "Not an instruction file");

    const discoveredFiles = await discoverInstructionFiles(rootDir);

    expect(discoveredFiles.map((file) => file.relativePath)).toEqual([
      ".codex/prompts/review.md",
      ".cursor/rules/typescript/style.md",
      ".github/copilot-instructions.md",
      "AGENTS.md",
      "CLAUDE.md",
      "docs/ai-guidelines.md",
      "docs/ai/usage.md"
    ]);
    expect(discoveredFiles.map((file) => file.type)).toEqual([
      "codex",
      "cursor-rules",
      "github-copilot",
      "agents",
      "claude",
      "docs-ai-guidelines",
      "docs-ai"
    ]);

    for (const file of discoveredFiles) {
      expect(file.path).toBe(path.resolve(rootDir, file.relativePath));
      expect(file.content).toEqual(expect.any(String));
      expect(file.contentWithoutFrontmatter).not.toContain("owner: platform-team");
      expect(file.contentStartLine).toBe(7);
      expect(file.hasFrontmatter).toBe(true);
      expect(file.metadata).toMatchObject({
        owner: "platform-team",
        tags: ["backend", "codex"],
        status: "active"
      });
      expect(file.metadata.last_reviewed).toBeDefined();
      expect(file.sizeBytes).toBeGreaterThan(0);
      expect(file.modifiedAt).toBeInstanceOf(Date);
    }
  });

  it("ignores generated and dependency directories", async () => {
    const rootDir = await createTempRepo();

    await writeRepoFile(rootDir, "AGENTS.md", "Root instructions");
    await writeRepoFile(rootDir, "node_modules/package/AGENTS.md", "Dependency instructions");
    await writeRepoFile(rootDir, "dist/CLAUDE.md", "Build output instructions");

    await expect(discoverInstructionFiles(rootDir)).resolves.toHaveLength(1);
  });

  it("discovers CLAUDE.md as a Claude Code instruction file", async () => {
    const rootDir = await createTempRepo();
    const content = healthyInstructionContent("Claude Code instructions");
    await writeRepoFile(rootDir, "CLAUDE.md", content);

    await expect(discoverInstructionFiles(rootDir)).resolves.toMatchObject([
      {
        relativePath: "CLAUDE.md",
        type: "claude",
        content,
        contentWithoutFrontmatter: "Claude Code instructions"
      }
    ]);
  });
});

describe("detectInstructionMetadataIssues", () => {
  it("detects missing owner", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter([`last_reviewed: ${dateOnly(metadataTestDate)}`], "Agent instructions")
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([
      {
        id: "missing_owner:AGENTS.md",
        type: "missing_owner",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file is missing owner metadata.",
        evidence: "owner metadata is missing or empty.",
        suggestion: "Add owner metadata to the instruction file frontmatter, for example: owner: platform-team."
      }
    ]);
  });

  it("does not report missing owner when owner exists", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter(
        ["owner: platform-team", `last_reviewed: ${dateOnly(metadataTestDate)}`],
        "Agent instructions"
      )
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([]);
  });

  it("detects missing last_reviewed", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter(["owner: platform-team"], "Agent instructions")
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([
      {
        id: "stale_review:AGENTS.md",
        type: "stale_review",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file is missing last_reviewed metadata.",
        evidence: "last_reviewed metadata is missing.",
        suggestion: "Add a recent last_reviewed date in YYYY-MM-DD format to the instruction file frontmatter."
      }
    ]);
  });

  it("detects old last_reviewed", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter(["owner: platform-team", "last_reviewed: 2026-01-01"], "Agent instructions")
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([
      {
        id: "stale_review:AGENTS.md",
        type: "stale_review",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file review metadata is stale.",
        evidence: "last_reviewed: 2026-01-01 (145 days old)",
        suggestion: "Review the instruction file and update last_reviewed to the current YYYY-MM-DD date."
      }
    ]);
  });

  it("does not report stale_review for recent last_reviewed", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter(["owner: platform-team", "last_reviewed: 2026-05-01"], "Agent instructions")
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([]);
  });

  it("handles invalid last_reviewed safely", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      instructionContentWithFrontmatter(["owner: platform-team", "last_reviewed: not-a-date"], "Agent instructions")
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([
      {
        id: "stale_review:AGENTS.md",
        type: "stale_review",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file has invalid last_reviewed metadata.",
        evidence: "last_reviewed: not-a-date",
        suggestion: "Use a YYYY-MM-DD last_reviewed date, for example: last_reviewed: 2026-05-26."
      }
    ]);
  });

  it("reports missing owner and stale review when frontmatter is missing", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Agent instructions");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectInstructionMetadataIssues({ instructionFiles, currentDate: metadataTestDate })).resolves.toEqual([
      {
        id: "missing_owner:AGENTS.md",
        type: "missing_owner",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file is missing owner metadata.",
        evidence: "No frontmatter metadata found.",
        suggestion: "Add owner metadata to the instruction file frontmatter, for example: owner: platform-team."
      },
      {
        id: "stale_review:AGENTS.md",
        type: "stale_review",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file is missing last_reviewed metadata.",
        evidence: "No frontmatter metadata found.",
        suggestion: "Add a recent last_reviewed date in YYYY-MM-DD format to the instruction file frontmatter."
      }
    ]);
  });
});

describe("scanRepository", () => {
  it("returns discovered instruction files", async () => {
    const rootDir = await createTempRepo();
    const content = healthyInstructionContent("Agent instructions");
    await writeRepoFile(rootDir, "AGENTS.md", content);

    await expect(scanRepository({ cwd: rootDir })).resolves.toMatchObject({
      cwd: path.resolve(rootDir),
      message: "Discovered 1 instruction file.",
      instructionFiles: [
        {
          relativePath: "AGENTS.md",
          type: "agents",
          content,
          contentWithoutFrontmatter: "Agent instructions"
        }
      ],
      issues: []
    });
  });

  it("returns broken file reference issues", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      healthyInstructionContent("Use src/services/paymentService.ts for payment logic.")
    );

    await expect(scanRepository({ cwd: rootDir })).resolves.toMatchObject({
      issues: [
        {
          type: "broken_file_reference",
          severity: "medium",
          filePath: "AGENTS.md",
          message: 'Instruction file references missing file "src/services/paymentService.ts".'
        }
      ]
    });
  });

  it("returns package manager conflict issues", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "package.json", JSON.stringify({ packageManager: "pnpm@10.11.0" }));
    await writeRepoFile(rootDir, "AGENTS.md", healthyInstructionContent("Run npm install."));

    await expect(scanRepository({ cwd: rootDir })).resolves.toMatchObject({
      issues: [
        {
          id: "package_manager_conflict:AGENTS.md:7:npm_install",
          type: "package_manager_conflict",
          severity: "medium",
          filePath: "AGENTS.md",
          message: 'Instruction file uses npm command "npm install" but this repository uses pnpm.',
          evidence: "Line 7: Run npm install."
        }
      ]
    });
  });

  it("returns duplicate instruction issues", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", healthyInstructionContent("Keep generated artifacts out of commits."));
    await writeRepoFile(rootDir, "CLAUDE.md", healthyInstructionContent("Keep generated artifacts out of commits."));

    await expect(scanRepository({ cwd: rootDir })).resolves.toMatchObject({
      issues: [
        {
          type: "duplicate_instruction",
          severity: "low",
          filePath: "AGENTS.md",
          message: 'Instruction duplicates guidance also found in "CLAUDE.md".'
        },
        {
          type: "duplicate_instruction",
          severity: "low",
          filePath: "CLAUDE.md",
          message: 'Instruction duplicates guidance also found in "AGENTS.md".'
        }
      ]
    });
  });
});

describe("createScanJsonReport", () => {
  it("returns the JSON report shape without instruction file contents", async () => {
    const rootDir = await createTempRepo();
    const content = healthyInstructionContent("Agent instructions");
    await writeRepoFile(rootDir, "AGENTS.md", content);
    const result = await scanRepository({ cwd: rootDir });

    const report = createScanJsonReport(result, {
      generatedAt: metadataTestDate,
      version: "0.1.0"
    });

    expect(report).toMatchObject({
      generatedAt: "2026-05-26T00:00:00.000Z",
      rootDir: path.resolve(rootDir),
      version: "0.1.0",
      summary: {
        totalInstructionFiles: 1,
        totalIssues: 0,
        issuesByType: {
          broken_file_reference: 0,
          package_manager_conflict: 0,
          duplicate_instruction: 0,
          missing_owner: 0,
          stale_review: 0
        },
        issuesBySeverity: {
          low: 0,
          medium: 0,
          high: 0
        }
      },
      instructionFiles: [
        {
          path: path.join(rootDir, "AGENTS.md"),
          relativePath: "AGENTS.md",
          type: "agents",
          hasFrontmatter: true,
          metadata: {
            owner: "platform-team",
            last_reviewed: dateOnly(),
            tags: ["backend", "codex"],
            status: "active"
          },
          sizeBytes: Buffer.byteLength(content),
          modifiedAt: expect.any(String)
        }
      ],
      issues: []
    });
    expect(report.instructionFiles[0]).not.toHaveProperty("content");
    expect(report.instructionFiles[0]).not.toHaveProperty("contentWithoutFrontmatter");
  });

  it("counts issues by type and severity", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "package.json", JSON.stringify({ packageManager: "pnpm@10.11.0" }));
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      [
        "Run npm install before changing dependencies.",
        "Keep generated artifacts out of commits.",
        "Use docs/missing.md before release changes."
      ].join("\n")
    );
    await writeRepoFile(rootDir, "CLAUDE.md", "Keep generated artifacts out of commits.");
    const result = await scanRepository({ cwd: rootDir });

    const report = createScanJsonReport(result, {
      generatedAt: metadataTestDate,
      version: "0.1.0"
    });

    expect(report.summary).toEqual({
      totalInstructionFiles: 2,
      totalIssues: 8,
      issuesByType: {
        broken_file_reference: 1,
        package_manager_conflict: 1,
        duplicate_instruction: 2,
        missing_owner: 2,
        stale_review: 2
      },
      issuesBySeverity: {
        low: 2,
        medium: 6,
        high: 0
      }
    });
  });
});

describe("detectDuplicateInstructions", () => {
  it("detects duplicated instructions across AGENTS.md and CLAUDE.md", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Use pnpm workspaces for every package change.");
    await writeRepoFile(rootDir, "CLAUDE.md", "  use   pnpm workspaces for every package change!  ");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    const issues = await detectDuplicateInstructions({ instructionFiles });

    expect(issues).toEqual([
      {
        id: "duplicate_instruction:AGENTS.md:1:use_pnpm_workspaces_for_every_package_change",
        type: "duplicate_instruction",
        severity: "low",
        filePath: "AGENTS.md",
        message: 'Instruction duplicates guidance also found in "CLAUDE.md".',
        evidence: "Line 1: Use pnpm workspaces for every package change.",
        suggestion: "Keep this guidance in a single instruction file or remove or reword the duplicate."
      },
      {
        id: "duplicate_instruction:CLAUDE.md:1:use_pnpm_workspaces_for_every_package_change",
        type: "duplicate_instruction",
        severity: "low",
        filePath: "CLAUDE.md",
        message: 'Instruction duplicates guidance also found in "AGENTS.md".',
        evidence: "Line 1: use   pnpm workspaces for every package change!",
        suggestion: "Keep this guidance in a single instruction file or remove or reword the duplicate."
      }
    ]);
  });

  it("ignores headings", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "# Shared Agent Guidance");
    await writeRepoFile(rootDir, "CLAUDE.md", "# Shared Agent Guidance");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectDuplicateInstructions({ instructionFiles })).resolves.toEqual([]);
  });

  it("ignores code fences", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      ["```sh", "Keep generated artifacts out of commits.", "```"].join("\n")
    );
    await writeRepoFile(rootDir, "CLAUDE.md", "Keep generated artifacts out of commits.");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectDuplicateInstructions({ instructionFiles })).resolves.toEqual([]);
  });

  it("ignores very short lines", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Run tests.");
    await writeRepoFile(rootDir, "CLAUDE.md", "Run tests.");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectDuplicateInstructions({ instructionFiles })).resolves.toEqual([]);
  });

  it("does not report unique instructions", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Use pnpm workspaces for every package change.");
    await writeRepoFile(rootDir, "CLAUDE.md", "Keep implementation notes concise and current.");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectDuplicateInstructions({ instructionFiles })).resolves.toEqual([]);
  });
});

describe("detectRepositoryPackageManager", () => {
  it.each([
    ["pnpm", "pnpm@10.11.0"],
    ["npm", "npm@10.8.2"],
    ["yarn", "yarn@4.9.1"],
    ["bun", "bun@1.2.15"]
  ] as const)("detects %s from package.json packageManager", async (expectedPackageManager, packageManagerField) => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "package.json", JSON.stringify({ packageManager: packageManagerField }));

    await expect(detectRepositoryPackageManager(rootDir)).resolves.toEqual({
      name: expectedPackageManager,
      source: "package.json packageManager"
    });
  });

  it.each([
    ["pnpm", "pnpm-lock.yaml"],
    ["npm", "package-lock.json"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lockb"]
  ] as const)("detects %s from %s", async (expectedPackageManager, lockfileName) => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, lockfileName, "lockfile");

    await expect(detectRepositoryPackageManager(rootDir)).resolves.toEqual({
      name: expectedPackageManager,
      source: lockfileName
    });
  });

  it("prefers package.json packageManager over lockfiles", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "package.json", JSON.stringify({ packageManager: "bun@1.2.15" }));
    await writeRepoFile(rootDir, "pnpm-lock.yaml", "lockfile");

    await expect(detectRepositoryPackageManager(rootDir)).resolves.toEqual({
      name: "bun",
      source: "package.json packageManager"
    });
  });
});

describe("detectBrokenFileReferences", () => {
  it("detects missing file references", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Use src/services/paymentService.ts for payment behavior.");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    const issues = await detectBrokenFileReferences({ rootDir, instructionFiles });

    expect(issues).toEqual([
      expect.objectContaining({
        id: "broken_file_reference:AGENTS.md:src/services/paymentService.ts",
        type: "broken_file_reference",
        severity: "medium",
        filePath: "AGENTS.md",
        evidence: "Line 1: Use src/services/paymentService.ts for payment behavior."
      })
    ]);
  });

  it("ignores existing file references", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Use apps/web/components/Button.tsx for shared button behavior.");
    await writeRepoFile(rootDir, "apps/web/components/Button.tsx", "export function Button() {}");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectBrokenFileReferences({ rootDir, instructionFiles })).resolves.toEqual([]);
  });

  it("ignores URLs", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      "Use https://example.com/docs/release.md and [docs/release.md](https://example.com/packages/api/src/index.ts)."
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectBrokenFileReferences({ rootDir, instructionFiles })).resolves.toEqual([]);
  });

  it("ignores package names", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      "Install @mrtykdmr/skillops-core, @types/node, react, and eslint-config/custom before running checks."
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectBrokenFileReferences({ rootDir, instructionFiles })).resolves.toEqual([]);
  });
});

describe("detectPackageManagerConflicts", () => {
  it("detects conflicting package manager commands", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "package.json", JSON.stringify({ packageManager: "pnpm@10.11.0" }));
    await writeRepoFile(
      rootDir,
      "AGENTS.md",
      "Run npm install, npm run build, yarn install, yarn test, bun install, and bun test."
    );
    const instructionFiles = await discoverInstructionFiles(rootDir);

    const issues = await detectPackageManagerConflicts({ rootDir, instructionFiles });

    expect(issues).toHaveLength(6);
    expect(issues[0]).toMatchObject({
      id: "package_manager_conflict:AGENTS.md:1:npm_install",
      type: "package_manager_conflict",
      severity: "medium",
      filePath: "AGENTS.md",
      evidence: "Line 1: Run npm install, npm run build, yarn install, yarn test, bun install, and bun test."
    });
    expect(issues.map((issue) => issue.message)).toEqual(
      expect.arrayContaining([
        'Instruction file uses npm command "npm install" but this repository uses pnpm.',
        'Instruction file uses npm command "npm run" but this repository uses pnpm.',
        'Instruction file uses yarn command "yarn install" but this repository uses pnpm.',
        'Instruction file uses yarn command "yarn" but this repository uses pnpm.',
        'Instruction file uses bun command "bun install" but this repository uses pnpm.',
        'Instruction file uses bun command "bun" but this repository uses pnpm.'
      ])
    );
  });

  it("ignores commands that match the repository package manager", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "yarn.lock", "lockfile");
    await writeRepoFile(rootDir, "AGENTS.md", "Run yarn install and yarn test before handing off.");
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectPackageManagerConflicts({ rootDir, instructionFiles })).resolves.toEqual([]);
  });

  it("ignores package manager lockfile and packageManager text", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "pnpm-lock.yaml", "lockfile");
    await writeRepoFile(rootDir, "AGENTS.md", 'Keep yarn.lock deleted and leave packageManager "npm@10" unchanged.');
    const instructionFiles = await discoverInstructionFiles(rootDir);

    await expect(detectPackageManagerConflicts({ rootDir, instructionFiles })).resolves.toEqual([]);
  });
});
