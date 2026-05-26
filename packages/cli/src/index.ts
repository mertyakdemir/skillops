#!/usr/bin/env node
import chalk from "chalk";
import { Command } from "commander";

import { scanRepository } from "@skillops/core";

export function createCli(): Command {
  const program = new Command();

  program
    .name("skillops")
    .description("Scan repositories for stale, broken, duplicated, and conflicting AI agent instructions.")
    .version("0.1.0");

  program
    .command("scan")
    .description("Scan the current repository for AI agent instruction issues.")
    .action(async () => {
      const result = await scanRepository();
      console.log(chalk.cyan(result.message));

      for (const file of result.instructionFiles) {
        console.log(`${chalk.green("-")} ${file.relativePath} ${chalk.dim(`(${file.type}, ${file.sizeBytes} bytes)`)}`);
      }

      if (result.issues.length === 0) {
        console.log(chalk.dim("No issues found."));
        return;
      }

      const issueLabel = result.issues.length === 1 ? "issue" : "issues";
      console.log(chalk.yellow(`Found ${result.issues.length} ${issueLabel}.`));

      for (const issue of result.issues) {
        console.log(`${chalk.yellow("-")} ${chalk.bold(issue.type)} ${chalk.dim(`[${issue.severity}]`)} in ${issue.filePath}`);
        console.log(`  ${issue.message}`);
        console.log(`  Evidence: ${issue.evidence}`);

        if (issue.suggestion) {
          console.log(`  Suggestion: ${issue.suggestion}`);
        }
      }
    });

  return program;
}

await createCli().parseAsync(process.argv);
