import fg from "fast-glob";
import { z } from "zod";

export const scanOptionsSchema = z.object({
  cwd: z.string().default(process.cwd())
});

export type ScanOptions = z.input<typeof scanOptionsSchema>;

export type ScanResult = {
  cwd: string;
  instructionFiles: string[];
  message: string;
};

const instructionFilePatterns = [
  "AGENTS.md",
  "**/AGENTS.md",
  ".cursorrules",
  "**/.cursorrules"
];

export async function scanRepository(options: ScanOptions = {}): Promise<ScanResult> {
  const parsedOptions = scanOptionsSchema.parse(options);
  const instructionFiles = await fg(instructionFilePatterns, {
    cwd: parsedOptions.cwd,
    dot: true,
    ignore: ["**/node_modules/**", "**/dist/**", "**/.git/**"],
    onlyFiles: true,
    unique: true
  });

  return {
    cwd: parsedOptions.cwd,
    instructionFiles,
    message: "SkillOps scanner coming soon."
  };
}
