// @vitest-environment node

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ACCOUNTING_PATH = "/accounting";

function read(relativePath: string): string {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("Accounting PWA assets", () => {
  it("ships an installable Accounting-scoped manifest", () => {
    const manifest = JSON.parse(read("public/accounting.webmanifest"));

    expect(manifest).toMatchObject({
      name: "ORBIS Accounting",
      short_name: "ORBIS",
      id: ACCOUNTING_PATH,
      start_url: ACCOUNTING_PATH,
      scope: ACCOUNTING_PATH,
      display: "standalone",
    });
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sizes: "192x192" }),
        expect.objectContaining({ sizes: "512x512" }),
      ]),
    );
  });

  it("keeps authenticated APIs and cross-origin auth traffic out of the worker cache", () => {
    const worker = read("public/accounting-sw.js");

    expect(worker).toContain('url.origin !== self.location.origin');
    expect(worker).toContain('url.pathname.startsWith("/api/")');
    expect(worker).toContain('request.method !== "GET"');
    expect(worker).toContain(`caches.match("${ACCOUNTING_PATH}")`);
  });

  it("links the Accounting manifest from the app shell", () => {
    const html = read("index.html");
    expect(html).toContain('rel="manifest" href="/accounting.webmanifest"');
  });
});
