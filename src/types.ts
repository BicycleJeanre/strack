export type Difficulty = "Easy" | "Medium" | "Hard" | "Diabolical";
export type ChallengeCadence = "daily" | "weekly";
export type EntryMode = "normal" | "corner" | "centre" | "colour" | "line";
export type Theme = "system" | "light" | "dark";
export type AnnotationColour = "cyan" | "amber" | "violet" | "green" | "rose" | "slate" | "lime" | "orange" | "indigo";

export interface ColourLine {
  from: number;
  to: number;
  colour: AnnotationColour;
}

export interface Puzzle {
  id: string;
  givens: string;
  solution: string;
  source: "Sudoku Exchange Puzzle Bank" | "Imported";
  sourceUrl: string;
  provenance: string;
  licence: string;
  seRating: number | null;
  ratingEngine: string;
  ratingVersion: string;
  difficulty: Difficulty | "Unrated";
  catalogueVersion: string;
  fullHints: boolean;
}

export interface BoardSnapshot {
  values: string[];
  corner: number[][];
  centre: number[][];
  colours: AnnotationColour[][];
  lines: ColourLine[];
  eliminated: number[][];
}

export interface Game extends BoardSnapshot {
  id: string;
  puzzle: Puzzle;
  selected: number[];
  anchor: number;
  mode: EntryMode;
  history: BoardSnapshot[];
  future: BoardSnapshot[];
  elapsed: number;
  startedAt: number;
  updatedAt: number;
  completedAt: number | null;
  paused: boolean;
  hintStage: "none" | "preview";
  hintId: string | null;
  hintHistory: HintRecord[];
  challenge?: {
    cadence: ChallengeCadence;
    periodKey: string;
  };
}

export interface Preferences {
  theme: Theme;
  showTimer: boolean;
  autoCandidates: boolean;
  cleanCandidates: boolean;
  highlightPeers: boolean;
  highlightMatches: boolean;
  showMistakes: boolean;
}

export type TrainingTechniqueId =
  | "naked-single" | "hidden-single" | "locked-candidates" | "naked-pair" | "naked-triple"
  | "x-wing" | "swordfish" | "jellyfish" | "skyscraper" | "two-string-kite"
  | "xy-wing" | "xyz-wing" | "w-wing" | "simple-coloring" | "x-chain"
  | "xy-chain" | "aic" | "unique-rectangle" | "als-xz" | "forcing-chain";

export interface TrainingTechniqueProgress {
  attempts: number;
  correct: number;
  completed: number;
  mastered: boolean;
  lastPracticedAt: number;
}

export type TrainingProgress = Partial<Record<TrainingTechniqueId, TrainingTechniqueProgress>>;

export interface AppData {
  version: 1;
  catalogueVersion: string;
  settingsUpdatedAt: number;
  preferences: Preferences;
  trainingProgress: TrainingProgress;
  games: Record<string, Game>;
  deletedGames: Record<string, number>;
  activeGameId: string | null;
}

export interface Hint {
  id: string;
  technique: string;
  summary: string;
  explanation: string;
  kind: "place" | "eliminate";
  evidence: number[];
  targets: Array<{ cell: number; digit: number }>;
}

export interface HintRecord extends Hint {
  viewedAt: number;
  answerShown: boolean;
  applied: boolean;
  dismissed: boolean;
}
