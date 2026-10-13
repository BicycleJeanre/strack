import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { applyColour, applyHint as applyGameHint, clearAllColours, clearColour, clearColours, clearLines, clearLinesByColour, createGame, digitIsComplete, enterDigit, fillAllCandidates, promoteSoleCentre, redo, selectCell, setMode, toggleLine, undo } from "../src/game.ts";
import { buildHintPath, findHint, nextHintFromPath } from "../src/hint-engine.ts";
import { applyHint as applyLogicalHint, candidateList, isHintApplicable, normalizePuzzle, solvePuzzle, validatePuzzle } from "../src/sudoku.ts";
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
  assert.equal(hint?.technique, "Full house");
  assert.match(hint?.id || "", /^hodoku-/);
  assert.deepEqual(hint?.targets, [{ cell: 0, digit: 5 }]);
});

test("an applied hint is no longer applicable and cannot be offered again", async () => {
  const puzzles = JSON.parse(await readFile(new URL("../src/data/puzzles.json", import.meta.url), "utf8")) as Puzzle[];
  const puzzle = puzzles.find((item) => item.id === "seb-0000847b216e");
  assert.ok(puzzle);
  const values = puzzle.givens.split("").map((value) => value === "0" ? "" : value);
  const eliminated = Array.from({ length: 81 }, () => [] as number[]);
  const path = buildHintPath(values, eliminated, { solution: puzzle.solution });
  let hint = nextHintFromPath(path, values, eliminated, { solution: puzzle.solution });
  while (hint?.kind !== "eliminate") {
    assert.ok(hint, "fixture must reach a candidate-elimination hint");
    applyLogicalHint(values, eliminated, hint);
    hint = nextHintFromPath(path, values, eliminated, { solution: puzzle.solution });
  }

  assert.equal(isHintApplicable(values, eliminated, hint), true);
  applyLogicalHint(values, eliminated, hint);
  assert.equal(isHintApplicable(values, eliminated, hint), false);
  assert.notEqual(nextHintFromPath(path, values, eliminated, { solution: puzzle.solution })?.id, hint.id);
});

test("the reported live candidate grid cannot produce invisible hint targets", () => {
  const livePosition = "745280030010056007609070008004092000907010004000740000500020803400860010070035090";
  const liveSolution = "745281936813956427629374158384692571967513284251748369596127843432869715178435692";
  const candidateRows = [
    ["", "", "", "", "", "19", "169", "", "169"],
    ["238", "", "238", "349", "", "", "249", "24", ""],
    ["", "23", "", "134", "", "14", "125", "245", ""],
    ["13", "3568", "", "56", "", "", "13567", "5678", "156"],
    ["", "23568", "", "56", "", "38", "2356", "2568", ""],
    ["123", "23568", "1236", "", "", "38", "123569", "2568", "12569"],
    ["", "69", "16", "149", "", "1479", "", "467", ""],
    ["", "239", "23", "", "", "79", "257", "", "25"],
    ["128", "", "1268", "14", "", "", "246", "", "26"],
  ];
  const values = [...livePosition].map((value) => value === "0" ? "" : value);
  const visibleCandidates = candidateRows.flat().map((digits) => [...digits].map(Number));

  const hint = findHint(values, [], { visibleCandidates, solution: liveSolution });
  assert.ok(hint, "the advanced engine continues with another supported logical step");
  if (hint.kind === "eliminate") {
    assert.ok(hint.targets.every(({ cell, digit }) => visibleCandidates[cell].includes(digit)), "every elimination is visible on the live board");
  }
  assert.notDeepEqual(hint.targets, [{ cell: 27, digit: 8 }, { cell: 45, digit: 8 }, { cell: 47, digit: 8 }], "the already-applied elimination is skipped");
});

