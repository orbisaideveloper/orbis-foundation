import { expect, test, type Locator, type Page } from "@playwright/test";

const PUBLIC_HARNESS = "/tests/e2e/accounting-public-harness.html";
const PUBLIC_SHELL_TEST_ID = "accounting-public-shell";
const TEST_VIEWER_NAME = "Test User";
const SIGNATURE_LIGHT = "SIGNATURE_LIGHT";
const SIGNATURE_DARK = "SIGNATURE_DARK";
const APPROVED_VISUAL_TIME = new Date("2026-09-06T14:30:00+05:30");

test.use({ timezoneId: "Asia/Kolkata" });

async function openPublicHarness(page: Page) {
  await page.clock.setFixedTime(APPROVED_VISUAL_TIME);
  await page.goto(PUBLIC_HARNESS);
  await expect(page.getByTestId(PUBLIC_SHELL_TEST_ID)).toBeVisible();
  await expect(page.getByText("Demo Lottery dashboard")).toBeVisible();
}

async function openPublicMenu(page: Page) {
  await page.getByRole("button", { name: "Open public menu" }).click();
  await expect(
    page.getByRole("dialog", { name: "Accounting public menu" }),
  ).toBeVisible();
}

async function expectNoHorizontalOverflow(page: Page) {
  const layout = await page.evaluate(() => {
    const root = document.documentElement;
    const overflowing = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        const extendsBeyondViewport =
          rect.right > root.clientWidth + 1 || rect.left < -1;

        // Decorative greeting glow is intentionally clipped by its
        // overflow-hidden greeting container and does not widen the document.
        const isClippedGreetingGlow = element.classList.contains(
          "orbis-public-greeting-glow",
        );

        // The off-canvas drawer may sit outside the viewport while closed.
        const isPublicDrawer = Boolean(
          element.closest(".orbis-public-drawer-backdrop"),
        );

        return (
          extendsBeyondViewport &&
          !isClippedGreetingGlow &&
          !isPublicDrawer
        );
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
}

async function expectSignatureShell(shell: Locator, appearance: string) {
  await expect(shell).toHaveAttribute("data-accounting-appearance", appearance);
  await expect(shell.getByText("ORBiS Accounting AI")).toBeVisible();
  await expect(
    shell.getByRole("heading", { name: new RegExp(TEST_VIEWER_NAME) }),
  ).toBeVisible();
}

async function expectFixedMobileChrome(page: Page) {
  const chrome = await page.evaluate(() => {
    const header = document.querySelector<HTMLElement>(".orbis-public-app-header");
    const nav = document.querySelector<HTMLElement>(
      '[aria-label="Accounting workspace sections"]',
    );
    if (!header || !nav) {
      return null;
    }
    return {
      headerPosition: getComputedStyle(header).position,
      navPosition: getComputedStyle(nav).position,
      navBottom: getComputedStyle(nav).bottom,
    };
  });

  expect(chrome).not.toBeNull();
  expect(chrome?.headerPosition).toBe("sticky");
  expect(chrome?.navPosition).toBe("fixed");

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(page.locator(".orbis-public-app-header")).toBeInViewport();
  await expect(
    page.locator('[aria-label="Accounting workspace sections"]'),
  ).toBeInViewport();
}

test("@smoke accounting public Signature Emerald mobile app shell", async ({
  page,
}) => {
  await openPublicHarness(page);

  const shell = page.getByTestId(PUBLIC_SHELL_TEST_ID);
  await expectSignatureShell(shell, SIGNATURE_LIGHT);
  await expect(page.getByRole("button", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("button", { name: "User profile" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open public menu" })).toBeVisible();
  await expectFixedMobileChrome(page);
  await expectNoHorizontalOverflow(page);
});

test("@smoke accounting public drawer exposes settings and shortcuts", async ({
  page,
}) => {
  await openPublicHarness(page);
  await openPublicMenu(page);

  const drawer = page.getByRole("dialog", { name: "Accounting public menu" });
  await expect(drawer.getByText("Party Ledger")).toBeVisible();
  await expect(drawer.getByText("Version information")).toBeVisible();
  await expect(
    drawer.getByRole("region", { name: /Accounting language/i }),
  ).toBeVisible();
  await expect(
    drawer.getByRole("region", { name: /Accounting appearance/i }),
  ).toBeVisible();

  await drawer.getByRole("button", { name: "Ledger", exact: true }).click();
  await expect(page.getByText("Universal Ledger Hub")).toBeVisible();
});

test("@smoke accounting public Signature Emerald Dark fits mobile", async ({
  page,
}) => {
  await openPublicHarness(page);
  await openPublicMenu(page);

  await page
    .getByRole("button", { name: /Signature Emerald Dark/i })
    .click();

  const shell = page.getByTestId(PUBLIC_SHELL_TEST_ID);
  await expectSignatureShell(shell, SIGNATURE_DARK);
  await expectNoHorizontalOverflow(page);
});

test("@smoke accounting public language switch keeps greeting and layout", async ({
  page,
}) => {
  await openPublicHarness(page);
  await openPublicMenu(page);

  await page.getByRole("button", { name: /বাংলা · BN/i }).click();

  await expect(page.locator('section[lang="bn-IN"]')).toBeVisible();
  await expect(
    page
      .getByTestId(PUBLIC_SHELL_TEST_ID)
      .getByRole("heading", { name: new RegExp(TEST_VIEWER_NAME) }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("@visual accounting public Signature Emerald shell", async ({ page }) => {
  await openPublicHarness(page);

  await expect(page.getByTestId(PUBLIC_SHELL_TEST_ID)).toHaveScreenshot(
    "accounting-public-signature-emerald.png",
    {
      animations: "disabled",
      timeout: 15_000,
    },
  );
});

test("@visual accounting public Signature Emerald Dark shell", async ({ page }) => {
  await openPublicHarness(page);
  await openPublicMenu(page);

  await page
    .getByRole("button", { name: /Signature Emerald Dark/i })
    .click();
  await page.getByRole("button", { name: "Close public menu" }).click();

  await expect(page.getByTestId(PUBLIC_SHELL_TEST_ID)).toHaveScreenshot(
    "accounting-public-signature-emerald-dark.png",
    {
      animations: "disabled",
      timeout: 15_000,
    },
  );
});
