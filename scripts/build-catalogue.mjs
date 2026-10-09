import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const bank = process.env.SUDOKU_BANK || "/private/tmp/strack-puzzle-bank";
const output = resolve("src/data/puzzles.json");
const commit = "d8c8ebaee0c08c412cfba96af1923dfa61c83317";
const catalogueVersion = "2026.10.09+bank.d8c8eba";
const bands = ["easy", "medium", "hard", "diabolical"];
const labels = { easy: "Easy", medium: "Medium", hard: "Hard", diabolical: "Diabolical" };

function candidates(board, cell) {
  const row = Math.floor(cell / 9);
  const column = cell % 9;
  const used = new Set();
  for (let i = 0; i < 9; i++) {
    used.add(board[row * 9 + i]);
    used.add(board[i * 9 + column]);
    const boxRow = Math.floor(row / 3) * 3 + Math.floor(i / 3);
    const boxColumn = Math.floor(column / 3) * 3 + (i % 3);
    used.add(board[boxRow * 9 + boxColumn]);
  }
  return ["1", "2", "3", "4", "5", "6", "7", "8", "9"].filter((digit) => !used.has(digit));
}

function solve(puzzle) {
  const board = puzzle.split("").map((value) => (value === "0" ? "" : value));
  const search = () => {
    let cell = -1;
    let choices = [];
    for (let i = 0; i < 81; i++) {
      if (board[i]) continue;
      const available = candidates(board, i);
      if (!available.length) return false;
      if (cell < 0 || available.length < choices.length) {
        cell = i;
        choices = available;
      }
    }
    if (cell < 0) return true;
    for (const digit of choices) {
      board[cell] = digit;
      if (search()) return true;
      board[cell] = "";
    }
    return false;
  };
  if (!search()) throw new Error(`Puzzle has no solution: ${puzzle}`);
  return board.join("");
}

const puzzles = [];
for (const band of bands) {
  const lines = (await readFile(resolve(bank, `${band}.txt`), "utf8")).trim().split("\n");
  const selected = lines
    .map((line) => line.trim().split(/\s+/))
    // This SE 3.2 board needs a technique beyond the v1 local hint set.
    .filter(([hash]) => hash !== "000a13ffe328")
    .filter(([, , rating]) => band !== "hard" || Number(rating) <= 3.2)
    .slice(0, 20);
  if (selected.length !== 20) throw new Error(`Expected 20 ${band} puzzles`);
  for (const [hash, givens, ratingText] of selected) {
    puzzles.push({
      id: `seb-${hash}`,
      givens,
      solution: solve(givens),
      source: "Sudoku Exchange Puzzle Bank",
      sourceUrl: `https://github.com/grantm/sudoku-exchange-puzzle-bank/blob/${commit}/${band}.txt`,
      provenance: `QQWing-generated puzzle from the Sudoku Exchange Puzzle Bank snapshot ${commit.slice(0, 8)}. The upstream bank states every puzzle has a unique solution.`,
      licence: "Public domain (Unlicense dedication)",
      seRating: Number(ratingText),
      ratingEngine: "SukakuExplainer",
      ratingVersion: `Upstream engine build not disclosed; bank snapshot ${commit.slice(0, 8)}`,
      difficulty: labels[band],
      catalogueVersion,
      fullHints: band !== "diabolical",
    });
  }
}
await mkdir(resolve("src/data"), { recursive: true });
await writeFile(output, JSON.stringify(puzzles, null, 2) + "\n");
console.log(`Wrote ${puzzles.length} puzzles to ${output}`);
