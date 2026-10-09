import { applyHint, candidateList, findHint } from "./sudoku.ts";
import type { Hint, Puzzle, TrainingTechniqueId } from "./types.ts";

export interface TrainingTechnique {
  id: TrainingTechniqueId;
  title: string;
  family: "Foundations" | "Intersections & subsets" | "Fish" | "Single-digit patterns" | "Wings" | "Coloring & chains" | "Uniqueness & ALS" | "Forcing";
  level: number;
  prerequisite: TrainingTechniqueId | null;
  concept: string;
  findPrompt: string;
  deductionPrompt: string;
}

export interface TrainingPosition {
  puzzle: Puzzle | null;
  origin: string;
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
  { id: "swordfish", title: "Swordfish", family: "Fish", level: 7, prerequisite: "x-wing", concept: "Three rows restrict one digit to the same three columns. Those columns are covered, so the digit can leave every other row there.", findPrompt: "Select the six candidates that form the three-row Swordfish.", deductionPrompt: "Choose a candidate eliminated from a cover column." },
  { id: "jellyfish", title: "Jellyfish", family: "Fish", level: 8, prerequisite: "swordfish", concept: "Four rows restrict one digit to four columns. The larger fish removes that digit from those columns in all other rows.", findPrompt: "Select the eight candidates that form the Jellyfish.", deductionPrompt: "Choose a candidate eliminated from one of its four cover columns." },
  { id: "skyscraper", title: "Skyscraper", family: "Single-digit patterns", level: 9, prerequisite: "x-wing", concept: "Two rows each have a strong pair for one digit and share one base column. Any cell that sees both opposite roofs cannot contain the digit.", findPrompt: "Select the two bases and two roofs of the Skyscraper.", deductionPrompt: "Choose the candidate that sees both roofs." },
  { id: "two-string-kite", title: "Two-string kite", family: "Single-digit patterns", level: 10, prerequisite: "skyscraper", concept: "A row strong link and a column strong link meet through one box. A cell seeing the two outer endpoints loses that digit.", findPrompt: "Select the four endpoints of the row-and-column kite.", deductionPrompt: "Choose the candidate that sees both outer endpoints." },
  { id: "xy-wing", title: "XY-Wing", family: "Wings", level: 11, prerequisite: "naked-pair", concept: "A bivalue pivot sees two bivalue wings. The wings share a third digit, which can be removed from every cell that sees both wings.", findPrompt: "Select the pivot and its two wings.", deductionPrompt: "Choose the shared wing candidate that can be eliminated." },
  { id: "xyz-wing", title: "XYZ-Wing", family: "Wings", level: 12, prerequisite: "xy-wing", concept: "A three-candidate pivot sees two wings that each share one pivot digit and a common Z. Cells seeing all three lose Z.", findPrompt: "Select the XYZ pivot and its two wings.", deductionPrompt: "Choose the common Z candidate eliminated by the wing." },
  { id: "w-wing", title: "W-Wing", family: "Wings", level: 13, prerequisite: "xy-wing", concept: "Two matching bivalue cells are joined by a strong link on one digit. Any cell seeing both wings loses their other digit.", findPrompt: "Select both wings and the two cells of their strong link.", deductionPrompt: "Choose the other wing digit that can be eliminated." },
  { id: "simple-coloring", title: "Simple coloring", family: "Coloring & chains", level: 14, prerequisite: "two-string-kite", concept: "Color a conjugate chain alternately. An uncolored candidate that sees both colors must be false.", findPrompt: "Select the alternating conjugate chain.", deductionPrompt: "Choose the uncolored candidate that sees both colors." },
  { id: "x-chain", title: "X-Chain", family: "Coloring & chains", level: 15, prerequisite: "simple-coloring", concept: "Alternate strong and weak links for one digit. When both endpoints are true in every valid alternation, a candidate seeing both endpoints is false.", findPrompt: "Select the alternating single-digit chain.", deductionPrompt: "Choose the candidate that sees both chain endpoints." },
  { id: "xy-chain", title: "XY-Chain", family: "Coloring & chains", level: 16, prerequisite: "xy-wing", concept: "A chain of bivalue cells passes a truth from digit to digit. A candidate seeing both matching endpoints can be removed.", findPrompt: "Select the ordered bivalue chain from one matching endpoint to the other.", deductionPrompt: "Choose the candidate eliminated by both endpoints." },
  { id: "aic", title: "Alternating inference chain", family: "Coloring & chains", level: 17, prerequisite: "xy-chain", concept: "An AIC alternates strong and weak logical links across cells and digits. Its endpoint relationship proves a placement or elimination.", findPrompt: "Select every node in the alternating inference chain.", deductionPrompt: "Choose the candidate contradicted by both endpoints." },
  { id: "unique-rectangle", title: "Unique rectangle", family: "Uniqueness & ALS", level: 18, prerequisite: "naked-pair", concept: "Four cells in two rows, two columns, and two boxes cannot all contain the same pair without creating two solutions. Extra candidates break the deadly pattern.", findPrompt: "Select the four corners of the potential deadly rectangle.", deductionPrompt: "Choose a deadly-pair candidate removed from the corner with extras." },
  { id: "als-xz", title: "ALS-XZ", family: "Uniqueness & ALS", level: 19, prerequisite: "aic", concept: "Two almost-locked sets share a restricted candidate X and another candidate Z. Z can be removed from cells that see every Z in both sets.", findPrompt: "Select both almost-locked sets.", deductionPrompt: "Choose the shared Z candidate eliminated outside the sets." },
  { id: "forcing-chain", title: "Forcing chain", family: "Forcing", level: 20, prerequisite: "aic", concept: "Follow every candidate branch from a pivot. When all branches reach the same consequence, that consequence is logically forced.", findPrompt: "Select the pivot and both implication branches.", deductionPrompt: "Choose the candidate contradicted by every branch." },
];

