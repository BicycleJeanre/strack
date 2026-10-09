import { applyHint, candidateList, findHint } from "./sudoku.ts";
import type { Hint, Puzzle, TrainingTechniqueId } from "./types.ts";

export interface TrainingTechnique {
  id: TrainingTechniqueId;
  title: string;
  family: "Foundations" | "Intersections & subsets" | "Fish";
  level: number;
  prerequisite: TrainingTechniqueId | null;
  concept: string;
  findPrompt: string;
  deductionPrompt: string;
}

export interface TrainingPosition {
  puzzle: Puzzle;
  values: string[];
  eliminated: number[][];
  candidates: number[][];
  hint: Hint;
}

export const TRAINING_TECHNIQUES: TrainingTechnique[] = [
  { id: "naked-single", title: "Naked single", family: "Foundations", level: 1, prerequisite: null, concept: "A cell has only one candidate left. The cell itself tells you the answer.", findPrompt: "Select the empty cell that has only one possible digit.", deductionPrompt: "Choose the only candidate that can be placed in that cell." },
  { id: "hidden-single", title: "Hidden single", family: "Foundations", level: 2, prerequisite: "naked-single", concept: "A digit has only one possible home in a row, column, or box—even when that cell has other candidates.", findPrompt: "Select the cell that is the digit’s only possible home in its unit.", deductionPrompt: "Choose the digit that must be placed there." },
  { id: "locked-candidates", title: "Locked candidates", family: "Intersections & subsets", level: 3, prerequisite: "hidden-single", concept: "When every place for a digit in a box lies on one row or column, that digit can be removed from the rest of that line.", findPrompt: "Select all cells in the box that lock the candidate to one line.", deductionPrompt: "Choose one candidate that the lock eliminates outside the box." },
  { id: "naked-pair", title: "Naked pair", family: "Intersections & subsets", level: 4, prerequisite: "locked-candidates", concept: "Two cells in one unit share the same two candidates. Those digits belong to the pair and can leave every other cell in the unit.", findPrompt: "Select the two cells that form the naked pair.", deductionPrompt: "Choose one candidate that can be eliminated because of the pair." },
  { id: "naked-triple", title: "Naked triple", family: "Intersections & subsets", level: 5, prerequisite: "naked-pair", concept: "Three cells in one unit contain only the same three digits between them. Those digits can be removed elsewhere in the unit.", findPrompt: "Select the three cells that form the naked triple.", deductionPrompt: "Choose one candidate that the triple eliminates." },
  { id: "x-wing", title: "X-Wing", family: "Fish", level: 6, prerequisite: "naked-triple", concept: "A digit appears in the same two columns in two rows. Whichever corners are true, that digit cannot appear elsewhere in those columns.", findPrompt: "Select the four corners that form the X-Wing.", deductionPrompt: "Choose one candidate that the X-Wing eliminates." },
];

export const TRAINING_ROADMAP = [
  { title: "Singles", detail: "Naked and hidden singles", available: true },
  { title: "Intersections & subsets", detail: "Locked candidates, pairs, triples", available: true },
  { title: "Fish", detail: "X-Wing now; Swordfish and Jellyfish next", available: true },
  { title: "Wings", detail: "XY-Wing, XYZ-Wing, W-Wing", available: false },
  { title: "Coloring & chains", detail: "Simple coloring, X-chains, XY-chains, AIC", available: false },
  { title: "Expert structures", detail: "Uniqueness, ALS, forcing chains", available: false },
];

const techniqueNames: Record<TrainingTechniqueId, string> = {
  "naked-single": "Naked single",
  "hidden-single": "Hidden single",
  "locked-candidates": "Locked candidates",
  "naked-pair": "Naked pair",
  "naked-triple": "Naked triple",
  "x-wing": "X-Wing",
};

const positionCache = new Map<TrainingTechniqueId, TrainingPosition>();

export function trainingTechnique(id: TrainingTechniqueId) {
  return TRAINING_TECHNIQUES.find((technique) => technique.id === id)!;
}

export function findTrainingPosition(id: TrainingTechniqueId, catalogue: Puzzle[]): TrainingPosition | null {
  const cached = positionCache.get(id);
  if (cached) return cached;
  for (const puzzle of catalogue.filter((item) => item.fullHints)) {
    const values = puzzle.givens.split("").map((value) => value === "0" ? "" : value);
    const eliminated = Array.from({ length: 81 }, () => [] as number[]);
    for (let step = 0; step < 200; step++) {
      const hint = findHint(values, eliminated);
      if (!hint) break;
      if (hint.technique === techniqueNames[id]) {
        const position = { puzzle, values: [...values], eliminated: eliminated.map((digits) => [...digits]), candidates: Array.from({ length: 81 }, (_, cell) => candidateList(values, cell, eliminated)), hint };
        positionCache.set(id, position);
        return position;
      }
      applyHint(values, eliminated, hint);
    }
  }
  return null;
}

export function patternCells(position: TrainingPosition): number[] {
  return position.hint.kind === "place" ? [...new Set(position.hint.targets.map((target) => target.cell))] : [...new Set(position.hint.evidence)];
}

export function patternMatches(selected: Iterable<number>, position: TrainingPosition) {
  const actual = [...new Set(selected)].sort((a, b) => a - b);
  const expected = patternCells(position).sort((a, b) => a - b);
  return actual.length === expected.length && actual.every((cell, index) => cell === expected[index]);
}

export function deductionMatches(cell: number, digit: number, position: TrainingPosition) {
  return position.hint.targets.some((target) => target.cell === cell && target.digit === digit);
}
