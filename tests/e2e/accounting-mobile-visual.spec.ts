import { expect, test } from "@playwright/test";

test("@visual accounting workspace has no horizontal overflow on mobile", async ({
  page,
}) => {
  await page.goto("/tests/e2e/accounting-harness.html");
  await expect(page.getByText("Demo Lottery dashboard")).toBeVisible();

  const layout = await page.evaluate(() => {
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

  expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewport + 1);
  expect(layout.overflowing).toEqual([]);

  await expect(page).toHaveScreenshot("accounting-mobile.png", {
    fullPage: true,
    animations: "disabled",
  });
});
