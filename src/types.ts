export type Difficulty = "Easy" | "Medium" | "Hard" | "Diabolical";
export type EntryMode = "normal" | "corner" | "centre" | "colour";
export type Theme = "system" | "light" | "dark";

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
  colours: string[];
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

export interface AppData {
  version: 1;
  catalogueVersion: string;
  settingsUpdatedAt: number;
  preferences: Preferences;
  games: Record<string, Game>;
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
