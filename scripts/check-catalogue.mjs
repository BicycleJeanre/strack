import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const puzzles = JSON.parse(await readFile(resolve("src/data/puzzles.json"), "utf8"));
const required = ["id", "givens", "solution", "source", "sourceUrl", "provenance", "licence", "seRating", "ratingEngine", "ratingVersion", "difficulty", "catalogueVersion"];
const ids = new Set();
const counts = {};
for (const puzzle of puzzles) {
  for (const field of required) if (puzzle[field] === undefined || puzzle[field] === "") throw new Error(`${puzzle.id || "Unknown puzzle"} is missing ${field}`);
  if (!/^[0-9]{81}$/.test(puzzle.givens) || !/^[1-9]{81}$/.test(puzzle.solution)) throw new Error(`${puzzle.id} has malformed digits`);
  if (ids.has(puzzle.id)) throw new Error(`Duplicate puzzle ID ${puzzle.id}`);
  ids.add(puzzle.id);
  counts[puzzle.difficulty] = (counts[puzzle.difficulty] || 0) + 1;
  for (let i = 0; i < 81; i++) if (puzzle.givens[i] !== "0" && puzzle.givens[i] !== puzzle.solution[i]) throw new Error(`${puzzle.id} stored solution conflicts with givens`);
}
for (const band of ["Easy", "Medium", "Hard", "Diabolical"]) if (counts[band] < 20) throw new Error(`Expected at least 20 ${band} puzzles`);
console.log(`Catalogue OK: ${puzzles.length} puzzles (${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(", ")})`);
