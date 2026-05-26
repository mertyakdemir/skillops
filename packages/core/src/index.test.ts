import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverInstructionFiles, scanRepository } from "./index.js";

async function createTempRepo(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "skillops-"));
}

async function writeRepoFile(rootDir: string, relativePath: string, content: string): Promise<void> {
  const filePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
}

describe("discoverInstructionFiles", () => {
  it("discovers supported AI instruction files with metadata", async () => {
    const rootDir = await createTempRepo();
    const files = [
      ["AGENTS.md", "Agent instructions"],
      ["CLAUDE.md", "Claude instructions"],
      [".codex/prompts/review.md", "Codex instructions"],
      [".cursor/rules/typescript/style.md", "Cursor rules"],
      [".github/copilot-instructions.md", "Copilot instructions"],
      ["docs/ai/usage.md", "AI docs"],
      ["docs/ai-guidelines.md", "AI guidelines"]
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
});

describe("scanRepository", () => {
  it("returns discovered instruction files", async () => {
    const rootDir = await createTempRepo();
    await writeRepoFile(rootDir, "AGENTS.md", "Agent instructions");

    await expect(scanRepository({ cwd: rootDir })).resolves.toMatchObject({
      cwd: path.resolve(rootDir),
      message: "Discovered 1 instruction file.",
      instructionFiles: [
        {
          relativePath: "AGENTS.md",
          type: "agents",
          content: "Agent instructions"
        }
      ]
    });
  });
});
