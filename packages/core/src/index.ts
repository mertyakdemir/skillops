import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import matter from "gray-matter";
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
  contentWithoutFrontmatter: string;
  contentStartLine: number;
  hasFrontmatter: boolean;
  metadata: InstructionMetadata;
  sizeBytes: number;
  modifiedAt: Date;
};

export type InstructionMetadata = {
  owner?: string;
  last_reviewed?: string | Date;
  tags?: string[];
  status?: string;
};

export type IssueSeverity = "low" | "medium" | "high";

export type IssueType =
  | "broken_file_reference"
  | "duplicate_instruction"
  | "missing_owner"
  | "package_manager_conflict"
  | "stale_review";

export const issueTypes = [
  "broken_file_reference",
  "package_manager_conflict",
  "duplicate_instruction",
  "missing_owner",
  "stale_review"
] as const satisfies readonly IssueType[];

export const issueSeverities = ["low", "medium", "high"] as const satisfies readonly IssueSeverity[];

export type Issue = {
  id: string;
  type: IssueType;
  severity: IssueSeverity;
  filePath: string;
  message: string;
  evidence: string;
  suggestion?: string;
};

export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export type RepositoryPackageManager = {
  name: PackageManager;
  source: string;
};

export type ScanResult = {
  cwd: string;
  instructionFiles: InstructionFile[];
  issues: Issue[];
  message: string;
};

export type ScanJsonInstructionMetadata = Omit<InstructionMetadata, "last_reviewed"> & {
  last_reviewed?: string;
};

export type ScanJsonInstructionFile = {
  path: string;
  relativePath: string;
  type: InstructionFileType;
  hasFrontmatter: boolean;
  metadata: ScanJsonInstructionMetadata;
  sizeBytes: number;
  modifiedAt: string;
};

export type ScanJsonReportSummary = {
  totalInstructionFiles: number;
  totalIssues: number;
  issuesByType: Record<IssueType, number>;
  issuesBySeverity: Record<IssueSeverity, number>;
};

export type ScanJsonReport = {
  generatedAt: string;
  rootDir: string;
  version: string;
  summary: ScanJsonReportSummary;
  instructionFiles: ScanJsonInstructionFile[];
  issues: Issue[];
};

export type CreateScanJsonReportOptions = {
  generatedAt?: Date;
  version: string;
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
const minimumDuplicateInstructionLength = 20;
const staleReviewThresholdDays = 90;
const millisecondsPerDay = 24 * 60 * 60 * 1000;
const markdownHeadingPattern = /^\s{0,3}#{1,6}(?:\s|$)/;
const codeFencePattern = /^\s*(`{3,}|~{3,})/;
const externalMarkdownLinkPattern = /!?\[[^\]]*]\((?:https?|ftp):\/\/[^)]*\)/gi;
const urlPattern = /\b(?:https?|ftp):\/\/[^\s<>)\]]+/gi;
const filePathCandidatePattern =
  /(?:^|[\s([{"'`<:])((?:\.{1,2}\/)*[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*\/[A-Za-z0-9._-]+\.[A-Za-z0-9][A-Za-z0-9_-]{0,15})(?=$|[\s)\]}>"'`,;!?:.])/g;
const packageManagerNames = ["npm", "pnpm", "yarn", "bun"] as const;
const lockfilePackageManagers: Array<{ fileName: string; packageManager: PackageManager }> = [
  { fileName: "pnpm-lock.yaml", packageManager: "pnpm" },
  { fileName: "yarn.lock", packageManager: "yarn" },
  { fileName: "package-lock.json", packageManager: "npm" },
  { fileName: "bun.lockb", packageManager: "bun" }
];
const packageManagerCommandPatterns: Array<{ packageManager: PackageManager; pattern: RegExp }> = [
  {
    packageManager: "npm",
    pattern: /(^|[^\w./@:-])(npm\s+(?:install|run)(?![\w/@:-]|\.[A-Za-z0-9_-]))/gi
  },
  {
    packageManager: "yarn",
    pattern: /(^|[^\w./@:-])(yarn(?:\s+install)?(?![\w/@:-]|\.[A-Za-z0-9_-]))/gi
  },
  {
    packageManager: "pnpm",
    pattern: /(^|[^\w./@:-])(pnpm(?:\s+install)?(?![\w/@:-]|\.[A-Za-z0-9_-]))/gi
  },
  {
    packageManager: "bun",
    pattern: /(^|[^\w./@:-])(bun(?:\s+install)?(?![\w/@:-]|\.[A-Za-z0-9_-]))/gi
  }
];

