import { expect, test } from "@playwright/test";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

test.beforeEach(async ({ page }) => {
  await page.goto("./");
});

test("home, library and puzzle details expose the offline catalogue and SE provenance", async ({ page }) => {
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();
  await expect(page.getByText("See all 80")).toBeVisible();
  await page.getByRole("button", { name: "Puzzles" }).click();
  await expect(page.getByText("80 puzzles")).toBeVisible();
  await page.getByRole("button", { name: "Puzzle details" }).first().click();
  await expect(page.getByRole("dialog")).toContainText("SukakuExplainer");
  await expect(page.getByRole("dialog")).toContainText("Public domain");
  await expect(page.getByRole("dialog")).toContainText("not a universal or official difficulty scale");
});

test("the settings menu toggles back to the screen it opened from", async ({ page }) => {
  await page.getByRole("button", { name: "Settings and help" }).click();
  await expect(page.getByRole("heading", { name: "Settings & help" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings and help" }).click();
  await expect(page.getByRole("heading", { name: /Good/ })).toBeVisible();

  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.getByRole("button", { name: "Settings and help" }).click();
  await page.getByRole("button", { name: "Close settings and help" }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("normal, corner, centre, colour, multi-select, undo and keyboard flows work", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given)");
  await empty.nth(0).click();
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(empty.nth(0).locator(".corner-marks")).toContainText("1");
  await page.getByRole("button", { name: "Centre" }).click();
  await page.keyboard.press("2");
  await expect(empty.nth(0).locator(".centre-marks")).toContainText("2");
  await page.getByRole("button", { name: /Multi-select/ }).click();
  await empty.nth(1).click();
  await page.getByRole("button", { name: "Digit" }).click();
  await page.keyboard.press("3");
  await expect(empty.nth(0).locator(".corner-marks")).toContainText("3");
  await expect(empty.nth(1).locator(".corner-marks")).toContainText("3");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(empty.nth(1).locator(".corner-marks")).toHaveCount(0);
  await page.getByRole("button", { name: "Colour" }).click();
  await page.getByRole("button", { name: "Apply cyan colour" }).click();
  await expect(empty.nth(0)).toHaveClass(/colour-cyan/);
  await page.keyboard.press("Shift+ArrowRight");
  expect(await page.locator(".sudoku-cell.selected").count()).toBeGreaterThan(1);
});

test("all candidates replace corner notes with centre notes as one undoable action", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given):not(.has-value)");
  await expect(empty.first()).toBeVisible();
  const emptyCount = await empty.count();
  await empty.first().click();
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await expect(empty.first().locator(".corner-marks")).toContainText("1");
  await page.getByRole("button", { name: "Calculate all candidates" }).click();
  await expect(page.locator(".sudoku-cell:not(.given) .corner-marks")).toHaveCount(0);
  await expect(page.locator(".sudoku-cell:not(.given):not(.has-value) .centre-marks")).toHaveCount(emptyCount);
  await expect(page.getByText("Candidates calculated for every empty cell")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(empty.first().locator(".corner-marks")).toContainText("1");
  await expect(page.locator(".sudoku-cell:not(.given) .centre-marks")).toHaveCount(0);
});

test("peer shading appears only when the selected cell contains a value", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given)").first();
  await empty.click();
  await expect(page.locator(".sudoku-cell.peer")).toHaveCount(0);
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.locator('[data-digit="4"]').click();
  await expect(empty.locator(".corner-marks")).toContainText("4");
  await expect(page.locator(".sudoku-cell.peer")).toHaveCount(0);
  await page.getByRole("button", { name: "Digit", exact: true }).click();
  await page.locator('[data-digit="5"]').click();
  await expect(empty.locator(".cell-value")).toHaveText("5");
  expect(await page.locator(".sudoku-cell.peer").count()).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Clear" }).click();
  await expect(page.locator(".sudoku-cell.peer")).toHaveCount(0);
});

test("home separates completed puzzles and allows individual deletion", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await page.getByRole("button", { name: /Home/ }).click();
  await expect(page.getByRole("heading", { name: "Recent puzzles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Completed puzzles", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Delete recent Easy puzzle/ }).click();
  await page.getByRole("button", { name: "Delete puzzle", exact: true }).click();
  await expect(page.getByRole("heading", { name: "No puzzles in progress" })).toBeVisible();

  await page.getByRole("button", { name: /Medium/ }).click();
  await page.evaluate(async () => {
    const request = indexedDB.open("strack-v1");
    const db = await new Promise<IDBDatabase>((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const transaction = db.transaction("state", "readwrite");
    const store = transaction.objectStore("state");
    const data = await new Promise<any>((resolve, reject) => { const get = store.get("app"); get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error); });
    data.games[data.activeGameId].completedAt = Date.now();
    data.games[data.activeGameId].paused = true;
    data.games[data.activeGameId].updatedAt = Date.now();
    store.put(data, "app");
    await new Promise<void>((resolve, reject) => { transaction.oncomplete = () => resolve(); transaction.onerror = () => reject(transaction.error); });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /Review Medium puzzle/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No puzzles in progress" })).toBeVisible();
});

test("dragging across cells paints a multi-cell selection while clicks stay singular", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given)");
  const start = await empty.nth(0).boundingBox();
  const end = await empty.nth(8).boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();

  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 12 });
  await page.mouse.up();

  await expect(empty.nth(0)).toHaveClass(/selected/);
  await expect(empty.nth(8)).toHaveClass(/selected/);
  expect(await page.locator(".sudoku-cell.selected").count()).toBeGreaterThan(1);

  await empty.nth(2).click();
  await expect(empty.nth(2)).toHaveClass(/selected/);
  await expect(page.locator(".sudoku-cell.selected")).toHaveCount(1);
});

