// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDirectory, "../../..");

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

describe("active Admin diagnostics callers", () => {
  it.each([
    "src/components/SystemDiagnosticConsole.tsx",
    "src/admin/dashboard/AdminDashboard.tsx",
  ])("routes %s through the established authenticated helper", (file) => {
    const source = readProjectFile(file);
    expect(source).toContain('readAdminJson<any>("/api/diagnostics")');
    expect(source).not.toMatch(/fetch\(\s*["']\/api\/diagnostics/);
  });

  it("uses the helper that attaches the current Admin Bearer token", () => {
    const helper = readProjectFile("src/admin/auth/adminFetch.ts");
    expect(helper).toContain(
      'headers.set("Authorization", `Bearer ${accessToken}`);',
    );
    expect(helper).toContain("supabase.auth.getSession()");
  });

  it("routes the Admin export actions through the authenticated helper", () => {
    const source = readProjectFile(
      "src/admin/dashboard/DiagnosticExportActions.tsx",
    );
    expect(source).toContain(
      'const EXPORT_PATH = "/api/admin/diagnostic-export";',
    );
    expect(source).toContain(
      "readAdminJson<Record<string, unknown>>(EXPORT_PATH)",
    );
    expect(source).not.toMatch(/fetch\(/);
  });
});
