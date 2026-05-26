import { describe, expect, it } from "vitest";

import { scanRepository } from "./index.js";

describe("scanRepository", () => {
  it("returns the scanner placeholder message", async () => {
    await expect(scanRepository()).resolves.toMatchObject({
      message: "SkillOps scanner coming soon."
    });
  });
});