type NormalizedInstructionOccurrence = {
  normalizedInstruction: string;
  filePath: string;
  lineNumber: number;
  originalLine: string;
};

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
      const parsedContent = parseInstructionFileContent(content);

      return {
        path: filePath,
        relativePath,
        type: getInstructionFileType(relativePath),
        content,
        contentWithoutFrontmatter: parsedContent.contentWithoutFrontmatter,
        contentStartLine: parsedContent.contentStartLine,
        hasFrontmatter: parsedContent.hasFrontmatter,
        metadata: parsedContent.metadata,
        sizeBytes: fileStats.size,
        modifiedAt: fileStats.mtime
      };
    })
  );
}

export async function detectInstructionMetadataIssues(params: {
  instructionFiles: InstructionFile[];
  currentDate?: Date;
}): Promise<Issue[]> {
  const currentDate = toUtcDateOnly(params.currentDate ?? new Date());
  const issues: Issue[] = [];

  for (const instructionFile of params.instructionFiles) {
    if (!instructionFile.metadata.owner) {
      issues.push({
        id: `missing_owner:${instructionFile.relativePath}`,
        type: "missing_owner",
        severity: "medium",
        filePath: instructionFile.relativePath,
        message: "Instruction file is missing owner metadata.",
        evidence: instructionFile.hasFrontmatter
          ? "owner metadata is missing or empty."
          : "No frontmatter metadata found.",
        suggestion: "Add owner metadata to the instruction file frontmatter, for example: owner: platform-team."
      });
    }

    const lastReviewed = instructionFile.metadata.last_reviewed;

    if (lastReviewed === undefined) {
      issues.push({
        id: `stale_review:${instructionFile.relativePath}`,
        type: "stale_review",
        severity: "medium",
        filePath: instructionFile.relativePath,
        message: "Instruction file is missing last_reviewed metadata.",
        evidence: instructionFile.hasFrontmatter
          ? "last_reviewed metadata is missing."
          : "No frontmatter metadata found.",
        suggestion: "Add a recent last_reviewed date in YYYY-MM-DD format to the instruction file frontmatter."
      });
      continue;
    }

    const parsedLastReviewed = parseLastReviewedDate(lastReviewed);

    if (!parsedLastReviewed) {
      issues.push({
        id: `stale_review:${instructionFile.relativePath}`,
        type: "stale_review",
        severity: "medium",
        filePath: instructionFile.relativePath,
        message: "Instruction file has invalid last_reviewed metadata.",
        evidence: `last_reviewed: ${formatMetadataValue(lastReviewed)}`,
        suggestion: `Use a YYYY-MM-DD last_reviewed date, for example: last_reviewed: ${formatDateOnly(currentDate)}.`
      });
      continue;
    }

    const daysSinceReview = Math.floor((currentDate.getTime() - parsedLastReviewed.getTime()) / millisecondsPerDay);

    if (daysSinceReview > staleReviewThresholdDays) {
      issues.push({
        id: `stale_review:${instructionFile.relativePath}`,
        type: "stale_review",
        severity: "medium",
        filePath: instructionFile.relativePath,
        message: "Instruction file review metadata is stale.",
        evidence: `last_reviewed: ${formatDateOnly(parsedLastReviewed)} (${daysSinceReview} days old)`,
        suggestion: "Review the instruction file and update last_reviewed to the current YYYY-MM-DD date."
      });
    }
  }

  return issues;
}

export async function detectBrokenFileReferences(params: {
  rootDir: string;
  instructionFiles: InstructionFile[];
}): Promise<Issue[]> {
  const resolvedRootDir = path.resolve(params.rootDir);
  const issues: Issue[] = [];
  const seenIssueKeys = new Set<string>();

  for (const instructionFile of params.instructionFiles) {
    for (const { line, lineNumber } of getInstructionContentLines(instructionFile)) {
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
          evidence: `Line ${lineNumber}: ${line.trim()}`,
          suggestion: "Create the referenced file or update the instruction to point at an existing path."
        });
      }
    }
  }

  return issues;
}

