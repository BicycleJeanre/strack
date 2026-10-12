import { Board, solve, type Hint as HoDoKuHint } from "../vendor/hodoku-ts/dist/index.js";
import { candidateList, units } from "./sudoku.ts";
import type { Hint, HintPath } from "./types.ts";

export const HINT_ENGINE = "HoDoKu TS e5b01c91";

interface HintContext {
  visibleCandidates?: readonly (readonly number[])[];
  solution?: string;
}

const forbiddenTechniques = new Set(["BRUTE_FORCE", "GIVE_UP", "INCOMPLETE"]);

function liveCandidates(
  values: readonly string[],
  eliminated: readonly number[][],
  visibleCandidates?: readonly (readonly number[])[],
): number[][] {
  const calculated = values.map((value, cell) => value ? [] : candidateList(values, cell, eliminated));
  const completeVisibleGrid = Boolean(visibleCandidates) && values.every((value, cell) => {
    if (value) return true;
    const shown = visibleCandidates?.[cell] || [];
    return shown.length > 0 && shown.every((digit) => calculated[cell].includes(digit));
  });
  return calculated.map((candidates, cell) => completeVisibleGrid
    ? candidates.filter((digit) => visibleCandidates?.[cell]?.includes(digit))
    : candidates);
}

function toBoard(
  values: readonly string[],
  eliminated: readonly number[][],
  visibleCandidates?: readonly (readonly number[])[],
): Board | null {
  const board = Board.fromValues(values.map((value) => Number(value) || 0), false);
  const candidates = liveCandidates(values, eliminated, visibleCandidates);
  for (let cell = 0; cell < 81; cell++) {
    if (values[cell]) continue;
    if (!candidates[cell].length) return null;
    for (let digit = 1; digit <= 9; digit++) {
      if (!candidates[cell].includes(digit) && !board.setCandidate(cell, digit, false)) return null;
    }
  }
  return board;
}

function unique(items: number[]): number[] {
  return [...new Set(items.filter((cell) => cell >= 0 && cell < 81))];
}

function singleEvidence(
  technique: string,
  cell: number,
  digit: number,
  values: readonly string[],
  candidates: readonly number[][],
): number[] {
  if (technique === "FULL_HOUSE") {
    return units.find((unit) => unit.includes(cell) && unit.filter((index) => values[index]).length === 8)?.filter((index) => index !== cell) || [];
  }
  if (technique === "HIDDEN_SINGLE") {
    return units.find((unit) => unit.includes(cell) && unit.filter((index) => !values[index] && candidates[index].includes(digit)).length === 1)?.filter((index) => index !== cell) || [];
  }
  if (technique === "NAKED_SINGLE") {
    return unique(units.flatMap((unit) => unit.includes(cell) ? unit : []).filter((index) => index !== cell && values[index]));
  }
  return [];
}

function techniqueName(hint: HoDoKuHint): { name: string; variant?: "pointing" | "claiming" } {
  if (hint.technique === "LOCKED_CANDIDATES_1") return { name: "Locked candidates", variant: "pointing" };
  if (hint.technique === "LOCKED_CANDIDATES_2") return { name: "Locked candidates", variant: "claiming" };
  const simple: Record<string, string> = {
    FULL_HOUSE: "Full house",
    NAKED_SINGLE: "Naked single",
    HIDDEN_SINGLE: "Hidden single",
    NAKED_PAIR: "Naked pair",
    NAKED_TRIPLE: "Naked triple",
    NAKED_QUADRUPLE: "Naked quadruple",
    HIDDEN_PAIR: "Hidden pair",
    HIDDEN_TRIPLE: "Hidden triple",
    HIDDEN_QUADRUPLE: "Hidden quadruple",
    LOCKED_PAIR: "Locked pair",
    LOCKED_TRIPLE: "Locked triple",
  };
  return { name: simple[hint.technique] || hint.name };
}

function evidenceFor(hint: HoDoKuHint, targets: Hint["targets"], values: readonly string[], candidates: readonly number[][]): number[] {
  const raw = hint.raw;
  const evidence = [
    ...raw.indices,
    ...raw.fins.map(({ index }) => index),
    ...raw.endoFins.map(({ index }) => index),
    ...raw.cannibalistic.map(({ index }) => index),
    ...raw.alses.flatMap(({ indices }) => indices),
    ...hint.links.flatMap(({ from, to }) => [from.index, to.index]),
  ];
  if (hint.placements.length === 1) evidence.push(...singleEvidence(hint.technique, hint.placements[0].index, hint.placements[0].value, values, candidates));
  const targetCells = new Set(targets.map(({ cell }) => cell));
  return unique(evidence).filter((cell) => !targetCells.has(cell));
}

