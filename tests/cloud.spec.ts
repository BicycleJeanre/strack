import { expect, test } from "@playwright/test";

test("a signed-in puzzle session continues on a second device", async ({ browser }) => {
  const email = `solver-${Date.now()}@example.test`;
  const password = "test-password-42";
  const firstContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const first = await firstContext.newPage();
  await first.goto("/");
  await first.getByRole("button", { name: "Settings and help" }).click();
  await first.getByLabel("Email").fill(email);
  await first.getByLabel("Password").fill(password);
  await first.getByRole("button", { name: "Create account" }).click();
  await expect(first.getByRole("heading", { name: "Progress sync is on" })).toBeVisible();
  await first.getByRole("button", { name: "STrack home" }).click();
  await first.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const firstEmpty = first.locator(".sudoku-cell:not(.given)").first();
  await firstEmpty.click();
  await first.keyboard.press("1");
  await first.getByRole("button", { name: "Settings and help" }).click();
  await expect(first.locator("[data-cloud-status]").filter({ hasText: "Synced" }).first()).toBeVisible();

  const secondContext = await browser.newContext({ viewport: { width: 900, height: 800 } });
  const second = await secondContext.newPage();
  await second.goto("/");
  await second.getByRole("button", { name: "Settings and help" }).click();
  await second.getByLabel("Email").fill(email);
  await second.getByLabel("Password").fill(password);
  await second.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(second.getByRole("heading", { name: "Progress sync is on" })).toBeVisible();
  await second.getByRole("button", { name: "STrack home" }).click();
  await expect(second.getByRole("button", { name: /Resume puzzle/ })).toBeVisible();
  await second.getByRole("button", { name: /Resume puzzle/ }).click();
  await expect(second.locator(".sudoku-cell:not(.given)").first().locator(".cell-value")).toHaveText("1");
  await firstContext.close();
  await secondContext.close();
});
