import { expect, test } from "@playwright/test";

const ACCOUNTING_PATH = "/accounting";
const MANIFEST_PATH = "/accounting.webmanifest";
const WORKER_PATH = "/accounting-sw.js";
const ICON_192_PATH = "/accounting-icon-192.svg";
const ICON_512_PATH = "/accounting-icon-512.svg";

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    return {
      viewportWidth: root.clientWidth,
      documentWidth: root.scrollWidth,
    };
  });

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
}

test("@smoke Accounting auth shell loads directly and fits mobile", async ({
  page,
}) => {
  await page.goto(ACCOUNTING_PATH);

  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create account" })).toBeVisible();
  await expect(
    page.locator(`link[rel="manifest"][href="${MANIFEST_PATH}"]`),
  ).toHaveCount(1);
  await expectNoHorizontalOverflow(page);
});

test("@smoke Accounting PWA assets are publicly reachable", async ({ request }) => {
  for (const path of [
    MANIFEST_PATH,
    WORKER_PATH,
    ICON_192_PATH,
    ICON_512_PATH,
  ]) {
    const response = await request.get(path);
    expect(response.ok(), `${path} should return 2xx`).toBe(true);
  }

  const manifestResponse = await request.get(MANIFEST_PATH);
  const manifest = await manifestResponse.json();
  expect(manifest).toMatchObject({
    id: ACCOUNTING_PATH,
    start_url: ACCOUNTING_PATH,
    scope: ACCOUNTING_PATH,
    display: "standalone",
  });

  const workerResponse = await request.get(WORKER_PATH);
  const worker = await workerResponse.text();
  expect(worker).toContain('url.pathname.startsWith("/api/")');
  expect(worker).toContain('request.method !== "GET"');
});
