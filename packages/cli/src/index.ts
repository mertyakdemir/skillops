#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import chalk from "chalk";
import { Command } from "commander";

import {
  createScanJsonReport,
  scanRepository as scanRepositoryCore,
  type ScanResult
} from "@skillops/core";

const skillOpsVersion = "0.1.0";

type OutputWriter = {
  write(message: string): unknown;
};

type ScanCommandOptions = {
  json?: boolean;
  output?: string;
};

type WriteTextFile = (filePath: string, data: string, encoding: BufferEncoding) => Promise<void>;
type MakeDirectory = (dirPath: string, options: { recursive: true }) => Promise<unknown>;

type CliDependencies = {
  generatedAt?: () => Date;
  makeDirectory?: MakeDirectory;
  scanRepository?: typeof scanRepositoryCore;
  stdout?: OutputWriter;
  writeTextFile?: WriteTextFile;
};

export function createCli(dependencies: CliDependencies = {}): Command {
  const generatedAt = dependencies.generatedAt ?? (() => new Date());
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const scanRepository = dependencies.scanRepository ?? scanRepositoryCore;
  const stdout = dependencies.stdout ?? process.stdout;
  const writeTextFile = dependencies.writeTextFile ?? writeFile;
  const program = new Command();

  program
    .name("skillops")
    .description("Scan repositories for stale, broken, duplicated, and conflicting AI agent instructions.")
    .version(skillOpsVersion);

  program
    .command("scan")
    .description("Scan the current repository for AI agent instruction issues.")
    .option("--json", "Print a machine-readable JSON report to stdout.")
    .option("--output <file>", "Write a machine-readable JSON report to a file.")
    .action(async (options: ScanCommandOptions) => {
      const result = await scanRepository();

      if (options.json || options.output) {
        const report = createScanJsonReport(result, {
          generatedAt: generatedAt(),
          version: skillOpsVersion
        });
        const jsonReport = `${JSON.stringify(report, null, 2)}\n`;

        if (options.output) {
          const outputPath = path.resolve(options.output);
          await makeDirectory(path.dirname(outputPath), { recursive: true });
          await writeTextFile(outputPath, jsonReport, "utf8");
        }

        if (options.json) {
          stdout.write(jsonReport);
        }

        return;
      }

      stdout.write(formatHumanReadableScanResult(result));
    });

  return program;
}

export function formatHumanReadableScanResult(result: ScanResult): string {
  const lines = [chalk.cyan(result.message)];

  for (const file of result.instructionFiles) {
    lines.push(`${chalk.green("-")} ${file.relativePath} ${chalk.dim(`(${file.type}, ${file.sizeBytes} bytes)`)}`);
  }

  if (result.issues.length === 0) {
    lines.push(chalk.dim("No issues found."));
    return `${lines.join("\n")}\n`;
  }

  const issueLabel = result.issues.length === 1 ? "issue" : "issues";
  lines.push(chalk.yellow(`Found ${result.issues.length} ${issueLabel}.`));

  for (const issue of result.issues) {
    lines.push(`${chalk.yellow("-")} ${chalk.bold(issue.type)} ${chalk.dim(`[${issue.severity}]`)} in ${issue.filePath}`);
    lines.push(`  ${issue.message}`);
    lines.push(`  Evidence: ${issue.evidence}`);

    if (issue.suggestion) {
      lines.push(`  Suggestion: ${issue.suggestion}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

function isCliEntrypoint(entrypoint: string | undefined): boolean {
  return entrypoint !== undefined && import.meta.url === pathToFileURL(entrypoint).href;
}

if (isCliEntrypoint(process.argv[1])) {
  await createCli().parseAsync(process.argv);
}
