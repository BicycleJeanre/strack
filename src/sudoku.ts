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

/**
 * A stored hint is presentation history, not authoritative solver state. Recheck
 * every target against the live board before showing or applying it so a hint
 * cannot survive an undo, sync merge, or already-applied candidate removal.
 */
export function isHintApplicable(
  values: readonly string[],
  eliminated: readonly number[][],
  hint: Hint,
  context: { visibleCandidates?: readonly (readonly number[])[]; solution?: string } = {},
): boolean {
  return hint.targets.length > 0 && hint.targets.every(({ cell, digit }) => {
    if (values[cell] || !candidateList(values, cell, eliminated).includes(digit)) return false;
    if (context.solution) {
      const solvedDigit = Number(context.solution[cell]);
      if (hint.kind === "place" ? solvedDigit !== digit : solvedDigit === digit) return false;
    }
    const shown = context.visibleCandidates?.[cell] || [];
    return hint.kind !== "eliminate" || shown.length === 0 || shown.includes(digit);
  });
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
