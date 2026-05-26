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
    });

  return program;
}

await createCli().parseAsync(process.argv);
