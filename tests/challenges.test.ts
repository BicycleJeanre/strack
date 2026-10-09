import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { challengePeriodKey, challengeSet } from "../src/challenges.ts";
import type { Puzzle } from "../src/types.ts";

const catalogue = JSON.parse(await readFile(new URL("../src/data/puzzles.json", import.meta.url), "utf8")) as Puzzle[];

test("challenge periods use UTC dates and ISO week boundaries", () => {
  assert.equal(challengePeriodKey("daily", new Date("2026-10-09T23:59:59Z")), "2026-10-09");
  assert.equal(challengePeriodKey("weekly", new Date("2026-01-01T12:00:00Z")), "2026-W01");
  assert.equal(challengePeriodKey("weekly", new Date("2021-01-01T12:00:00Z")), "2020-W53");
});

test("daily and weekly challenge sets are stable and cover every difficulty", () => {
  const now = new Date("2026-10-09T12:00:00Z");
  const daily = challengeSet(catalogue, "daily", now);
  const repeated = challengeSet(catalogue, "daily", new Date("2026-10-09T22:00:00Z"));
  const weekly = challengeSet(catalogue, "weekly", now);

  assert.deepEqual(daily.map((puzzle) => puzzle.id), repeated.map((puzzle) => puzzle.id));
  assert.deepEqual(daily.map((puzzle) => puzzle.difficulty), ["Easy", "Medium", "Hard", "Diabolical"]);
  assert.deepEqual(weekly.map((puzzle) => puzzle.difficulty), ["Easy", "Medium", "Hard", "Diabolical"]);
  assert.equal(new Set(daily.map((puzzle) => puzzle.id)).size, 4);
  daily.forEach((puzzle, index) => assert.notEqual(puzzle.id, weekly[index].id));
});