export const TRAINING_ROADMAP = [
  { id: "singles", title: "Singles", detail: "Naked and hidden singles", families: ["Foundations"] },
  { id: "subsets", title: "Intersections & subsets", detail: "Locked candidates, pairs, triples", families: ["Intersections & subsets"] },
  { id: "fish", title: "Fish & single-digit patterns", detail: "X-Wing, Swordfish, Jellyfish, Skyscraper, two-string kite", families: ["Fish", "Single-digit patterns"] },
  { id: "wings", title: "Wings", detail: "XY-Wing, XYZ-Wing, W-Wing", families: ["Wings"] },
  { id: "chains", title: "Coloring & chains", detail: "Simple coloring, X-chains, XY-chains, AIC", families: ["Coloring & chains"] },
  { id: "expert", title: "Expert structures", detail: "Unique rectangles, ALS-XZ, forcing chains", families: ["Uniqueness & ALS", "Forcing"] },
] as const;

const catalogueTechniqueNames: Partial<Record<TrainingTechniqueId, string>> = {
  "naked-single": "Naked single", "hidden-single": "Hidden single", "locked-candidates": "Locked candidates",
  "naked-pair": "Naked pair", "naked-triple": "Naked triple", "x-wing": "X-Wing",
};

const cell = (row: number, column: number) => (row - 1) * 9 + column - 1;
const candidateMap = (entries: Array<[number, number[]]>) => {
  const result = Array.from({ length: 81 }, () => [] as number[]);
  for (const [index, digits] of entries) result[index] = [...digits].sort((a, b) => a - b);
  return result;
};

function diagram(id: TrainingTechniqueId, entries: Array<[number, number[]]>, evidence: number[], targets: Hint["targets"], summary: string, explanation: string): TrainingPosition {
  const technique = TRAINING_TECHNIQUES.find((item) => item.id === id)!;
  return { puzzle: null, origin: "Original STrack candidate diagram", values: Array(81).fill(""), eliminated: Array.from({ length: 81 }, () => []), candidates: candidateMap(entries), hint: { id: `training-${id}`, technique: technique.title, summary, explanation, kind: "eliminate", evidence, targets } };
}

