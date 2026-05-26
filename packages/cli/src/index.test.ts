import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { ScanResult } from "@skillops/core";

import { createCli } from "./index.js";

const generatedAt = new Date("2026-05-26T00:00:00.000Z");

function createScanResult(cwd = "/repo"): ScanResult {
  return {
    cwd,
    message: "Discovered 1 instruction file.",
    instructionFiles: [
      {
        path: path.join(cwd, "AGENTS.md"),
        relativePath: "AGENTS.md",
        type: "agents",
        content: "Agent instructions",
        contentWithoutFrontmatter: "Agent instructions",
        contentStartLine: 1,
        hasFrontmatter: false,
        metadata: {},
        sizeBytes: 18,
        modifiedAt: generatedAt
      }
    ],
    issues: [
      {
        id: "missing_owner:AGENTS.md",
        type: "missing_owner",
        severity: "medium",
        filePath: "AGENTS.md",
        message: "Instruction file is missing owner metadata.",
        evidence: "No frontmatter metadata found.",
        suggestion: "Add owner metadata to the instruction file frontmatter, for example: owner: platform-team."
      }
    ]
  };
}

async function runCli(args: string[]): Promise<string> {
  let stdout = "";
  const program = createCli({
    generatedAt: () => generatedAt,
    scanRepository: async () => createScanResult(),
    stdout: {
      write: (message: string) => {
        stdout += message;
      }
    }
  });

  await program.parseAsync(["node", "skillops", ...args]);

  return stdout;
}

describe("skillops scan", () => {
  it("scans the invocation cwd by default", async () => {
    let scannedCwd: string | undefined;
    const invocationCwd = path.resolve("/workspace/project");
    const program = createCli({
      invocationCwd,
      scanRepository: async (options = {}) => {
        scannedCwd = options.cwd;
        return createScanResult(invocationCwd);
      },
      stdout: {
        write: () => undefined
      }
    });

    await program.parseAsync(["node", "skillops", "scan"]);

    expect(scannedCwd).toBe(invocationCwd);
  });

  it("scans a path relative to the invocation cwd", async () => {
    let scannedCwd: string | undefined;
    const invocationCwd = path.resolve("/workspace/project");
    const expectedCwd = path.join(invocationCwd, "examples/sample-repo");
    const program = createCli({
      invocationCwd,
      scanRepository: async (options = {}) => {
        scannedCwd = options.cwd;
        return createScanResult(expectedCwd);
      },
      stdout: {
        write: () => undefined
      }
    });

    await program.parseAsync(["node", "skillops", "scan", "examples/sample-repo"]);

    expect(scannedCwd).toBe(expectedCwd);
  });

  it("prints JSON to stdout with --json", async () => {
    const stdout = await runCli(["scan", "--json"]);
    const report = JSON.parse(stdout) as unknown;

    expect(report).toMatchObject({
      generatedAt: "2026-05-26T00:00:00.000Z",
      rootDir: "/repo",
      version: "0.1.0",
      summary: {
        totalInstructionFiles: 1,
        totalIssues: 1,
        issuesByType: {
          broken_file_reference: 0,
          package_manager_conflict: 0,
          duplicate_instruction: 0,
          missing_owner: 1,
          stale_review: 0
        },
        issuesBySeverity: {
          low: 0,
          medium: 1,
          high: 0
        }
      },
      instructionFiles: [
        {
          path: "/repo/AGENTS.md",
          relativePath: "AGENTS.md",
          type: "agents",
          hasFrontmatter: false,
          metadata: {},
          sizeBytes: 18,
          modifiedAt: "2026-05-26T00:00:00.000Z"
        }
      ],
      issues: [
        {
          id: "missing_owner:AGENTS.md",
          type: "missing_owner",
          severity: "medium",
          filePath: "AGENTS.md"
        }
      ]
    });
    expect(stdout).not.toContain("Discovered 1 instruction file.");
  });

  it("writes JSON to a file with --output", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "skillops-cli-"));
    const outputPath = path.join(tempDir, "skillops-report.json");

    const stdout = await runCli(["scan", "--output", outputPath]);
    const output = await readFile(outputPath, "utf8");
    const report = JSON.parse(output) as { summary: { totalIssues: number } };

    expect(stdout).toBe("");
    expect(report.summary.totalIssues).toBe(1);
  });

  it("prints and writes the same JSON when --json and --output are passed", async () => {
    const tempDir = await mkdtemp(path.join(tmpdir(), "skillops-cli-"));
    const outputPath = path.join(tempDir, "skillops-report.json");

    const stdout = await runCli(["scan", "--json", "--output", outputPath]);
    const output = await readFile(outputPath, "utf8");

    expect(stdout).toBe(output);
  });

  it("prints human-readable output by default", async () => {
    const stdout = await runCli(["scan"]);

    expect(stdout).toContain("Discovered 1 instruction file.");
    expect(stdout).toContain("- AGENTS.md (agents, 18 bytes)");
    expect(stdout).toContain("Found 1 issue.");
    expect(stdout).toContain("missing_owner [medium] in AGENTS.md");
  });
});
