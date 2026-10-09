import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createGame, enterDigit, redo, selectCell, setMode, undo } from "../src/game.ts";
import { applyHint as applyLogicalHint, candidateList, findHint, normalizePuzzle, solvePuzzle, validatePuzzle } from "../src/sudoku.ts";
import type { Puzzle } from "../src/types.ts";

const classic = "530070000600195000098000060800060003400803001700020006060000280000419005000080079";
const solution = "534678912672195348198342567859761423426853791713924856961537284287419635345286179";
const fixture: Puzzle = { id: "test", givens: classic, solution, source: "Imported", sourceUrl: "", provenance: "test", licence: "test", seRating: null, ratingEngine: "Not rated", ratingVersion: "Not rated", difficulty: "Unrated", catalogueVersion: "test", fullHints: false };

test("normalizes common strings and rejects malformed puzzles", () => {
  assert.equal(normalizePuzzle(classic.replaceAll("0", ".")), classic);
  assert.equal(normalizePuzzle("12"), null);
  assert.equal(normalizePuzzle("x".repeat(81)), null);
});

test("validates uniqueness and solves without trusting stored answers", () => {
  assert.deepEqual(solvePuzzle(classic, 2), [solution]);
  assert.equal(validatePuzzle(classic).valid, true);
  assert.match(validatePuzzle("0".repeat(81)).message, /more than one solution/i);
  assert.equal(validatePuzzle("11" + "0".repeat(79)).valid, false);
});

test("candidate calculation and logical hint identify a forced value", () => {
  const values = solution.split("");
  values[0] = "";
  assert.deepEqual(candidateList(values, 0), [5]);
  const hint = findHint(values);
  assert.equal(hint?.technique, "Naked single");
  assert.deepEqual(hint?.targets, [{ cell: 0, digit: 5 }]);
});

test("separate notation modes, multi-cell entry, candidate cleanup, undo and redo are stable", () => {
  const game = createGame(fixture, 1);
  selectCell(game, 2);
  setMode(game, "corner");
  enterDigit(game, 4);
  assert.deepEqual(game.corner[2], [4]);
  setMode(game, "centre");
  enterDigit(game, 1);
  assert.deepEqual(game.centre[2], [1]);
  selectCell(game, 3, true);
  setMode(game, "normal");
  enterDigit(game, 5);
  assert.deepEqual(game.corner[2], [4, 5]);
  assert.deepEqual(game.corner[3], [5]);
  assert.equal(undo(game), true);
  assert.deepEqual(game.corner[2], [4]);
  assert.equal(redo(game), true);
  assert.deepEqual(game.corner[2], [4, 5]);
});

test("catalogue has 20 valid, rated, provenance-complete puzzles in every band", async () => {
  const puzzles = JSON.parse(await readFile(new URL("../src/data/puzzles.json", import.meta.url), "utf8")) as Puzzle[];
  assert.equal(puzzles.length, 80);
  assert.equal(new Set(puzzles.map((puzzle) => puzzle.id)).size, 80);
  for (const band of ["Easy", "Medium", "Hard", "Diabolical"]) assert.equal(puzzles.filter((puzzle) => puzzle.difficulty === band).length, 20);
  for (const puzzle of puzzles) {
    assert.equal(puzzle.solution.length, 81);
    assert.equal(typeof puzzle.seRating, "number");
    assert.equal(puzzle.ratingEngine, "SukakuExplainer");
    assert.match(puzzle.ratingVersion, /bank snapshot d8c8eba/);
    assert.match(puzzle.licence, /Public domain/);
    assert.ok(puzzle.sourceUrl.includes("d8c8ebaee0c08c412cfba96af1923dfa61c83317"));
    for (let index = 0; index < 81; index++) if (puzzle.givens[index] !== "0") assert.equal(puzzle.givens[index], puzzle.solution[index]);
    if (puzzle.fullHints) {
      const values = puzzle.givens.split("").map((value) => value === "0" ? "" : value);
      const eliminated = Array.from({ length: 81 }, () => [] as number[]);
      let steps = 0;
      while (values.join("") !== puzzle.solution && steps++ < 500) {
        const hint = findHint(values, eliminated);
        assert.ok(hint, `${puzzle.id} must have a complete local hint path`);
        applyLogicalHint(values, eliminated, hint);
      }
      assert.equal(values.join(""), puzzle.solution, `${puzzle.id} hint path reaches its stored solution`);
    }
  }
});
