import { expect, test, type Locator } from "@playwright/test";

async function colours(button: Locator) {
  return button.evaluate((element) => {
    const style = getComputedStyle(element);
    return { background: style.backgroundColor, text: style.color };
  });
}

async function expectReadableSubmit(button: Locator, label: string) {
  await expect(button).toBeVisible();
  await expect(button).toHaveText(label);
  const result = await colours(button);
  expect(["rgb(15, 23, 42)", "rgb(51, 65, 85)"]).toContain(result.background);
  expect(result.text).toBe("rgb(255, 255, 255)");
  console.log("AUTH_SUBMIT_COLOURS", JSON.stringify({ label, ...result }));
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 720 },
]) {
  test(`@smoke Admin auth actions survive unusable theme colour at width ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // Only a fresh local test context; external Auth/account calls are blocked.
    await page.route("**/*", (route) => {
      const host = new URL(route.request().url()).hostname;
      return host === "127.0.0.1" || host === "localhost"
        ? route.continue()
        : route.abort();
    });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "ORBIS Foundation Admin" })).toBeVisible();
    const submit = page.locator('form button[type="submit"]');
    await expectReadableSubmit(submit, "Sign in");

    await page.evaluate(() => {
      document.documentElement.style.setProperty("--color-slate-900", "not-a-colour", "important");
    });
    await expectReadableSubmit(submit, "Sign in");

    // Reproduce the old transparent-background/white-text failure on this
    // isolated test DOM, then restore the actual fixed class before testing it.
    const originalClasses = await submit.getAttribute("class");
    await submit.evaluate((button) => {
      button.classList.remove("orbis-admin-auth-submit");
      button.classList.add("bg-slate-900", "text-white");
    });
    try {
      const oldColours = await colours(submit);
      expect(oldColours.background).toBe("rgba(0, 0, 0, 0)");
      expect(oldColours.text).toBe("rgb(255, 255, 255)");
      console.log("REPRODUCED_OLD_AUTH_COLOUR_FAILURE", JSON.stringify(oldColours));
    } finally {
      await submit.evaluate((button, classes) => {
        button.setAttribute("class", classes || "");
      }, originalClasses);
    }
    await expectReadableSubmit(submit, "Sign in");

    await page.getByRole("button", { name: "Create Admin Account", exact: true }).click();
    await expect(page.getByLabel("New password", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Confirm new password", { exact: true })).toBeVisible();
    await expectReadableSubmit(submit, "Create Admin Account");
    await page.getByRole("button", { name: "Back to Sign in", exact: true }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expectReadableSubmit(submit, "Sign in");
  });
}
