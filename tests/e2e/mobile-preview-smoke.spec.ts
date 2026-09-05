import { expect, test } from "@playwright/test";

test("@smoke public preview stays usable on a phone viewport", async ({ page }) => {
  await page.goto("/preview");
  await expect(page).toHaveTitle(/ORBIS Foundation — Read-only Preview/);
  await expect(
    page.getByText("ORBIS Foundation Control Center", { exact: true }),
  ).toBeVisible();

  const overflow = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    document: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));

  expect(overflow.document).toBeLessThanOrEqual(overflow.viewport + 1);
  expect(overflow.body).toBeLessThanOrEqual(overflow.viewport + 1);

  await expect(
    page.getByRole("button", { name: /ORBiS Accounting AI/i }),
  ).toBeVisible();
});