test("the last entered digit remains active and highlights matching grid values", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const digit = await page.locator(".sudoku-cell.given .cell-value").first().textContent();
  expect(digit).toMatch(/^[1-9]$/);
  const empty = page.locator(".sudoku-cell:not(.given)");

  await empty.nth(0).click();
  await page.getByRole("button", { name: digit!, exact: true }).click();
  await expect(page.locator(`[data-digit="${digit}"]`)).toHaveClass(/active-digit/);
  expect(await page.locator(".sudoku-cell.match").count()).toBeGreaterThan(1);

  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await empty.nth(1).click();
  await page.getByRole("button", { name: digit!, exact: true }).click();
  await expect(empty.nth(1).locator(".corner-marks")).toContainText(digit!);
  await expect(page.locator(`[data-digit="${digit}"]`)).toHaveClass(/active-digit/);
  expect(await page.locator(".sudoku-cell.match").count()).toBeGreaterThan(0);
});

test("selecting a placed value highlights matching corner and centre notes", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const digit = await page.locator(".sudoku-cell.given .cell-value").first().textContent();
  expect(digit).toMatch(/^[1-9]$/);
  const empty = page.locator(".sudoku-cell:not(.given)");

  await empty.nth(0).click();
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.locator(`[data-digit="${digit}"]`).click();
  await empty.nth(1).click();
  await page.getByRole("button", { name: "Centre", exact: true }).click();
  await page.locator(`[data-digit="${digit}"]`).click();

  const matchingValue = page.locator(".sudoku-cell.given").filter({ has: page.locator(`.cell-value:text-is("${digit}")`) }).first();
  await matchingValue.click();
  await expect(empty.nth(0).locator(".corner-marks .note-match")).toHaveText(digit!);
  await expect(empty.nth(1).locator(".centre-marks .note-match")).toHaveText(digit!);
  expect(await page.locator(".note-match").count()).toBeGreaterThanOrEqual(2);
});

test("selecting a placed value highlights matching automatic candidates", async ({ page }) => {
  await page.getByRole("button", { name: "Settings and help" }).click();
  await page.getByLabel("Automatic candidates").check();
  await page.getByRole("button", { name: "STrack home" }).click();
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const given = page.locator(".sudoku-cell.given").first();
  const digit = await given.locator(".cell-value").textContent();
  await given.click();
  const matches = page.locator(".centre-marks.auto .note-match");
  expect(await matches.count()).toBeGreaterThan(0);
  await expect(matches.first()).toHaveText(digit!);
});

