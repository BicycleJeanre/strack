import type { Hint } from "./types.ts";

export const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
export const rows = Array.from({ length: 9 }, (_, r) =>
  Array.from({ length: 9 }, (_, c) => r * 9 + c),
);
export const columns = Array.from({ length: 9 }, (_, c) =>
  Array.from({ length: 9 }, (_, r) => r * 9 + c),
);
export const boxes = Array.from({ length: 9 }, (_, b) => {
  const startRow = Math.floor(b / 3) * 3;
  const startColumn = (b % 3) * 3;
  return Array.from({ length: 9 }, (_, i) =>
    (startRow + Math.floor(i / 3)) * 9 + startColumn + (i % 3),
  );
});
export const units = [...rows, ...columns, ...boxes];
export const peers = Array.from({ length: 81 }, (_, cell) => {
  const related = new Set<number>();
  for (const unit of units) if (unit.includes(cell)) unit.forEach((i) => related.add(i));
  related.delete(cell);
  return [...related];
});

export function normalizePuzzle(input: string): string | null {
  const compact = input.trim().replace(/[\s|,;_-]/g, "").replace(/\./g, "0");
  return /^[0-9]{81}$/.test(compact) ? compact : null;
}

export function hasConflicts(values: readonly string[]): boolean {
  return units.some((unit) => {
    const seen = new Set<string>();
    for (const cell of unit) {
      const value = values[cell];
      if (value && (seen.has(value) || !/^[1-9]$/.test(value))) return true;
      if (value) seen.add(value);
    }
    return false;
  });
}

export function candidateList(
  values: readonly string[],
  cell: number,
  eliminated: readonly number[][] = [],
): number[] {
  if (values[cell]) return [];
  const used = new Set(peers[cell].map((i) => Number(values[i])).filter(Boolean));
  const removed = new Set(eliminated[cell] || []);
  return DIGITS.filter((digit) => !used.has(digit) && !removed.has(digit));
}

export function solvePuzzle(input: string, maxSolutions = 2): string[] {
  const normalized = normalizePuzzle(input);
  if (!normalized) return [];
  const values = normalized.split("").map((v) => (v === "0" ? "" : v));
  if (hasConflicts(values)) return [];
  const solutions: string[] = [];
  const search = () => {
    if (solutions.length >= maxSolutions) return;
    let next = -1;
    let options: number[] = [];
    for (let cell = 0; cell < 81; cell++) {
      if (values[cell]) continue;
      const candidates = candidateList(values, cell);
      if (!candidates.length) return;
      if (next < 0 || candidates.length < options.length) {
        next = cell;
        options = candidates;
        if (options.length === 1) break;
      }
    }
    if (next < 0) {
      solutions.push(values.join(""));
      return;
    }
    for (const digit of options) {
      values[next] = String(digit);
      search();
      values[next] = "";
      if (solutions.length >= maxSolutions) return;
    }
  };
  search();
  return solutions;
}

export function validatePuzzle(input: string): {
  valid: boolean;
  normalized?: string;
  solution?: string;
  message: string;
} {
  const normalized = normalizePuzzle(input);
  if (!normalized)
    return { valid: false, message: "Enter exactly 81 cells using 1–9, 0, or . for blanks." };
  const solutions = solvePuzzle(normalized, 2);
  if (!solutions.length) return { valid: false, message: "This grid has no solution. Check the givens." };
  if (solutions.length > 1)
    return { valid: false, message: "This grid has more than one solution. Add more givens." };
  return { valid: true, normalized, solution: solutions[0], message: "Unique solution found on this device." };
}

function unitName(unit: number[]): string {
  const index = units.indexOf(unit);
  if (index < 9) return `row ${index + 1}`;
  if (index < 18) return `column ${index - 8}`;
  return `box ${index - 17}`;
}

function combinations<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  const visit = (start: number, picked: T[]) => {
    if (picked.length === size) return void result.push([...picked]);
    for (let i = start; i <= items.length - (size - picked.length); i++) {
      picked.push(items[i]);
      visit(i + 1, picked);
      picked.pop();
    }
  };
  visit(0, []);
  return result;
}

