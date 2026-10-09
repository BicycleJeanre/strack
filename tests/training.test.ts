import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { deductionMatches, findTrainingPosition, patternCells, patternMatches, TRAINING_TECHNIQUES, validateTrainingPosition } from "../src/training.ts";
import type { Puzzle } from "../src/types.ts";

const catalogue = JSON.parse(readFileSync(new URL("../src/data/puzzles.json", import.meta.url), "utf8")) as Puzzle[];

test("every available lesson has a valid puzzle position or candidate diagram", () => {
  for (const technique of TRAINING_TECHNIQUES) {
    const position = findTrainingPosition(technique.id, catalogue);
    assert.ok(position, `${technique.title} needs a practice position`);
    assert.equal(position.hint.technique, technique.title);
    assert.equal(validateTrainingPosition(position), true, `${technique.title} must have complete evidence and targets`);
    assert.equal(patternMatches(patternCells(position), position), true);
    assert.equal(deductionMatches(position.hint.targets[0].cell, position.hint.targets[0].digit, position), true);
    const wrongDigit = Array.from({ length: 9 }, (_, index) => index + 1).find((digit) => !position.hint.targets.some((target) => target.cell === position.hint.targets[0].cell && target.digit === digit))!;
    assert.equal(deductionMatches(position.hint.targets[0].cell, wrongDigit, position), false);
  }
});