function targetMatchesContext(target: { cell: number; digit: number }, kind: Hint["kind"], context: HintContext): boolean {
  if (context.solution) {
    const solvedDigit = Number(context.solution[target.cell]);
    if (kind === "place" ? solvedDigit !== target.digit : solvedDigit === target.digit) return false;
  }
  if (kind === "eliminate") {
    const shown = context.visibleCandidates?.[target.cell] || [];
    if (shown.length > 0 && !shown.includes(target.digit)) return false;
  }
  return true;
}

function convertHint(hint: HoDoKuHint, values: readonly string[], candidates: readonly number[][], context: HintContext): Hint | null {
  const kind: Hint["kind"] = hint.placements.length ? "place" : "eliminate";
  const sourceTargets = kind === "place" ? hint.placements : hint.eliminations;
  const targets = sourceTargets
    .map(({ index, value }) => ({ cell: index, digit: value }))
    .filter((target) => targetMatchesContext(target, kind, context));
  if (!targets.length) return null;
  const technique = techniqueName(hint);
  const targetKey = targets.map(({ cell, digit }) => `${cell}-${digit}`).join("-");
  return {
    id: `hodoku-${hint.technique}-${targetKey}`,
    technique: technique.name,
    variant: technique.variant,
    summary: `${technique.name} produces the next logical ${kind === "place" ? "placement" : "candidate elimination"}.`,
    explanation: hint.explanation,
    kind,
    evidence: evidenceFor(hint, targets, values, candidates),
    targets,
    links: hint.links.map(({ from, to, strong }) => ({
      from: { cell: from.index, digit: from.value },
      to: { cell: to.index, digit: to.value },
      strong,
    })),
  };
}

export function buildHintPath(values: readonly string[], eliminated: readonly number[][] = [], context: HintContext = {}): HintPath {
  const generatedAt = Date.now();
  if (context.solution && values.some((value, cell) => value && value !== context.solution?.[cell])) {
    return { engine: HINT_ENGINE, generatedAt, complete: false, hints: [] };
  }
  const board = toBoard(values, eliminated, context.visibleCandidates);
  if (!board) return { engine: HINT_ENGINE, generatedAt, complete: false, hints: [] };
  const result = solve(board);
  const forbiddenIndex = result.steps.findIndex((step) => forbiddenTechniques.has(step.technique));
  const logical = result.steps.slice(0, forbiddenIndex < 0 ? result.steps.length : forbiddenIndex);
  const pathValues = [...values];
  const pathEliminated = Array.from({ length: 81 }, (_, cell) => [...(eliminated[cell] || [])]);
  const hints: Hint[] = [];
  for (const step of logical) {
    const pathCandidates = liveCandidates(pathValues, pathEliminated);
    const hint = convertHint(step, pathValues, pathCandidates, context);
    if (!hint) continue;
    hints.push(hint);
    for (const { cell, digit } of hint.targets) {
      if (hint.kind === "place") pathValues[cell] = String(digit);
      else if (!pathEliminated[cell].includes(digit)) pathEliminated[cell].push(digit);
    }
  }
  return { engine: HINT_ENGINE, generatedAt, complete: result.solved && forbiddenIndex < 0, hints };
}

export function nextHintFromPath(path: HintPath | undefined, values: readonly string[], eliminated: readonly number[][] = [], context: HintContext = {}): Hint | null {
  if (!path || path.engine !== HINT_ENGINE) return null;
  return path.hints.find((hint) => hint.targets.length > 0 && hint.targets.every(({ cell, digit }) => {
    if (values[cell] || !candidateList(values, cell, eliminated).includes(digit)) return false;
    if (!targetMatchesContext({ cell, digit }, hint.kind, context)) return false;
    const shown = context.visibleCandidates?.[cell] || [];
    return hint.kind !== "eliminate" || shown.length === 0 || shown.includes(digit);
  })) || null;
}

export function findHint(values: readonly string[], eliminated: readonly number[][] = [], context: HintContext = {}): Hint | null {
  const path = buildHintPath(values, eliminated, context);
  return nextHintFromPath(path, values, eliminated, context);
}
