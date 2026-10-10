import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { challengePeriodKey, challengeSet, challengeStats } from "../src/challenges.ts";
import { createGame } from "../src/game.ts";
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

test("challenge statistics track current completion, streaks and average time", () => {
  const now = new Date("2026-10-10T12:00:00Z");
  const finished = (cadence: "daily" | "weekly", periodKey: string, elapsed: number, puzzleIndex: number) => {
    const game = createGame(catalogue[puzzleIndex], Date.parse("2026-10-01T00:00:00Z") + puzzleIndex);
    game.challenge = { cadence, periodKey };
    game.completedAt = game.startedAt + elapsed * 1000;
    game.elapsed = elapsed;
    return game;
  };
  const games = [
    finished("daily", "2026-10-10", 600, 0),
    finished("daily", "2026-10-09", 1_200, 20),
    finished("daily", "2026-10-07", 1_800, 40),
    finished("weekly", "2026-W41", 2_400, 60),
    finished("weekly", "2026-W40", 3_000, 61),
  ];

  assert.deepEqual(challengeStats(games, "daily", now), { completed: 3, currentPeriodCompleted: 1, streak: 2, averageSeconds: 1_200 });
  assert.deepEqual(challengeStats(games, "weekly", now), { completed: 2, currentPeriodCompleted: 1, streak: 2, averageSeconds: 2_700 });
  assert.deepEqual(challengeStats([], "daily", now), { completed: 0, currentPeriodCompleted: 0, streak: 0, averageSeconds: null });
});