test("corner notes remain separate from cell values and multi-cell toggles converge", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given)");
  await empty.nth(0).click();
  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await page.getByRole("button", { name: "Centre", exact: true }).click();
  await page.getByRole("button", { name: "6", exact: true }).click();
  const cell = page.locator(".sudoku-cell.selected").first();
  const corner = cell.locator(".corner-marks");
  const centre = cell.locator(".centre-marks");
  await expect(corner.locator("i")).toHaveText("4");
  await expect(centre.locator("i")).toHaveText("6");
  const cornerLayout = await corner.evaluate((element) => ({ position: getComputedStyle(element).position, justify: getComputedStyle(element).justifyContent, wrap: getComputedStyle(element).flexWrap }));
  const centreLayout = await centre.evaluate((element) => ({ position: getComputedStyle(element).position, justify: getComputedStyle(element).justifyContent, transform: getComputedStyle(element).transform, wrap: getComputedStyle(element).flexWrap }));
  const cornerColour = await corner.locator("i").evaluate((element) => getComputedStyle(element).color);
  const centreColour = await centre.locator("i").evaluate((element) => getComputedStyle(element).color);
  expect(cornerLayout).toEqual({ position: "absolute", justify: "flex-start", wrap: "wrap" });
  expect(centreLayout.position).toBe("absolute");
  expect(centreLayout.justify).toBe("center");
  expect(centreLayout.transform).not.toBe("none");
  expect(centreLayout.wrap).toBe("wrap");
  expect(cornerColour).not.toBe(centreColour);
  await page.getByRole("button", { name: "Digit" }).click();
  await page.getByRole("button", { name: "5", exact: true }).click();
  await expect(empty.nth(0).locator(".cell-value")).toHaveText("5");
  await expect(empty.nth(0).locator(".corner-marks")).toContainText("4");
  await expect(empty.nth(0).locator(".centre-marks")).toHaveCount(0);
  await expect(empty.nth(0)).toHaveClass(/has-value/);
  await expect(empty.nth(0)).toHaveClass(/has-corner/);
  expect(await cell.locator(".cell-value").evaluate((element) => getComputedStyle(element).position)).toBe("relative");

  await page.getByRole("button", { name: "Corner", exact: true }).click();
  await page.getByRole("button", { name: /Multi-select/ }).click();
  await empty.nth(1).click();
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(empty.nth(0).locator(".corner-marks")).toContainText("4");
  await expect(empty.nth(1).locator(".corner-marks")).toContainText("4");
  await page.getByRole("button", { name: "4", exact: true }).click();
  await expect(empty.nth(0).locator(".corner-marks")).toHaveCount(0);
  await expect(empty.nth(1).locator(".corner-marks")).toHaveCount(0);
});

test("clicking outside the grid deselects cells and enables multi-digit highlighting", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await expect(page.locator(".sudoku-cell.selected")).toHaveCount(1);
  await page.locator(".board-status").click();
  await expect(page.locator(".sudoku-cell.selected")).toHaveCount(0);
  await expect(page.getByText("No cells selected · tap any digits to highlight them together.")).toBeVisible();

  const values = await page.locator(".sudoku-cell.given .cell-value").allTextContents();
  const digits = [...new Set(values)].slice(0, 2);
  expect(digits).toHaveLength(2);
  for (const digit of digits) await page.locator(`[data-digit="${digit}"]`).click();
  for (const digit of digits) await expect(page.locator(`[data-digit="${digit}"]`)).toHaveClass(/active-digit/);
  expect(await page.locator(".sudoku-cell.match").count()).toBeGreaterThanOrEqual(2);
});

test("number-pad digits grey out after all nine are placed and recover on undo", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  const digit = "5";
  const placed = await page.locator(".sudoku-cell .cell-value").allTextContents();
  const needed = 9 - placed.filter((value) => value === digit).length;
  const editable = page.locator(".sudoku-cell:not(.given)");
  for (let index = 0; index < needed; index++) {
    await editable.nth(index).click();
    await expect(editable.nth(index)).toHaveClass(/selected/);
    await page.locator(`[data-digit="${digit}"]`).click();
    await expect(editable.nth(index).locator(".cell-value")).toHaveText(digit);
  }
  const button = page.locator(`[data-digit="${digit}"]`);
  await expect(button).toHaveClass(/complete-digit/);
  await expect(button).toHaveAttribute("aria-label", "5, all placed");
  expect(Number(await button.evaluate((element) => getComputedStyle(element).opacity))).toBeLessThan(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(button).not.toHaveClass(/complete-digit/);
  await expect(button).toHaveAttribute("aria-label", "5");
});

