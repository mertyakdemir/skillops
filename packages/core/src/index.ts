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

export type IssueSeverity = "low" | "medium" | "high";

export type Issue = {
  id: string;
  type: "broken_file_reference";
  severity: IssueSeverity;
  filePath: string;
  message: string;
  evidence: string;
  suggestion?: string;
};

export type ScanResult = {
  cwd: string;
  instructionFiles: InstructionFile[];
  issues: Issue[];
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
const externalMarkdownLinkPattern = /!?\[[^\]]*]\((?:https?|ftp):\/\/[^)]*\)/gi;
const urlPattern = /\b(?:https?|ftp):\/\/[^\s<>)\]]+/gi;
const filePathCandidatePattern =
  /(?:^|[\s([{"'`<:])((?:\.{1,2}\/)*[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/[A-Za-z0-9._-]+\.[A-Za-z0-9][A-Za-z0-9_-]{0,15})(?=$|[\s)\]}>"'`,;!?:.])/g;

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

export async function detectBrokenFileReferences(params: {
  rootDir: string;
  instructionFiles: InstructionFile[];
}): Promise<Issue[]> {
  const resolvedRootDir = path.resolve(params.rootDir);
  const issues: Issue[] = [];
  const seenIssueKeys = new Set<string>();

  for (const instructionFile of params.instructionFiles) {
    const lines = instructionFile.content.split(/\r?\n/);

    for (const [lineIndex, line] of lines.entries()) {
      const lineWithoutUrls = line.replace(externalMarkdownLinkPattern, " ").replace(urlPattern, " ");

      for (const match of lineWithoutUrls.matchAll(filePathCandidatePattern)) {
        const referencedPath = match[1];

        if (!referencedPath || !isLikelyRepoFileReference(referencedPath)) {
          continue;
        }

        const resolvedReferencePath = resolveReferencedPath({
          rootDir: resolvedRootDir,
          instructionFile,
          referencedPath
        });

        if (!resolvedReferencePath) {
          continue;
        }

        if (await fileExists(resolvedReferencePath)) {
          continue;
        }

        const repoRelativeReferencePath = toRepoRelativePath(resolvedRootDir, resolvedReferencePath);
        const issueKey = `${instructionFile.relativePath}\0${repoRelativeReferencePath}`;

        if (seenIssueKeys.has(issueKey)) {
          continue;
        }

        seenIssueKeys.add(issueKey);
        issues.push({
          id: `broken_file_reference:${instructionFile.relativePath}:${repoRelativeReferencePath}`,
          type: "broken_file_reference",
          severity: "medium",
          filePath: instructionFile.relativePath,
          message: `Instruction file references missing file "${repoRelativeReferencePath}".`,
          evidence: `Line ${lineIndex + 1}: ${line.trim()}`,
          suggestion: "Create the referenced file or update the instruction to point at an existing path."
        });
      }
    }
  }

  return issues;
}

export async function scanRepository(options: ScanOptions = {}): Promise<ScanResult> {
  const parsedOptions = scanOptionsSchema.parse(options);
  const cwd = path.resolve(parsedOptions.cwd);
  const instructionFiles = await discoverInstructionFiles(cwd);
  const issues = await detectBrokenFileReferences({ rootDir: cwd, instructionFiles });
  const instructionFileLabel = instructionFiles.length === 1 ? "instruction file" : "instruction files";

  return {
    cwd,
    instructionFiles,
    issues,
    message: `Discovered ${instructionFiles.length} ${instructionFileLabel}.`
  };
}

function isLikelyRepoFileReference(referencedPath: string): boolean {
  if (referencedPath.includes("://") || referencedPath.startsWith("@")) {
    return false;
  }

  const pathSegments = referencedPath.split("/");
  const firstRepoSegment = pathSegments.find((segment) => segment !== "." && segment !== "..");

  if (!firstRepoSegment) {
    return false;
  }

  return !firstRepoSegment.includes(".") || firstRepoSegment.startsWith(".");
}

function resolveReferencedPath(params: {
  rootDir: string;
  instructionFile: InstructionFile;
  referencedPath: string;
}): string | undefined {
  const baseDir = params.referencedPath.startsWith(".")
    ? path.dirname(params.instructionFile.path)
    : params.rootDir;
  const resolvedReferencePath = path.resolve(baseDir, params.referencedPath);
  const rootDirWithSeparator = params.rootDir.endsWith(path.sep)
    ? params.rootDir
    : `${params.rootDir}${path.sep}`;

  if (resolvedReferencePath !== params.rootDir && !resolvedReferencePath.startsWith(rootDirWithSeparator)) {
    return undefined;
  }

  return resolvedReferencePath;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (isMissingPathError(error)) {
      return false;
    }

    throw error;
  }
}

function isMissingPathError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error.code === "ENOENT" || error.code === "ENOTDIR")
  );
}

function toRepoRelativePath(rootDir: string, absolutePath: string): string {
  return path.relative(rootDir, absolutePath).split(path.sep).join("/");
}
