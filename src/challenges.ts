import type { Difficulty, Puzzle } from "./types.ts";

export type ChallengeCadence = "daily" | "weekly";

export const CHALLENGE_BANDS: Difficulty[] = ["Easy", "Medium", "Hard", "Diabolical"];

export function challengePeriodKey(cadence: ChallengeCadence, now = new Date()): string {
  if (cadence === "daily") return now.toISOString().slice(0, 10);

  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${isoYear}-W${String(week).padStart(2, "0")}`;
}

function stableHash(value: string): number {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function challengeIndex(pool: Puzzle[], band: Difficulty, cadence: ChallengeCadence, now: Date): number {
  const version = pool[0]?.catalogueVersion || "unknown";
  return stableHash(`${version}:${cadence}:${challengePeriodKey(cadence, now)}:${band}`) % pool.length;
}

export function challengePuzzle(catalogue: Puzzle[], band: Difficulty, cadence: ChallengeCadence, now = new Date()): Puzzle {
  const pool = catalogue.filter((puzzle) => puzzle.difficulty === band).sort((left, right) => left.id.localeCompare(right.id));
  if (!pool.length) throw new Error(`No ${band} puzzles are available for the challenge`);

  let index = challengeIndex(pool, band, cadence, now);
  if (cadence === "weekly" && pool.length > 1 && index === challengeIndex(pool, band, "daily", now)) index = (index + 1) % pool.length;
  return pool[index];
}

export function challengeSet(catalogue: Puzzle[], cadence: ChallengeCadence, now = new Date()): Puzzle[] {
  return CHALLENGE_BANDS.map((band) => challengePuzzle(catalogue, band, cadence, now));
}
