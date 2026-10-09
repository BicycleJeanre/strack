import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after, before } from "node:test";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let environment;
const puzzle = {
  id: "test-puzzle", givens: "0".repeat(81), solution: "123456789".repeat(9), source: "Imported", sourceUrl: "", provenance: "test", licence: "test", seRating: null, ratingEngine: "Not rated", ratingVersion: "Not rated", difficulty: "Unrated", catalogueVersion: "test", fullHints: false,
};
const game = {
  version: 1, id: "game-1", puzzle, values: Array(81).fill(""), corner: Array(81).fill(""), centre: Array(81).fill(""), colours: Array(81).fill(""), eliminated: Array(81).fill(""), selected: [0], anchor: 0, mode: "normal", history: [], future: [], hintHistory: [], elapsed: 0, startedAt: 1, updatedAt: 1, completedAt: null, paused: false, hintStage: "none", hintId: null,
};

before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-strack",
    firestore: { rules: await readFile("firestore.rules", "utf8") },
  });
});
after(async () => environment?.cleanup());

test("owners can store and read valid games while other users cannot", async () => {
  const owner = environment.authenticatedContext("owner").firestore();
  const other = environment.authenticatedContext("other").firestore();
  await assertSucceeds(setDoc(doc(owner, "users/owner/games/game-1"), game));
  const { hintHistory: _hintHistory, ...legacyGame } = game;
  await assertSucceeds(setDoc(doc(owner, "users/owner/games/legacy"), { ...legacyGame, id: "legacy" }));
  await assertSucceeds(getDoc(doc(owner, "users/owner/games/game-1")));
  await assertFails(getDoc(doc(other, "users/owner/games/game-1")));
});

test("rules reject malformed games and unauthenticated writes", async () => {
  const owner = environment.authenticatedContext("owner").firestore();
  const guest = environment.unauthenticatedContext().firestore();
  await assertFails(setDoc(doc(owner, "users/owner/games/bad"), { ...game, id: "bad", values: [] }));
  await assertFails(setDoc(doc(guest, "users/owner/games/game-1"), game));
});

test("owners can store validated private settings", async () => {
  const owner = environment.authenticatedContext("owner").firestore();
  const settings = { version: 1, preferences: { theme: "system", showTimer: true, autoCandidates: false, cleanCandidates: true, highlightPeers: true, highlightMatches: true, showMistakes: false }, activeGameId: "game-1", updatedAt: 2 };
  await assertSucceeds(setDoc(doc(owner, "users/owner/meta/settings"), settings));
  const snapshot = await getDoc(doc(owner, "users/owner/meta/settings"));
  assert.equal(snapshot.data().activeGameId, "game-1");
});
