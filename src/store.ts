import { openDB } from "idb";
import type { AnnotationColour, AppData, BoardSnapshot, ColourLine, Game, Preferences, TrainingProgress, TrainingTechniqueId } from "./types.ts";

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  showTimer: true,
  autoCandidates: false,
  cleanCandidates: true,
  highlightPeers: true,
  highlightMatches: true,
  showMistakes: false,
};

export const CATALOGUE_VERSION = "2026.10.09+bank.d8c8eba";

export function emptyData(): AppData {
  return {
    version: 1,
    catalogueVersion: CATALOGUE_VERSION,
    settingsUpdatedAt: 0,
    preferences: { ...DEFAULT_PREFERENCES },
    trainingProgress: {},
    games: {},
    deletedGames: {},
    activeGameId: null,
  };
}

const trainingIds = new Set<TrainingTechniqueId>([
  "naked-single", "hidden-single", "locked-candidates", "naked-pair", "naked-triple", "x-wing",
  "swordfish", "jellyfish", "skyscraper", "two-string-kite", "xy-wing", "xyz-wing", "w-wing",
  "simple-coloring", "x-chain", "xy-chain", "aic", "unique-rectangle", "als-xz", "forcing-chain",
]);

function normalizeTrainingProgress(value: unknown): TrainingProgress {
  if (!value || typeof value !== "object") return {};
  const result: TrainingProgress = {};
  for (const [id, raw] of Object.entries(value)) {
    if (!trainingIds.has(id as TrainingTechniqueId) || !raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    result[id as TrainingTechniqueId] = {
      attempts: Math.max(0, Number(item.attempts) || 0), correct: Math.max(0, Number(item.correct) || 0), completed: Math.max(0, Number(item.completed) || 0),
      mastered: Boolean(item.mastered), lastPracticedAt: Math.max(0, Number(item.lastPracticedAt) || 0),
    };
  }
  return result;
}

const annotationColours = new Set<AnnotationColour>(["cyan", "amber", "violet", "green", "rose", "slate", "lime", "orange", "indigo"]);

function normalizeColours(value: unknown): AnnotationColour[][] {
  const items = Array.isArray(value) ? value : [];
  return Array.from({ length: 81 }, (_, cell) => {
    const raw = items[cell];
    const colours = Array.isArray(raw) ? raw : typeof raw === "string" && raw ? [raw] : [];
    return [...new Set(colours.filter((colour): colour is AnnotationColour => typeof colour === "string" && annotationColours.has(colour as AnnotationColour)))].slice(0, 9);
  });
}

function normalizeLines(value: unknown): ColourLine[] {
  if (!Array.isArray(value)) return [];
  const lines: ColourLine[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const { from, to, colour } = item as Partial<ColourLine>;
    if (!Number.isInteger(from) || !Number.isInteger(to) || from! < 0 || from! > 80 || to! < 0 || to! > 80 || from === to || !annotationColours.has(colour as AnnotationColour)) continue;
    const line = { from: Math.min(from!, to!), to: Math.max(from!, to!), colour: colour as AnnotationColour };
    const duplicate = lines.findIndex((current) => current.from === line.from && current.to === line.to);
    if (duplicate >= 0) lines[duplicate] = line;
    else if (lines.length < 160) lines.push(line);
  }
  return lines;
}

function normalizeSnapshot(snapshot: BoardSnapshot): BoardSnapshot {
  snapshot.colours = normalizeColours(snapshot.colours);
  snapshot.lines = normalizeLines(snapshot.lines);
  return snapshot;
}

function normalizeGame(game: Game): Game {
  normalizeSnapshot(game);
  game.history = Array.isArray(game.history) ? game.history.map((item) => normalizeSnapshot(item)) : [];
  game.future = Array.isArray(game.future) ? game.future.map((item) => normalizeSnapshot(item)) : [];
  game.hintHistory = Array.isArray(game.hintHistory) ? game.hintHistory : [];
  for (let cell = 0; cell < game.values.length; cell++) if (game.values[cell]) {
    game.corner[cell] = [];
    game.centre[cell] = [];
  }
  return game;
}

const database = openDB("strack-v1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
  },
});

export class Store {
  data: AppData = emptyData();
  onGameSaved: ((game: Game) => void) | null = null;
  onSettingsSaved: (() => void) | null = null;

  async load() {
    const saved = await (await database).get("state", "app");
    if (saved && saved.version === 1) {
      this.data = {
        ...emptyData(),
        ...saved,
        settingsUpdatedAt: saved.settingsUpdatedAt || 0,
        preferences: { ...DEFAULT_PREFERENCES, ...saved.preferences },
        trainingProgress: normalizeTrainingProgress(saved.trainingProgress),
        games: Object.fromEntries(Object.entries(saved.games || {}).map(([id, game]) => [id, normalizeGame(game as Game)])),
        deletedGames: saved.deletedGames || {},
      };
    }
  }