test("applying a hint keeps solver eliminations and visible notes in sync", () => {
  const game = createGame(fixture, 1);
  game.corner[2] = [4, 7];
  game.centre[2] = [1, 4, 9];
  applyGameHint(game, {
    id: "test-elimination",
    technique: "Test",
    summary: "Test",
    explanation: "Test",
    kind: "eliminate",
    evidence: [],
    targets: [{ cell: 2, digit: 4 }],
  });
  assert.deepEqual(game.eliminated[2], [4]);
  assert.deepEqual(game.corner[2], [7]);
  assert.deepEqual(game.centre[2], [1, 9]);
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

test("full values reject notes while multi-cell note toggles affect only empty cells", () => {
  const game = createGame(fixture, 1);
  selectCell(game, 2);
  setMode(game, "corner");
  enterDigit(game, 4);
  setMode(game, "normal");
  enterDigit(game, 5);
  assert.equal(game.values[2], "5");
  assert.deepEqual(game.corner[2], []);

  setMode(game, "corner");
  const historyLength = game.history.length;
  enterDigit(game, 6);
  assert.deepEqual(game.corner[2], [], "a full value blocks note entry");
  assert.equal(game.history.length, historyLength, "blocked note entry does not create undo history");
  selectCell(game, 3, true);
  enterDigit(game, 4);
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.corner[3], [4], "a mixed selection adds the note only to empty cells");
  enterDigit(game, 4);
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.corner[3], [], "a repeated note removes it from every eligible cell");
});

test("simple multi-cell entry uses centre notes", () => {
  const game = createGame(fixture, 1);
  selectCell(game, 2);
  selectCell(game, 3, true);
  enterDigit(game, 4, true, "centre");
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.corner[3], []);
  assert.deepEqual(game.centre[2], [4]);
  assert.deepEqual(game.centre[3], [4]);
});

test("a digit is complete once all nine instances are placed", () => {
  const values = Array(81).fill("");
  values.splice(0, 8, ...Array(8).fill("5"));
  assert.equal(digitIsComplete(values, 5), false);
  values[8] = "5";
  assert.equal(digitIsComplete(values, 5), true);
  values[0] = "";
  assert.equal(digitIsComplete(values, 5), false);
});

test("all candidates replace corner notes with centre notes and are undone together", () => {
  const game = createGame(fixture, 1);
  game.corner[2] = [4];
  assert.equal(fillAllCandidates(game), true);
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.centre[2], candidateList(game.values, 2));
  assert.deepEqual(game.centre[3], candidateList(game.values, 3));
  assert.equal(game.history.length, 1);
  assert.equal(undo(game), true);
  assert.deepEqual(game.corner[2], [4]);
  assert.deepEqual(game.centre[2], []);
});

test("entering a value clears both corner and centre notes", () => {
  const game = createGame(fixture, 1);
  selectCell(game, 2);
  game.corner[2] = [4];
  game.centre[2] = [1, 2, 4];
  enterDigit(game, 5);
  assert.equal(game.values[2], "5");
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.centre[2], []);
});

test("a sole centre note can be promoted to a full digit", () => {
  const game = createGame(fixture, 1);
  game.corner[2] = [4, 7];
  game.centre[2] = [5];
  game.centre[3] = [5, 6];
  assert.equal(promoteSoleCentre(game, 2), true);
  assert.equal(game.values[2], "5");
  assert.deepEqual(game.corner[2], []);
  assert.deepEqual(game.centre[2], []);
  assert.deepEqual(game.centre[3], [6], "candidate cleanup applies to peers");
  assert.equal(undo(game), true);
  assert.equal(game.values[2], "");
  assert.deepEqual(game.centre[2], [5]);
  game.centre[2] = [4, 5];
  assert.equal(promoteSoleCentre(game, 2), false, "multiple centre notes are not promoted");
});