export async function detectDuplicateInstructions(params: {
  instructionFiles: InstructionFile[];
}): Promise<Issue[]> {
  const occurrencesByNormalizedInstruction = new Map<string, NormalizedInstructionOccurrence[]>();

  for (const instructionFile of params.instructionFiles) {
    for (const occurrence of extractNormalizedInstructionOccurrences(instructionFile)) {
      const occurrences = occurrencesByNormalizedInstruction.get(occurrence.normalizedInstruction) ?? [];
      occurrences.push(occurrence);
      occurrencesByNormalizedInstruction.set(occurrence.normalizedInstruction, occurrences);
    }
  }

  const issues: Issue[] = [];

  for (const [normalizedInstruction, occurrences] of occurrencesByNormalizedInstruction) {
    const firstOccurrenceByFilePath = new Map<string, NormalizedInstructionOccurrence>();

    for (const occurrence of occurrences) {
      if (!firstOccurrenceByFilePath.has(occurrence.filePath)) {
        firstOccurrenceByFilePath.set(occurrence.filePath, occurrence);
      }
    }

    if (firstOccurrenceByFilePath.size < 2) {
      continue;
    }

    const duplicateOccurrences = Array.from(firstOccurrenceByFilePath.values());

    for (const occurrence of duplicateOccurrences) {
      const duplicateFilePaths = duplicateOccurrences
        .filter((duplicateOccurrence) => duplicateOccurrence.filePath !== occurrence.filePath)
        .map((duplicateOccurrence) => duplicateOccurrence.filePath);

      issues.push({
        id: `duplicate_instruction:${occurrence.filePath}:${occurrence.lineNumber}:${toIssueIdFragment(normalizedInstruction)}`,
        type: "duplicate_instruction",
        severity: "low",
        filePath: occurrence.filePath,
        message: `Instruction duplicates guidance also found in ${formatFileList(duplicateFilePaths)}.`,
        evidence: `Line ${occurrence.lineNumber}: ${occurrence.originalLine.trim()}`,
        suggestion: "Keep this guidance in a single instruction file or remove or reword the duplicate."
      });
    }
  }

  return issues;
}

export async function detectRepositoryPackageManager(
  rootDir: string
): Promise<RepositoryPackageManager | undefined> {
  const resolvedRootDir = path.resolve(rootDir);
  const packageJsonPackageManager = await detectPackageManagerFromPackageJson(resolvedRootDir);

  if (packageJsonPackageManager) {
    return packageJsonPackageManager;
  }

  for (const lockfilePackageManager of lockfilePackageManagers) {
    const lockfilePath = path.join(resolvedRootDir, lockfilePackageManager.fileName);

    if (await fileExists(lockfilePath)) {
      return {
        name: lockfilePackageManager.packageManager,
        source: lockfilePackageManager.fileName
      };
    }
  }

  return undefined;
}

export async function detectPackageManagerConflicts(params: {
  rootDir: string;
  instructionFiles: InstructionFile[];
}): Promise<Issue[]> {
  const repositoryPackageManager = await detectRepositoryPackageManager(params.rootDir);

  if (!repositoryPackageManager) {
    return [];
  }

  const issues: Issue[] = [];
  const seenIssueKeys = new Set<string>();

  for (const instructionFile of params.instructionFiles) {
    for (const { line, lineNumber } of getInstructionContentLines(instructionFile)) {
      for (const commandPattern of packageManagerCommandPatterns) {
        if (commandPattern.packageManager === repositoryPackageManager.name) {
          continue;
        }

        for (const match of line.matchAll(commandPattern.pattern)) {
          const command = match[2]?.replace(/\s+/g, " ").trim();

          if (!command) {
            continue;
          }

          const issueKey = `${instructionFile.relativePath}\0${lineNumber}\0${command.toLowerCase()}`;

          if (seenIssueKeys.has(issueKey)) {
            continue;
          }

          seenIssueKeys.add(issueKey);
          issues.push({
            id: `package_manager_conflict:${instructionFile.relativePath}:${lineNumber}:${command.toLowerCase().replace(/\s+/g, "_")}`,
            type: "package_manager_conflict",
            severity: "medium",
            filePath: instructionFile.relativePath,
            message: `Instruction file uses ${commandPattern.packageManager} command "${command}" but this repository uses ${repositoryPackageManager.name}.`,
            evidence: `Line ${lineNumber}: ${line.trim()}`,
            suggestion: `Replace ${commandPattern.packageManager} commands with ${repositoryPackageManager.name} equivalents, or update the repository package manager metadata if ${commandPattern.packageManager} is intended.`
          });
        }
      }
    }
  }

  return issues;
}