test("hints can show answers, be dismissed, and remain available in history", async ({ page }) => {
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await page.getByRole("button", { name: "Get a logical hint" }).click();
  await expect(page.getByRole("button", { name: "Show answer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Dismiss hint" })).toBeVisible();

  await page.getByRole("button", { name: "Show answer" }).click();
  await expect(page.locator(".hint-answer")).toContainText(/(Place|Remove) [1-9]/);
  await page.getByRole("button", { name: "Dismiss hint" }).click();
  await expect(page.locator(".hint-panel")).toHaveCount(0);

  await page.getByRole("button", { name: "Previous hints (1)" }).click();
  const history = page.getByRole("dialog");
  await expect(history).toContainText("Previous hints");
  await expect(history).toContainText("Dismissed");
  await history.getByText("Show answer").click();
  await expect(history.locator(".hint-answer")).toContainText(/(Place|Remove) [1-9]/);
  await history.getByRole("button", { name: "Close history" }).click();
});

test("settings persist theme and help explains notation, ratings, offline use and backups", async ({ page }) => {
  await page.getByRole("button", { name: "Settings and help" }).click();
  await page.getByLabel("Theme").selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Open user guide" }).click();
  const guide = page.getByRole("dialog");
  await expect(guide).toContainText("Warm corner notes stay in the top-left");
  await expect(guide).toContainText("Cool centre notes stay centred");
  await expect(guide).toContainText("not an official universal scale");
  await expect(guide).toContainText("IndexedDB");
  await guide.getByRole("button", { name: "Got it" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("Sudoku grid surfaces follow explicit light and dark themes", async ({ page }) => {
  const boardColours = async () => {
    const board = page.getByRole("grid", { name: "Sudoku board" });
    await expect(board).toBeVisible();
    return page.evaluate(() => {
      const given = document.querySelector<HTMLElement>(".sudoku-cell.given:not(.peer):not(.match)")!;
      const empty = document.querySelector<HTMLElement>(".sudoku-cell:not(.given):not(.selected):not(.peer):not(.match)")!;
      const peer = document.querySelector<HTMLElement>(".sudoku-cell.peer")!;
      return {
        board: getComputedStyle(document.querySelector<HTMLElement>(".sudoku-board")!).backgroundColor,
        given: getComputedStyle(given).backgroundColor,
        empty: getComputedStyle(empty).backgroundColor,
        peer: getComputedStyle(peer).backgroundColor,
        givenText: getComputedStyle(given).color,
      };
    });
  };

  await page.goto("/");
  await page.getByRole("button", { name: "Settings and help" }).click();
  await page.getByLabel("Theme").selectOption("dark");
  await page.getByRole("button", { name: "STrack home" }).click();
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  await page.locator(".sudoku-cell.given").first().click();
  await expect(page.locator(".sudoku-cell.peer").first()).toBeVisible();
  const dark = await boardColours();

  await page.getByRole("button", { name: "Settings and help" }).click();
  await page.getByLabel("Theme").selectOption("light");
  await page.getByRole("button", { name: "STrack home" }).click();
  await page.getByRole("button", { name: /Resume puzzle/ }).click();
  const light = await boardColours();

  expect(dark).not.toEqual(light);
  expect(dark.empty).toBe("rgb(19, 27, 31)");
  expect(light.empty).toBe("rgb(237, 243, 244)");
  expect(dark.given).toBe(dark.empty);
  expect(light.given).toBe(light.empty);
  expect(dark.peer).not.toBe(dark.empty);
  expect(light.peer).not.toBe(light.empty);
  expect(dark.given).not.toBe(light.given);
  expect(dark.givenText).not.toBe(light.givenText);
});

test("import validates uniqueness and creates a client-side share link", async ({ page }) => {
  await page.getByRole("button", { name: "Open" }).click();
  await page.getByLabel("81-character puzzle").fill("530070000600195000098000060800060003400803001700020006060000280000419005000080079");
  await page.getByRole("button", { name: "Validate puzzle" }).click();
  await expect(page.getByText("Unique solution found on this device.")).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: (value: string) => { sessionStorage.setItem("copied-link", value); return Promise.resolve(); } } });
  });
  await page.getByRole("button", { name: "Copy share link" }).dispatchEvent("click");
  const clipboard = await page.evaluate(() => sessionStorage.getItem("copied-link") || "");
  expect(new URL(clipboard).searchParams.get("p")).toBe("530070000600195000098000060800060003400803001700020006060000280000419005000080079");
});