test("cells retain multiple colours and coloured lines participate in undo and redo", () => {
  const game = createGame(fixture, 1);
  selectCell(game, 2);
  applyColour(game, "cyan");
  applyColour(game, "amber");
  applyColour(game, "indigo");
  assert.deepEqual(game.colours[2], ["cyan", "amber", "indigo"]);
  applyColour(game, "cyan");
  assert.deepEqual(game.colours[2], ["amber", "indigo"], "a repeated colour removes only itself");
  selectCell(game, 3, true);
  applyColour(game, "rose");
  assert.deepEqual(game.colours[2], ["amber", "indigo", "rose"]);
  assert.deepEqual(game.colours[3], ["rose"]);
  assert.equal(clearColour(game, "amber"), true);
  assert.deepEqual(game.colours[2], ["indigo", "rose"]);
  assert.deepEqual(game.colours[3], ["rose"], "clearing one colour preserves every other colour");
  assert.equal(undo(game), true);
  assert.deepEqual(game.colours[2], ["amber", "indigo", "rose"]);
  assert.equal(clearColours(game), true);
  assert.deepEqual(game.colours[2], []);
  assert.deepEqual(game.colours[3], []);
  assert.equal(undo(game), true);
  assert.equal(clearAllColours(game), true);
  assert.equal(game.colours.some((colours) => colours.length > 0), false);

  assert.equal(toggleLine(game, 2, 12, "violet"), true);
  assert.equal(toggleLine(game, 3, 13, "cyan"), true);
  assert.equal(clearLinesByColour(game, "violet"), true);
  assert.deepEqual(game.lines, [{ from: 3, to: 13, colour: "cyan" }], "clearing one line colour preserves other lines");
  assert.equal(undo(game), true);
  assert.equal(clearLines(game), true);
  assert.deepEqual(game.lines, []);
  assert.equal(undo(game), true);
  assert.deepEqual(game.lines, [{ from: 2, to: 12, colour: "violet" }, { from: 3, to: 13, colour: "cyan" }]);
  assert.equal(toggleLine(game, 3, 13, "cyan"), true);
  assert.deepEqual(game.lines, [{ from: 2, to: 12, colour: "violet" }]);
  assert.equal(toggleLine(game, 12, 2, "orange"), true);
  assert.deepEqual(game.lines, [{ from: 2, to: 12, colour: "orange" }], "redrawing with another colour recolours the connection");
  assert.equal(undo(game), true);
  assert.deepEqual(game.lines, [{ from: 2, to: 12, colour: "violet" }]);
  assert.equal(redo(game), true);
  assert.deepEqual(game.lines, [{ from: 2, to: 12, colour: "orange" }]);
  assert.equal(toggleLine(game, 2, 12, "orange"), true);
  assert.deepEqual(game.lines, [], "redrawing the same coloured connection removes it");
});

test("catalogue has 20 valid, rated, provenance-complete puzzles in every band", async () => {
  const puzzles = JSON.parse(await readFile(new URL("../src/data/puzzles.json", import.meta.url), "utf8")) as Puzzle[];
  const hintTechniques = new Set<string>();
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
  }
  for (const puzzle of [puzzles.find((item) => item.difficulty === "Easy")!, puzzles.find((item) => item.difficulty === "Hard")!]) {
    const values = puzzle.givens.split("").map((value) => value === "0" ? "" : value);
    const eliminated = Array.from({ length: 81 }, () => [] as number[]);
    const path = buildHintPath(values, eliminated, { solution: puzzle.solution });
    assert.ok(path.complete, `${puzzle.id} must have a complete local hint path`);
    assert.ok(path.hints.length > 0);
    for (const hint of path.hints) {
      assert.match(hint.id, /^hodoku-/, `${puzzle.id} must use the HoDoKu engine`);
      hintTechniques.add(hint.technique);
      applyLogicalHint(values, eliminated, hint);
    }
    assert.equal(values.join(""), puzzle.solution, `${puzzle.id} hint path reaches its stored solution`);
  }
  assert.ok(hintTechniques.size >= 2, "the external engine supplies more than one logical technique");
});
