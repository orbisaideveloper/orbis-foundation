import { expect, test, type Page } from "@playwright/test";

const ACCOUNTING_HARNESS = "/tests/e2e/accounting-harness.html";
const ACCOUNTING_DASHBOARD_TEXT = "Demo Lottery dashboard";

async function openAccountingHarness(page: Page) {
  await page.goto(ACCOUNTING_HARNESS);
  await expect(page.getByText(ACCOUNTING_DASHBOARD_TEXT)).toBeVisible();
}

async function readMobileLayout(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.right > root.clientWidth + 1 || rect.left < -1;
      })
      .slice(0, 20)
      .map((element) => ({
        tag: element.tagName,
        text: (element.textContent || "").trim().slice(0, 80),
        left: element.getBoundingClientRect().left,
        right: element.getBoundingClientRect().right,
      }));
    return {
      viewport: root.clientWidth,
      documentWidth: root.scrollWidth,
      overflowing,
    };
  });
}

test("@smoke accounting workspace has no horizontal overflow on mobile", async ({
  page,
}) => {
  await openAccountingHarness(page);

  const layout = await readMobileLayout(page);

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.overflowing).toEqual([]);
});
