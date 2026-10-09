import { openDB } from "idb";
import type { AppData, Game, Preferences } from "./types.ts";

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
    preferences: { ...DEFAULT_PREFERENCES },
    games: {},
    activeGameId: null,
  };
}

const database = openDB("strack-v1", 1, {
  upgrade(db) {
    db.createObjectStore("state");
  },
});

export class Store {
  data: AppData = emptyData();

  async load() {
    const saved = await (await database).get("state", "app");
    if (saved && saved.version === 1) {
      this.data = {
        ...emptyData(),
        ...saved,
        preferences: { ...DEFAULT_PREFERENCES, ...saved.preferences },
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
    this.data.games[game.id] = game;
    if (active) this.data.activeGameId = game.id;
    await this.save();
  }

  async removeGame(id: string) {
    delete this.data.games[id];
    if (this.data.activeGameId === id) this.data.activeGameId = null;
    await this.save();
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
        this.data.games[id] = game;
        added++;
      } else throw new Error(`Game ${id} is incomplete; nothing was imported.`);
    }
    this.data.preferences = { ...this.data.preferences, ...parsed.data.preferences };
    await this.save();
    return { added, skipped };
  }

  async clear(scope: "current" | "history" | "all") {
    if (scope === "current" && this.data.activeGameId) delete this.data.games[this.data.activeGameId];
    if (scope === "history") {
      for (const [id, game] of Object.entries(this.data.games)) if (game.completedAt) delete this.data.games[id];
    }
    if (scope === "all") this.data = emptyData();
    if (this.data.activeGameId && !this.data.games[this.data.activeGameId]) this.data.activeGameId = null;
    await this.save();
  }
}
