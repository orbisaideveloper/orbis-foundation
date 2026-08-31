// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const renderConfig = fs.readFileSync(path.resolve("render.yaml"), "utf8");

describe("Render build configuration", () => {
  it("generates the Prisma client before the production build", () => {
    expect(renderConfig).toContain(
      "buildCommand: npm ci && ./node_modules/.bin/prisma generate && npm run build",
    );
  });
});