export async function scanRepository(options: ScanOptions = {}): Promise<ScanResult> {
  const parsedOptions = scanOptionsSchema.parse(options);
  const cwd = path.resolve(parsedOptions.cwd);
  const instructionFiles = await discoverInstructionFiles(cwd);
  const [
    instructionMetadataIssues,
    brokenFileReferenceIssues,
    duplicateInstructionIssues,
    packageManagerConflictIssues
  ] = await Promise.all([
    detectInstructionMetadataIssues({ instructionFiles }),
    detectBrokenFileReferences({ rootDir: cwd, instructionFiles }),
    detectDuplicateInstructions({ instructionFiles }),
    detectPackageManagerConflicts({ rootDir: cwd, instructionFiles })
  ]);
  const issues = [
    ...instructionMetadataIssues,
    ...brokenFileReferenceIssues,
    ...duplicateInstructionIssues,
    ...packageManagerConflictIssues
  ];
  const instructionFileLabel = instructionFiles.length === 1 ? "instruction file" : "instruction files";

  return {
    cwd,
    instructionFiles,
    issues,
    message: `Discovered ${instructionFiles.length} ${instructionFileLabel}.`
  };
}

export function createScanJsonReport(
  result: ScanResult,
  options: CreateScanJsonReportOptions
): ScanJsonReport {
  const issuesByType = createEmptyIssueTypeCounts();
  const issuesBySeverity = createEmptyIssueSeverityCounts();

  for (const issue of result.issues) {
    issuesByType[issue.type] += 1;
    issuesBySeverity[issue.severity] += 1;
  }

  return {
    generatedAt: (options.generatedAt ?? new Date()).toISOString(),
    rootDir: result.cwd,
    version: options.version,
    summary: {
      totalInstructionFiles: result.instructionFiles.length,
      totalIssues: result.issues.length,
      issuesByType,
      issuesBySeverity
    },
    instructionFiles: result.instructionFiles.map((instructionFile) => ({
      path: instructionFile.path,
      relativePath: instructionFile.relativePath,
      type: instructionFile.type,
      hasFrontmatter: instructionFile.hasFrontmatter,
      metadata: serializeInstructionMetadata(instructionFile.metadata),
      sizeBytes: instructionFile.sizeBytes,
      modifiedAt: instructionFile.modifiedAt.toISOString()
    })),
    issues: result.issues
  };
}

function extractNormalizedInstructionOccurrences(
  instructionFile: InstructionFile
): NormalizedInstructionOccurrence[] {
  const occurrences: NormalizedInstructionOccurrence[] = [];
  let isInsideCodeFence = false;

  for (const { line, lineNumber } of getInstructionContentLines(instructionFile)) {
    const trimmedLine = line.trim();

    if (trimmedLine.length === 0) {
      continue;
    }

    if (codeFencePattern.test(trimmedLine)) {
      isInsideCodeFence = !isInsideCodeFence;
      continue;
    }

    if (isInsideCodeFence || markdownHeadingPattern.test(line)) {
      continue;
    }

    const normalizedInstruction = normalizeInstructionLine(line);

    if (!normalizedInstruction) {
      continue;
    }

    occurrences.push({
      normalizedInstruction,
      filePath: instructionFile.relativePath,
      lineNumber,
      originalLine: line
    });
  }

  return occurrences;
}

function normalizeInstructionLine(line: string): string | undefined {
  const normalizedInstruction = line
    .toLowerCase()
    .trim()
    .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedInstruction.length < minimumDuplicateInstructionLength) {
    return undefined;
  }

  return normalizedInstruction;
}

function parseInstructionFileContent(content: string): {
  contentWithoutFrontmatter: string;
  contentStartLine: number;
  hasFrontmatter: boolean;
  metadata: InstructionMetadata;
} {
  const hasFrontmatter = matter.test(content);
  const parsedContent = matter(content);

  return {
    contentWithoutFrontmatter: parsedContent.content,
    contentStartLine: getContentStartLine(content, hasFrontmatter),
    hasFrontmatter,
    metadata: normalizeInstructionMetadata(parsedContent.data)
  };
}

function normalizeInstructionMetadata(data: Record<string, unknown>): InstructionMetadata {
  const metadata: InstructionMetadata = {};
  const owner = normalizeStringMetadataValue(data.owner);
  const lastReviewed = normalizeLastReviewedMetadataValue(data.last_reviewed);
  const tags = normalizeTagsMetadataValue(data.tags);
  const status = normalizeStringMetadataValue(data.status);

  if (owner) {
    metadata.owner = owner;
  }

  if (lastReviewed !== undefined) {
    metadata.last_reviewed = lastReviewed;
  }

  if (tags) {
    metadata.tags = tags;
  }

  if (status) {
    metadata.status = status;
  }

  return metadata;
}

function normalizeStringMetadataValue(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}

