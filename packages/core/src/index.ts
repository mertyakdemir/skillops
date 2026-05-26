import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { z } from "zod";

export const scanOptionsSchema = z.object({
  cwd: z.string().default(process.cwd())
});

export type ScanOptions = z.input<typeof scanOptionsSchema>;

export type InstructionFileType =
  | "agents"
  | "claude"
  | "codex"
  | "cursor-rules"
  | "github-copilot"
  | "docs-ai"
  | "docs-ai-guidelines";

export type InstructionFile = {
  path: string;
  relativePath: string;
  type: InstructionFileType;
  content: string;
  sizeBytes: number;
  modifiedAt: Date;
};

export type ScanResult = {
  cwd: string;
  instructionFiles: InstructionFile[];
  message: string;
};

const instructionFilePatterns = [
  "AGENTS.md",
  "CLAUDE.md",
  ".codex/**/*.md",
  ".cursor/rules/**/*.md",
  ".github/copilot-instructions.md",
  "docs/ai/**/*.md",
  "docs/ai-guidelines.md"
];

const ignoredPaths = ["**/node_modules/**", "**/dist/**", "**/.git/**"];

function getInstructionFileType(relativePath: string): InstructionFileType {
  if (relativePath === "AGENTS.md") {
    return "agents";
  }

  if (relativePath === "CLAUDE.md") {
    return "claude";
  }

  if (relativePath.startsWith(".codex/")) {
    return "codex";
  }

  if (relativePath.startsWith(".cursor/rules/")) {
    return "cursor-rules";
  }

  if (relativePath === ".github/copilot-instructions.md") {
    return "github-copilot";
  }

  if (relativePath.startsWith("docs/ai/")) {
    return "docs-ai";
  }

  return "docs-ai-guidelines";
}

export async function discoverInstructionFiles(rootDir: string): Promise<InstructionFile[]> {
  const resolvedRootDir = path.resolve(rootDir);
  const relativePaths = await fg(instructionFilePatterns, {
    cwd: resolvedRootDir,
    dot: true,
    followSymbolicLinks: false,
    ignore: ignoredPaths,
    onlyFiles: true,
    unique: true
  });

  const sortedRelativePaths = relativePaths.sort((left, right) => left.localeCompare(right));

  return Promise.all(
    sortedRelativePaths.map(async (relativePath) => {
      const filePath = path.resolve(resolvedRootDir, relativePath);
      const [content, fileStats] = await Promise.all([
        readFile(filePath, "utf8"),
        stat(filePath)
      ]);

      return {
        path: filePath,
        relativePath,
        type: getInstructionFileType(relativePath),
        content,
        sizeBytes: fileStats.size,
        modifiedAt: fileStats.mtime
      };
    })
  );
}

export async function scanRepository(options: ScanOptions = {}): Promise<ScanResult> {
  const parsedOptions = scanOptionsSchema.parse(options);
  const cwd = path.resolve(parsedOptions.cwd);
  const instructionFiles = await discoverInstructionFiles(cwd);
  const instructionFileLabel = instructionFiles.length === 1 ? "instruction file" : "instruction files";

  return {
    cwd,
    instructionFiles,
    message: `Discovered ${instructionFiles.length} ${instructionFileLabel}.`
  };
}