test("narrow phone and landscape controls do not overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await page.screenshot({ path: "test-results/player-phone.png", fullPage: true });
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByRole("button", { name: "Get a logical hint" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/player-landscape.png", fullPage: true });
});

test("accessibility contract covers names, focus, contrast, reduced motion and keyboard-only import", async ({ page }) => {
  const unnamed = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => !(button.textContent || "").trim() && !button.getAttribute("aria-label")).length);
  expect(unnamed).toBe(0);
  const start = page.getByRole("button", { name: /Start an Easy puzzle/ });
  await start.focus();
  expect(await start.evaluate((element) => getComputedStyle(element).outlineStyle)).not.toBe("none");
  const contrast = await page.evaluate(() => {
    const rgb = (value: string) => (value.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const luminance = (colour: number[]) => colour.map((part) => part / 255).map((part) => part <= .03928 ? part / 12.92 : ((part + .055) / 1.055) ** 2.4).reduce((sum, part, index) => sum + part * [.2126, .7152, .0722][index], 0);
    const style = getComputedStyle(document.body);
    const values = [luminance(rgb(style.color)), luminance(rgb(style.backgroundColor))].sort((a, b) => b - a);
    return (values[0] + .05) / (values[1] + .05);
  });
  expect(contrast).toBeGreaterThanOrEqual(4.5);
  await page.emulateMedia({ reducedMotion: "reduce" });
  expect(parseFloat(await page.locator(".band-card").first().evaluate((element) => getComputedStyle(element).transitionDuration))).toBeLessThan(.02);
  const open = page.getByRole("button", { name: "Open" });
  await open.focus(); await page.keyboard.press("Enter");
  const input = page.getByLabel("81-character puzzle");
  await input.fill("530070000600195000098000060800060003400803001700020006060000280000419005000080079");
  const validate = page.getByRole("button", { name: "Validate puzzle" });
  await validate.focus(); await page.keyboard.press("Enter");
  const play = page.getByRole("button", { name: "Play now" });
  await expect(play).toBeVisible();
  await play.focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
});

test("production app relaunches offline with catalogue and current progress", async ({ browser }) => {
  const types: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url!, "http://local").pathname.replace(/^\/strack\/?/, "/");
      const file = resolve("dist", `.${pathname === "/" ? "/index.html" : pathname}`);
      if (!file.startsWith(resolve("dist") + "/")) throw new Error("invalid path");
      response.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
      response.end(await readFile(file));
    } catch { response.statusCode = 404; response.end(); }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(`http://127.0.0.1:${port}/strack/`);
  await page.getByRole("button", { name: /Start an Easy puzzle/ }).click();
  const empty = page.locator(".sudoku-cell:not(.given)").first();
  await empty.click();
  await page.keyboard.press("1");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  server.closeAllConnections();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: /Resume puzzle/ })).toBeVisible();
  await page.getByRole("button", { name: /Resume puzzle/ }).click();
  await expect(page.getByRole("grid", { name: "Sudoku board" })).toBeVisible();
  await expect(page.locator(".sudoku-cell:not(.given)").first().locator(".cell-value")).toHaveText("1");
  await page.getByRole("button", { name: "STrack home" }).click();
  await page.getByRole("button", { name: "Puzzles" }).click();
  await expect(page.getByText("80 puzzles")).toBeVisible();
  await context.close();
});