const authoredPositions = new Map<TrainingTechniqueId, TrainingPosition>([
  ["swordfish", diagram("swordfish", [[cell(1,2),[2,5]],[cell(1,5),[5,7]],[cell(4,5),[1,5]],[cell(4,8),[5,9]],[cell(7,2),[3,5]],[cell(7,8),[5,6]],[cell(9,2),[1,5,8]],[cell(3,6),[2,4,7]]], [cell(1,2),cell(1,5),cell(4,5),cell(4,8),cell(7,2),cell(7,8)], [{cell:cell(9,2),digit:5}], "The 5s in rows 1, 4, and 7 occupy only columns 2, 5, and 8.", "Each base row must place a 5 in one of those cover columns, so column 2 cannot contain another 5 in row 9.")],
  ["jellyfish", diagram("jellyfish", [[cell(1,1),[2,6]],[cell(1,6),[4,6]],[cell(3,3),[1,6]],[cell(3,9),[6,8]],[cell(6,1),[5,6]],[cell(6,3),[2,6]],[cell(8,6),[6,7]],[cell(8,9),[3,6]],[cell(5,3),[4,6,9]],[cell(4,5),[1,7]]], [cell(1,1),cell(1,6),cell(3,3),cell(3,9),cell(6,1),cell(6,3),cell(8,6),cell(8,9)], [{cell:cell(5,3),digit:6}], "Four rows confine 6 to columns 1, 3, 6, and 9.", "Those four rows consume all four placements in the cover columns, removing 6 from row 5, column 3.")],
  ["skyscraper", diagram("skyscraper", [[cell(2,2),[1,4]],[cell(2,8),[4,7]],[cell(5,2),[4,6]],[cell(5,7),[2,4]],[cell(3,7),[4,8]],[cell(7,4),[3,9]]], [cell(2,2),cell(2,8),cell(5,2),cell(5,7)], [{cell:cell(3,7),digit:4}], "Rows 2 and 5 each contain a strong pair for 4 with a shared base in column 2.", "At least one roof—row 2 column 8 or row 5 column 7—is 4, so row 3 column 7, which sees both roofs, cannot be 4.")],
  ["two-string-kite", diagram("two-string-kite", [[cell(2,2),[3,7]],[cell(2,7),[1,7]],[cell(1,3),[6,7]],[cell(8,3),[2,7]],[cell(8,7),[4,7,9]],[cell(5,5),[1,8]]], [cell(2,2),cell(2,7),cell(1,3),cell(8,3)], [{cell:cell(8,7),digit:7}], "The row-2 pair and column-3 pair for 7 meet through the top-left box.", "One outer endpoint must be 7, so row 8 column 7 sees a 7 in every branch and loses that candidate.")],
  ["xy-wing", diagram("xy-wing", [[cell(5,5),[1,2]],[cell(5,2),[1,3]],[cell(2,5),[2,3]],[cell(2,2),[3,6]],[cell(7,7),[4,8]]], [cell(5,5),cell(5,2),cell(2,5)], [{cell:cell(2,2),digit:3}], "The 1/2 pivot sees a 1/3 wing and a 2/3 wing.", "Whichever pivot digit is true, one wing becomes 3; row 2 column 2 sees both wings and cannot be 3.")],
  ["xyz-wing", diagram("xyz-wing", [[cell(5,5),[1,2,3]],[cell(5,4),[1,3]],[cell(4,5),[2,3]],[cell(4,4),[3,7]],[cell(8,2),[5,9]]], [cell(5,5),cell(5,4),cell(4,5)], [{cell:cell(4,4),digit:3}], "The 1/2/3 pivot sees 1/3 and 2/3 wings in the same box.", "One of the three pattern cells must be 3, so any cell seeing all three—including row 4 column 4—loses 3.")],
  ["w-wing", diagram("w-wing", [[cell(2,2),[1,8]],[cell(5,5),[1,8]],[cell(2,8),[1,4]],[cell(5,8),[1,6]],[cell(2,5),[3,8]],[cell(8,3),[2,7]]], [cell(2,2),cell(5,5),cell(2,8),cell(5,8)], [{cell:cell(2,5),digit:8}], "The two 1/8 wings are connected through the strong link on 1 in column 8.", "If either wing is not 1 it is 8; therefore row 2 column 5, which sees both wings, cannot contain 8.")],
  ["simple-coloring", diagram("simple-coloring", [[cell(1,1),[2,6]],[cell(1,5),[2,7]],[cell(5,5),[2,8]],[cell(5,3),[2,4]],[cell(3,3),[2,3,9]],[cell(8,7),[1,5]]], [cell(1,1),cell(1,5),cell(5,5),cell(5,3)], [{cell:cell(3,3),digit:2}], "Strong links color the four 2s alternately from row 1 through column 5 to row 5.", "Row 3 column 3 sees one color in its box and the other color in column 3, so it cannot be 2.")],
  ["x-chain", diagram("x-chain", [[cell(1,1),[5,9]],[cell(1,5),[2,9]],[cell(5,5),[7,9]],[cell(5,3),[4,9]],[cell(3,3),[1,8,9]],[cell(8,7),[3,6]]], [cell(1,1),cell(1,5),cell(5,5),cell(5,3)], [{cell:cell(3,3),digit:9}], "The 9 chain alternates strong, weak, and strong links between its endpoints.", "At least one endpoint is 9, so row 3 column 3, which sees both endpoints, cannot be 9.")],
  ["xy-chain", diagram("xy-chain", [[cell(2,2),[1,7]],[cell(2,5),[1,3]],[cell(5,5),[3,4]],[cell(5,8),[4,7]],[cell(2,8),[5,7,9]],[cell(8,1),[2,6]]], [cell(2,2),cell(2,5),cell(5,5),cell(5,8)], [{cell:cell(2,8),digit:7}], "The bivalue chain links 7–1, 1–3, 3–4, and 4–7.", "If the first endpoint is not 7, the chain forces the last endpoint to 7; a cell seeing both endpoints loses 7.")],
  ["aic", diagram("aic", [[cell(1,1),[2,5]],[cell(1,5),[2,7]],[cell(5,5),[7,9]],[cell(5,3),[5,9]],[cell(3,3),[3,5,8]],[cell(8,7),[1,4]]], [cell(1,1),cell(1,5),cell(5,5),cell(5,3)], [{cell:cell(3,3),digit:5}], "Strong and weak inferences alternate from the 5 at row 1 column 1 to the 5 at row 5 column 3.", "The alternating logic guarantees at least one endpoint is 5, so a candidate seeing both endpoints is false.")],
  ["unique-rectangle", diagram("unique-rectangle", [[cell(1,2),[4,6]],[cell(1,5),[4,6]],[cell(3,2),[4,6]],[cell(3,5),[4,6,9]],[cell(6,8),[2,7]]], [cell(1,2),cell(1,5),cell(3,2),cell(3,5)], [{cell:cell(3,5),digit:4},{cell:cell(3,5),digit:6}], "Three rectangle corners contain only 4/6 while the fourth also contains 9.", "Allowing 4 or 6 in the fourth corner would preserve a two-solution deadly rectangle, so its pair candidates are removed and 9 remains.")],
  ["als-xz", diagram("als-xz", [[cell(1,1),[1,2]],[cell(2,2),[2,4]],[cell(5,1),[1,3]],[cell(4,2),[3,4]],[cell(3,2),[4,7]],[cell(7,8),[5,9]]], [cell(1,1),cell(2,2),cell(5,1),cell(4,2)], [{cell:cell(3,2),digit:4}], "Two two-cell ALSs share restricted candidate 1 and common candidate 4.", "The restricted 1 means one ALS must contain 4; row 3 column 2 sees every 4 in both sets and therefore loses 4.")],
  ["forcing-chain", diagram("forcing-chain", [[cell(5,5),[2,8]],[cell(5,2),[2,4]],[cell(2,5),[4,8]],[cell(2,2),[4,6]],[cell(5,8),[3,7]],[cell(8,5),[1,9]]], [cell(5,5),cell(5,2),cell(2,5)], [{cell:cell(2,2),digit:4}], "Both candidates in the 2/8 pivot start an implication branch that produces a 4 seen by row 2 column 2.", "Because every branch contradicts 4 in the target, that candidate is false without choosing which pivot branch is true.")],
]);

