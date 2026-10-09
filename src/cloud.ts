import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  connectAuthEmulator,
  type User,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  runTransaction,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import type { Store } from "./store.ts";
import type { AnnotationColour, BoardSnapshot, Game, Preferences } from "./types.ts";

const environment = import.meta.env ?? {};
const config = {
  apiKey: environment.VITE_FIREBASE_API_KEY,
  authDomain: environment.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: environment.VITE_FIREBASE_PROJECT_ID,
  appId: environment.VITE_FIREBASE_APP_ID,
};

export const cloudConfigured = Object.values(config).every(Boolean);
const app = cloudConfigured ? initializeApp(config) : null;
export const auth = app ? getAuth(app) : null;
const database = app
  ? initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;

if (environment.VITE_USE_EMULATORS === "true" && auth && database) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(database, "127.0.0.1", 8080);
}

export type CloudUser = User;
export const watchAuth = (changed: (user: User | null) => void) =>
  auth ? onAuthStateChanged(auth, changed) : (changed(null), () => {});

export async function signInAccount(email: string, password: string, create = false) {
  if (!auth) throw new Error("Cloud sessions are not configured for this installation.");
  if (create) await createUserWithEmailAndPassword(auth, email, password);
  else await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutAccount() {
  if (auth) await signOut(auth);
}

export async function sendReset(email: string) {
  if (!auth) throw new Error("Cloud sessions are not configured for this installation.");
  await sendPasswordResetEmail(auth, email);
}

type CloudSnapshot = Omit<BoardSnapshot, "corner" | "centre" | "colours" | "eliminated"> & {
  corner: string[];
  centre: string[];
  colours: string[];
  eliminated: string[];
};

type CloudGame = Omit<Game, "corner" | "centre" | "colours" | "eliminated" | "history" | "future" | "hintHistory"> & CloudSnapshot & {
  version: 1;
  history: string[];
  future: string[];
  hintHistory: string[];
};

const encodeMarks = (marks: number[][]) => marks.map((digits) => [...digits].sort().join(""));
const decodeMarks = (marks: string[]) => marks.map((digits) => [...digits].map(Number).filter((digit) => digit >= 1 && digit <= 9));
const encodeColours = (colours: AnnotationColour[][]) => colours.map((items) => items.join("|"));
const validColours = new Set<AnnotationColour>(["cyan", "amber", "violet", "green", "rose", "slate", "lime", "orange", "indigo"]);
const decodeColours = (colours: string[]) => colours.map((items) => items.split("|").filter((colour): colour is AnnotationColour => validColours.has(colour as AnnotationColour)));

function encodeSnapshot(snapshot: BoardSnapshot): CloudSnapshot {
  return { ...snapshot, corner: encodeMarks(snapshot.corner), centre: encodeMarks(snapshot.centre), colours: encodeColours(snapshot.colours), eliminated: encodeMarks(snapshot.eliminated) };
}

function decodeSnapshot(value: string): BoardSnapshot | null {
  try {
    const snapshot = JSON.parse(value) as CloudSnapshot;
    if (snapshot.values?.length !== 81 || snapshot.corner?.length !== 81 || snapshot.centre?.length !== 81 || snapshot.colours?.length !== 81 || snapshot.eliminated?.length !== 81) return null;
    return { ...snapshot, corner: decodeMarks(snapshot.corner), centre: decodeMarks(snapshot.centre), colours: decodeColours(snapshot.colours), eliminated: decodeMarks(snapshot.eliminated), lines: Array.isArray(snapshot.lines) ? snapshot.lines : [] };
  } catch {
    return null;
  }
}

export function encodeCloudGame(game: Game): CloudGame {
  return {
    ...game,
    version: 1,
    corner: encodeMarks(game.corner),
    centre: encodeMarks(game.centre),
    colours: encodeColours(game.colours),
    eliminated: encodeMarks(game.eliminated),
    history: game.history.slice(-80).map((snapshot) => JSON.stringify(encodeSnapshot(snapshot))),
    future: game.future.slice(-80).map((snapshot) => JSON.stringify(encodeSnapshot(snapshot))),
    hintHistory: game.hintHistory.slice(-40).map((hint) => JSON.stringify(hint)),
  };
}

export function decodeCloudGame(value: unknown): Game | null {
  const game = value as CloudGame;
  if (!game || game.version !== 1 || typeof game.id !== "string" || game.puzzle?.givens?.length !== 81 || game.values?.length !== 81 || game.corner?.length !== 81 || game.centre?.length !== 81 || game.colours?.length !== 81 || game.eliminated?.length !== 81 || !Array.isArray(game.history) || !Array.isArray(game.future) || typeof game.updatedAt !== "number") return null;
  const history = game.history.map(decodeSnapshot);
  const future = game.future.map(decodeSnapshot);
  let hintHistory: Game["hintHistory"] = [];
  try { hintHistory = (game.hintHistory || []).map((hint) => JSON.parse(hint)); }
  catch { return null; }
  if (history.some((item) => !item) || future.some((item) => !item) || hintHistory.length > 40) return null;
  const { version: _version, ...rest } = game;
  return { ...rest, corner: decodeMarks(game.corner), centre: decodeMarks(game.centre), colours: decodeColours(game.colours), eliminated: decodeMarks(game.eliminated), lines: Array.isArray(game.lines) ? game.lines : [], history: history as BoardSnapshot[], future: future as BoardSnapshot[], hintHistory };
}

type CloudSettings = { preferences: Preferences; activeGameId: string | null; deletedGames?: Record<string, number>; updatedAt: number };

function validSettings(value: unknown): value is CloudSettings {
  const settings = value as CloudSettings;
  return Boolean(settings && typeof settings.preferences === "object" && typeof settings.updatedAt === "number" && (!settings.deletedGames || typeof settings.deletedGames === "object"));
}

export class CloudSync {
  user: User | null = null;
  working = false;
  error = "";
  ready = false;
  private store: Store;
  private changed: () => void;
  private stops: Unsubscribe[] = [];

  constructor(store: Store, changed: () => void) {
    this.store = store;
    this.changed = changed;
    addEventListener("online", () => {
      if (this.user) void this.uploadLocal();
    });
  }

  status() {
    if (!cloudConfigured) return "Device only";
    if (!this.user) return "Sign in to sync";
    if (this.error) return "Sync needs attention";
    if (this.working) return "Syncing…";
    return this.ready ? "Synced" : "Connecting…";
  }

  async setUser(user: User | null) {
    this.stop();
    this.user = user;
    this.error = "";
    this.ready = false;
    this.changed();
    if (!user || !database) return;
    const games = collection(database, "users", user.uid, "games");
    const settings = doc(database, "users", user.uid, "meta", "settings");
    this.stops.push(onSnapshot(games, { includeMetadataChanges: true }, async (snapshot) => {
      let updated = false;
      for (const change of snapshot.docChanges()) {
        if (change.type === "removed") updated = (await this.store.removeGame(change.doc.id)) || updated;
      }
      for (const item of snapshot.docs) {
        const game = decodeCloudGame(item.data());
        if (game) updated = (await this.store.mergeCloudGame(game)) || updated;
      }
      if (!snapshot.metadata.fromCache) this.ready = true;
      if (updated || !snapshot.metadata.fromCache) this.changed();
    }, () => this.fail()));
    this.stops.push(onSnapshot(settings, { includeMetadataChanges: true }, async (snapshot) => {
      const data = snapshot.data();
      if (snapshot.exists() && validSettings(data) && await this.store.mergeCloudSettings(data)) this.changed();
    }, () => this.fail()));
    await this.uploadLocal();
  }

  async uploadLocal() {
    if (!this.user || !database) return;
    this.working = true;
    this.changed();
    try {
      await this.syncSettings();
      for (const id of Object.keys(this.store.data.deletedGames)) if (!await this.deleteGame(id)) throw new Error("Cloud deletion failed");
      for (const game of Object.values(this.store.data.games)) await this.syncGame(game);
      this.error = "";
    } catch {
      this.fail();
    } finally {
      this.working = false;
      this.changed();
    }
  }

  async syncGame(game: Game) {
    if (!this.user || !database) return;
    const reference = doc(database, "users", this.user.uid, "games", game.id);
    try {
      await runTransaction(database, async (transaction) => {
        const remote = await transaction.get(reference);
        const remoteData = remote.data();
        const remoteGame = decodeCloudGame(remoteData);
        if (!remote.exists() || !remoteGame || remoteGame.updatedAt < game.updatedAt) transaction.set(reference, encodeCloudGame(game));
      });
      this.error = "";
    } catch {
      this.fail();
    }
  }

  async deleteGame(id: string) {
    if (!this.user || !database) return true;
    try {
      await deleteDoc(doc(database, "users", this.user.uid, "games", id));
      this.error = "";
      return true;
    } catch {
      this.fail();
      return false;
    }
  }

  async syncSettings() {
    if (!this.user || !database || !this.store.data.settingsUpdatedAt) return;
    const reference = doc(database, "users", this.user.uid, "meta", "settings");
    const settings = { version: 1, preferences: this.store.data.preferences, activeGameId: this.store.data.activeGameId, deletedGames: this.store.data.deletedGames, updatedAt: this.store.data.settingsUpdatedAt };
    try {
      await runTransaction(database, async (transaction) => {
        const remote = await transaction.get(reference);
        const remoteData = remote.data();
        const remoteDeletions = validSettings(remoteData) ? remoteData.deletedGames || {} : {};
        const deletedGames = { ...remoteDeletions };
        for (const [id, deletedAt] of Object.entries(settings.deletedGames)) deletedGames[id] = Math.max(deletedAt, deletedGames[id] || 0);
        const tombstonesChanged = Object.keys(deletedGames).some((id) => deletedGames[id] !== remoteDeletions[id]);
        const newest = validSettings(remoteData) && remoteData.updatedAt >= settings.updatedAt
          ? { version: 1, preferences: remoteData.preferences, activeGameId: remoteData.activeGameId, updatedAt: remoteData.updatedAt }
          : settings;
        if (!remote.exists() || !validSettings(remoteData) || remoteData.updatedAt < settings.updatedAt || tombstonesChanged) transaction.set(reference, { ...newest, deletedGames });
      });
      this.error = "";
    } catch {
      this.fail();
    }
  }

  private fail() {
    this.error = "Sync failed. Your latest changes remain saved on this device; reconnect and retry from Settings.";
    this.changed();
  }

  stop() {
    this.stops.forEach((stop) => stop());
    this.stops = [];
    this.working = false;
  }
}
