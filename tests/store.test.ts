import "fake-indexeddb/auto";
import assert from "node:assert/strict";
import test from "node:test";
import { createGame } from "../src/game.ts";
import type { Puzzle } from "../src/types.ts";

const puzzle: Puzzle = { id: "store-test", givens: "0".repeat(81), solution: "123456789".repeat(9), source: "Imported", sourceUrl: "", provenance: "test", licence: "test", seRating: null, ratingEngine: "Not rated", ratingVersion: "Not rated", difficulty: "Unrated", catalogueVersion: "test", fullHints: false };

test("IndexedDB persists active progress and backup import preserves existing IDs", async () => {
  const { Store } = await import("../src/store.ts");
  const first = new Store();
  await first.load();
  const game = createGame(puzzle, 100);
  game.values[0] = "1";
  await first.putGame(game);
  const second = new Store();
  await second.load();
  assert.equal(second.activeGame()?.values[0], "1");
  const result = await second.importJson(first.exportJson());
  assert.deepEqual(result, { added: 0, skipped: 1 });
  await second.clear("all");
  assert.equal(second.activeGame(), null);
});

test("cloud merge keeps the newest puzzle and settings versions", async () => {
  const { Store } = await import("../src/store.ts");
  const store = new Store();
  await store.clear("all");
  const local = createGame(puzzle, 200);
  local.updatedAt = 300;
  local.values[0] = "1";
  await store.putGame(local);
  const older = structuredClone(local); older.updatedAt = 250; older.values[0] = "2";
  assert.equal(await store.mergeCloudGame(older), false);
  assert.equal(store.data.games[local.id].values[0], "1");
  const newer = structuredClone(local); newer.updatedAt = 350; newer.values[0] = "3";
  assert.equal(await store.mergeCloudGame(newer), true);
  assert.equal(store.data.games[local.id].values[0], "3");
  const remotePreferences = { ...store.data.preferences, theme: "dark" as const };
  assert.equal(await store.mergeCloudSettings({ preferences: remotePreferences, activeGameId: local.id, updatedAt: store.data.settingsUpdatedAt + 10 }), true);
  assert.equal(store.data.preferences.theme, "dark");
});