const positionCache = new Map<TrainingTechniqueId, TrainingPosition>();

export function trainingTechnique(id: TrainingTechniqueId) { return TRAINING_TECHNIQUES.find((technique) => technique.id === id)!; }

export function findTrainingPosition(id: TrainingTechniqueId, catalogue: Puzzle[]): TrainingPosition | null {
  const cached = positionCache.get(id);
  if (cached) return cached;
  const authored = authoredPositions.get(id);
  if (authored) { positionCache.set(id, authored); return authored; }
  const techniqueName = catalogueTechniqueNames[id];
  if (!techniqueName) return null;
  for (const puzzle of catalogue.filter((item) => item.fullHints)) {
    const values = puzzle.givens.split("").map((value) => value === "0" ? "" : value);
    const eliminated = Array.from({ length: 81 }, () => [] as number[]);
    for (let step = 0; step < 200; step++) {
      const hint = findHint(values, eliminated);
      if (!hint) break;
      if (hint.technique === techniqueName) {
        const position = { puzzle, origin: `Bundled ${puzzle.source} puzzle`, values: [...values], eliminated: eliminated.map((digits) => [...digits]), candidates: Array.from({ length: 81 }, (_, index) => candidateList(values, index, eliminated)), hint };
        positionCache.set(id, position);
        return position;
      }
      applyHint(values, eliminated, hint);
    }
  }
  return null;
}

export function patternCells(position: TrainingPosition): number[] { return position.hint.kind === "place" ? [...new Set(position.hint.targets.map((target) => target.cell))] : [...new Set(position.hint.evidence)]; }

export function patternMatches(selected: Iterable<number>, position: TrainingPosition) {
  const actual = [...new Set(selected)].sort((a, b) => a - b);
  const expected = patternCells(position).sort((a, b) => a - b);
  return actual.length === expected.length && actual.every((item, index) => item === expected[index]);
}

export function deductionMatches(cellIndex: number, digit: number, position: TrainingPosition) { return position.hint.targets.some((target) => target.cell === cellIndex && target.digit === digit); }

export function validateTrainingPosition(position: TrainingPosition) {
  const evidence = patternCells(position);
  return evidence.length > 0 && evidence.every((index) => position.candidates[index].length > 0 || Boolean(position.values[index])) && position.hint.targets.length > 0 && position.hint.targets.every((target) => position.candidates[target.cell].includes(target.digit));
}