function normalizeLastReviewedMetadataValue(value: unknown): string | Date | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (value instanceof Date) {
    return value;
  }

  if (typeof value === "string") {
    const trimmedValue = value.trim();
    return trimmedValue.length > 0 ? trimmedValue : undefined;
  }

  return String(value);
}

function normalizeTagsMetadataValue(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const tags = value.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
    .map((tag) => tag.trim());

  return tags.length > 0 ? tags : undefined;
}

function getContentStartLine(content: string, hasFrontmatter: boolean): number {
  if (!hasFrontmatter) {
    return 1;
  }

  const lines = content.split(/\r?\n/);

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    if (lines[lineIndex]?.trim() === "---") {
      return lineIndex + 2;
    }
  }

  return 1;
}

function getInstructionContentLines(instructionFile: InstructionFile): Array<{ line: string; lineNumber: number }> {
  return instructionFile.contentWithoutFrontmatter.split(/\r?\n/).map((line, lineIndex) => ({
    line,
    lineNumber: instructionFile.contentStartLine + lineIndex
  }));
}

function parseLastReviewedDate(value: string | Date): Date | undefined {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return undefined;
    }

    return toUtcDateOnly(value);
  }

  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!dateMatch) {
    return undefined;
  }

  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]);
  const day = Number(dateMatch[3]);
  const parsedDate = new Date(Date.UTC(year, month - 1, day));

  if (
    parsedDate.getUTCFullYear() !== year ||
    parsedDate.getUTCMonth() !== month - 1 ||
    parsedDate.getUTCDate() !== day
  ) {
    return undefined;
  }

  return parsedDate;
}

function toUtcDateOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function formatDateOnly(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function createEmptyIssueTypeCounts(): Record<IssueType, number> {
  return Object.fromEntries(issueTypes.map((issueType) => [issueType, 0])) as Record<IssueType, number>;
}

function createEmptyIssueSeverityCounts(): Record<IssueSeverity, number> {
  return Object.fromEntries(issueSeverities.map((severity) => [severity, 0])) as Record<IssueSeverity, number>;
}

function serializeInstructionMetadata(metadata: InstructionMetadata): ScanJsonInstructionMetadata {
  const serializedMetadata: ScanJsonInstructionMetadata = {};

  if (metadata.owner) {
    serializedMetadata.owner = metadata.owner;
  }

  if (metadata.last_reviewed !== undefined) {
    serializedMetadata.last_reviewed = metadata.last_reviewed instanceof Date
      ? formatDateOnly(metadata.last_reviewed)
      : metadata.last_reviewed;
  }

  if (metadata.tags) {
    serializedMetadata.tags = metadata.tags;
  }

  if (metadata.status) {
    serializedMetadata.status = metadata.status;
  }

  return serializedMetadata;
}

function formatMetadataValue(value: string | Date): string {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "Invalid Date" : formatDateOnly(value);
  }

  return value;
}

function formatFileList(filePaths: string[]): string {
  if (filePaths.length === 1) {
    return `"${filePaths[0]}"`;
  }

  if (filePaths.length === 2) {
    return `"${filePaths[0]}" and "${filePaths[1]}"`;
  }

  const initialFilePaths = filePaths.slice(0, -1).map((filePath) => `"${filePath}"`);
  const finalFilePath = filePaths[filePaths.length - 1];

  return `${initialFilePaths.join(", ")}, and "${finalFilePath}"`;
}

function toIssueIdFragment(value: string): string {
  return value.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 64) || "instruction";
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

async function detectPackageManagerFromPackageJson(
  rootDir: string
): Promise<RepositoryPackageManager | undefined> {
  const packageJsonPath = path.join(rootDir, "package.json");

  if (!(await fileExists(packageJsonPath))) {
    return undefined;
  }

  const packageJsonContent = await readFile(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonContent) as unknown;

  if (!isRecord(packageJson) || typeof packageJson.packageManager !== "string") {
    return undefined;
  }

  const packageManager = parsePackageManagerName(packageJson.packageManager);

  if (!packageManager) {
    return undefined;
  }

  return {
    name: packageManager,
    source: "package.json packageManager"
  };
}

function parsePackageManagerName(packageManagerField: string): PackageManager | undefined {
  const packageManagerName = packageManagerField.split("@")[0];

  if (isPackageManager(packageManagerName)) {
    return packageManagerName;
  }

  return undefined;
}

function isPackageManager(value: string | undefined): value is PackageManager {
  return packageManagerNames.some((packageManagerName) => packageManagerName === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