export function findHint(values: readonly string[], eliminated: readonly number[][] = []): Hint | null {
  const candidates = Array.from({ length: 81 }, (_, cell) => candidateList(values, cell, eliminated));
  for (let cell = 0; cell < 81; cell++) {
    if (!values[cell] && candidates[cell].length === 1) {
      const digit = candidates[cell][0];
      return {
        id: `naked-single-${cell}-${digit}`,
        technique: "Naked single",
        summary: `Only ${digit} can fit in row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}.`,
        explanation: "Every other digit is already used by a peer in the same row, column, or box.",
        kind: "place",
        evidence: peers[cell].filter((i) => values[i]),
        targets: [{ cell, digit }],
      };
    }
  }
  for (const unit of units) {
    for (const digit of DIGITS) {
      const spots = unit.filter((cell) => !values[cell] && candidates[cell].includes(digit));
      if (spots.length === 1) {
        return {
          id: `hidden-single-${spots[0]}-${digit}`,
          technique: "Hidden single",
          summary: `${digit} has only one possible home in ${unitName(unit)}.`,
          explanation: "Other empty cells in this unit are blocked by an existing digit in one of their peers.",
          kind: "place",
          evidence: unit.filter((cell) => cell !== spots[0]),
          targets: [{ cell: spots[0], digit }],
        };
      }
    }
  }
  for (let boxIndex = 0; boxIndex < boxes.length; boxIndex++) {
    const box = boxes[boxIndex];
    for (const digit of DIGITS) {
      const spots = box.filter((cell) => !values[cell] && candidates[cell].includes(digit));
      if (spots.length < 2) continue;
      const sameRow = spots.every((cell) => Math.floor(cell / 9) === Math.floor(spots[0] / 9));
      const sameColumn = spots.every((cell) => cell % 9 === spots[0] % 9);
      const outside = sameRow
        ? rows[Math.floor(spots[0] / 9)].filter((cell) => !box.includes(cell))
        : sameColumn
          ? columns[spots[0] % 9].filter((cell) => !box.includes(cell))
          : [];
      const targets = outside
        .filter((cell) => !values[cell] && candidates[cell].includes(digit))
        .map((cell) => ({ cell, digit }));
      if (targets.length) {
        const line = sameRow ? `row ${Math.floor(spots[0] / 9) + 1}` : `column ${(spots[0] % 9) + 1}`;
        return {
          id: `locked-${boxIndex}-${digit}-${targets.map((t) => t.cell).join("-")}`,
          technique: "Locked candidates",
          summary: `${digit} is locked to ${line} inside box ${boxIndex + 1}.`,
          explanation: `Because every place for ${digit} in that box lies on the same line, ${digit} can be removed from the rest of the line.`,
          kind: "eliminate",
          evidence: spots,
          targets,
        };
      }
    }
  }
  for (const unit of units) {
    const open = unit.filter((cell) => !values[cell] && candidates[cell].length >= 2 && candidates[cell].length <= 3);
    for (const size of [2, 3]) {
      for (const group of combinations(open, size)) {
        const union = [...new Set(group.flatMap((cell) => candidates[cell]))];
        if (union.length !== size || !group.every((cell) => candidates[cell].every((d) => union.includes(d)))) continue;
        const targets = unit
          .filter((cell) => !group.includes(cell) && !values[cell])
          .flatMap((cell) => candidates[cell].filter((digit) => union.includes(digit)).map((digit) => ({ cell, digit })));
        if (targets.length) {
          const label = size === 2 ? "Naked pair" : "Naked triple";
          return {
            id: `${label}-${group.join("-")}-${union.join("")}`,
            technique: label,
            summary: `${union.join(", ")} are confined to ${size} cells in ${unitName(unit)}.`,
            explanation: `Those ${size} digits must occupy those ${size} cells, so they can be removed from every other cell in the unit.`,
            kind: "eliminate",
            evidence: group,
            targets,
          };
        }
      }
    }
  }
  for (const digit of DIGITS) {
    const rowPairs = rows
      .map((row, index) => ({ index, cols: row.filter((cell) => !values[cell] && candidates[cell].includes(digit)).map((cell) => cell % 9) }))
      .filter((item) => item.cols.length === 2);
    for (const pair of combinations(rowPairs, 2)) {
      if (pair[0].cols.join() !== pair[1].cols.join()) continue;
      const targets = pair[0].cols.flatMap((column) =>
        columns[column]
          .filter((cell) => !pair.some((row) => Math.floor(cell / 9) === row.index) && !values[cell] && candidates[cell].includes(digit))
          .map((cell) => ({ cell, digit })),
      );
      if (targets.length) {
        const evidence = pair.flatMap((row) => row.cols.map((column) => row.index * 9 + column));
        return {
          id: `x-wing-${digit}-${evidence.join("-")}`,
          technique: "X-Wing",
          summary: `${digit} appears in the same two columns in two rows.`,
          explanation: "One of those positions must contain the digit in each row, so the digit can be removed from those columns elsewhere.",
          kind: "eliminate",
          evidence,
          targets,
        };
      }
    }
  }
  return null;
}

export function applyHint(
  values: string[],
  eliminated: number[][],
  hint: Hint,
): void {
  for (const target of hint.targets) {
    if (hint.kind === "place") values[target.cell] = String(target.digit);
    else if (!eliminated[target.cell].includes(target.digit)) eliminated[target.cell].push(target.digit);
  }
}

export function isSolved(values: readonly string[], solution: string): boolean {
  return values.join("") === solution;
}

export function cellLabel(cell: number): string {
  return `Row ${Math.floor(cell / 9) + 1}, column ${(cell % 9) + 1}`;
}