  async save() {
    await (await database).put("state", this.data, "app");
  }

  activeGame(): Game | null {
    return this.data.activeGameId ? this.data.games[this.data.activeGameId] || null : null;
  }

  async putGame(game: Game, active = true) {
    delete this.data.deletedGames[game.id];
    this.data.games[game.id] = game;
    if (active && this.data.activeGameId !== game.id) {
      this.data.activeGameId = game.id;
      this.data.settingsUpdatedAt = Date.now();
      this.onSettingsSaved?.();
    }
    await this.save();
    this.onGameSaved?.(game);
  }

  async saveSettings() {
    this.data.settingsUpdatedAt = Date.now();
    await this.save();
    this.onSettingsSaved?.();
  }

  async mergeCloudGame(game: Game) {
    normalizeGame(game);
    if (this.data.deletedGames[game.id]) return false;
    const local = this.data.games[game.id];
    if (local && local.updatedAt >= game.updatedAt) return false;
    this.data.games[game.id] = game;
    await this.save();
    return true;
  }

  async mergeCloudSettings(settings: { preferences: Preferences; activeGameId: string | null; deletedGames?: Record<string, number>; trainingProgress?: TrainingProgress; updatedAt: number }) {
    let changed = false;
    for (const [id, deletedAt] of Object.entries(settings.deletedGames || {})) {
      if (!Number.isFinite(deletedAt) || deletedAt <= (this.data.deletedGames[id] || 0)) continue;
      this.data.deletedGames[id] = deletedAt;
      if (this.data.games[id]) delete this.data.games[id];
      if (this.data.activeGameId === id) this.data.activeGameId = null;
      changed = true;
    }
    if (this.data.settingsUpdatedAt < settings.updatedAt) {
      this.data.preferences = { ...DEFAULT_PREFERENCES, ...settings.preferences };
      if (settings.trainingProgress !== undefined) this.data.trainingProgress = normalizeTrainingProgress(settings.trainingProgress);
      this.data.activeGameId = settings.activeGameId && !this.data.deletedGames[settings.activeGameId] ? settings.activeGameId : null;
      this.data.settingsUpdatedAt = settings.updatedAt;
      changed = true;
    }
    if (!changed) return false;
    await this.save();
    return true;
  }

  async removeGame(id: string, deletedAt = Date.now()) {
    const changed = Boolean(this.data.games[id]) || deletedAt > (this.data.deletedGames[id] || 0);
    if (!changed) return false;
    delete this.data.games[id];
    this.data.deletedGames[id] = Math.max(deletedAt, this.data.deletedGames[id] || 0);
    const deletions = Object.entries(this.data.deletedGames).sort((a, b) => b[1] - a[1]).slice(0, 500);
    this.data.deletedGames = Object.fromEntries(deletions);
    if (this.data.activeGameId === id) this.data.activeGameId = null;
    this.data.settingsUpdatedAt = Math.max(Date.now(), deletedAt);
    await this.save();
    this.onSettingsSaved?.();
    return true;
  }

  exportJson(): string {
    return JSON.stringify({
      format: "strack-backup",
      exportedAt: new Date().toISOString(),
      data: this.data,
    }, null, 2);
  }

  async importJson(raw: string): Promise<{ added: number; skipped: number }> {
    const parsed = JSON.parse(raw);
    if (parsed?.format !== "strack-backup" || parsed?.data?.version !== 1 || typeof parsed.data.games !== "object") {
      throw new Error("This is not a valid STrack version 1 backup.");
    }
    let added = 0;
    let skipped = 0;
    for (const [id, game] of Object.entries(parsed.data.games as Record<string, Game>)) {
      if (this.data.games[id]) skipped++;
      else if (game?.puzzle?.givens?.length === 81 && game.values?.length === 81) {
        delete this.data.deletedGames[id];
        this.data.games[id] = normalizeGame(game);
        added++;
      } else throw new Error(`Game ${id} is incomplete; nothing was imported.`);
    }
    this.data.preferences = { ...this.data.preferences, ...parsed.data.preferences };
    this.data.trainingProgress = { ...this.data.trainingProgress, ...normalizeTrainingProgress(parsed.data.trainingProgress) };
    await this.saveSettings();
    return { added, skipped };
  }

  async clear(scope: "current" | "history" | "all") {
    if (scope === "current" && this.data.activeGameId) delete this.data.games[this.data.activeGameId];
    if (scope === "history") {
      for (const [id, game] of Object.entries(this.data.games)) if (game.completedAt) delete this.data.games[id];
    }
    if (scope === "all") this.data = emptyData();
    if (this.data.activeGameId && !this.data.games[this.data.activeGameId]) this.data.activeGameId = null;
    await this.saveSettings();
  }
}
