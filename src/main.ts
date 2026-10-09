import "./style.css";
import catalogueJson from "./data/puzzles.json";
import { CloudSync, cloudConfigured, sendReset, signInAccount, signOutAccount, watchAuth, type CloudUser } from "./cloud.ts";
import { applyColour, applyHint, clearSelected, createGame, enterDigit, moveSelection, redo, revealCell, selectCell, setMode, undo } from "./game.ts";
import { candidateList, cellLabel, findHint, normalizePuzzle, peers, validatePuzzle } from "./sudoku.ts";
import { Store } from "./store.ts";
import type { Difficulty, EntryMode, Game, Hint, Puzzle, Theme } from "./types.ts";

const catalogue = catalogueJson as Puzzle[];
const store = new Store();
const app = document.querySelector<HTMLDivElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
let view: "home" | "library" | "player" | "import" | "settings" = "home";
let libraryBand: Difficulty | "All" = "All";
let libraryCompletion: "all" | "new" | "started" | "complete" = "all";
let minRating = "";
let maxRating = "";
let multiSelect = false;
let activeHint: Hint | null = null;
let timerSaveCounter = 0;
let cloudUser: CloudUser | null = null;
const cloud = new CloudSync(store, () => {
  document.querySelectorAll<HTMLElement>("[data-cloud-status]").forEach((element) => { element.textContent = cloud.status(); });
  if (["home", "library", "settings"].includes(view) && app.querySelector("main")) render();
});

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function notify(message: string) {
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2400);
}

function applyTheme() {
  document.documentElement.dataset.theme = store.data.preferences.theme;
}

function shell(content: string, title: string) {
  const online = navigator.onLine;
  app.innerHTML = `
    <header class="app-header">
      <button class="brand" data-nav="home" aria-label="STrack home"><span class="brand-grid" aria-hidden="true">S</span><span>STrack</span></button>
      <span class="cloud-state" data-cloud-status>${cloud.status()}</span><nav aria-label="Main navigation">
        <button data-nav="library" class="${view === "library" ? "active" : ""}">Puzzles</button>
        <button data-nav="import" class="${view === "import" ? "active" : ""}">Open</button>
        <button data-nav="settings" class="${view === "settings" ? "active" : ""}" aria-label="Settings and help">•••</button>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <div class="page-heading"><div><span class="eyebrow">${online ? "Ready offline" : "Offline"}</span><h1>${escapeHtml(title)}</h1></div></div>
      ${content}
    </main>`;
  bindNavigation();
}

function bindNavigation() {
  app.querySelectorAll<HTMLElement>("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav as typeof view)));
}

function navigate(next: typeof view) {
  view = next;
  activeHint = null;
  history.replaceState(null, "", location.pathname + (next === "import" && new URLSearchParams(location.search).has("p") ? location.search : ""));
  render();
}

function puzzleStatus(puzzle: Puzzle) {
  const games = Object.values(store.data.games).filter((game) => game.puzzle.id === puzzle.id);
  if (games.some((game) => game.completedAt)) return "complete";
  if (games.length) return "started";
  return "new";
}

function rating(puzzle: Puzzle) {
  return puzzle.seRating === null ? "Unrated" : `SE ${puzzle.seRating.toFixed(1)}`;
}

function metaPill(puzzle: Puzzle) {
  return `<span class="difficulty ${puzzle.difficulty.toLowerCase()}">${escapeHtml(puzzle.difficulty)}</span><span class="rating" title="Sudoku Explainer rating">${rating(puzzle)}</span>`;
}

function renderHome() {
  const active = store.activeGame();
  const recent = Object.values(store.data.games).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 4);
  shell(`
    <section class="hero card">
      <div><span class="eyebrow">Sudoku, thoughtfully</span><h2>${active ? "Your grid is waiting." : "A quieter way to solve."}</h2>
      <p>Transparent difficulty, explanatory hints, and every puzzle available without a connection.${cloudUser ? " Your signed-in progress follows you between devices." : " Sign in from Settings to continue on another device."}</p></div>
      ${active ? `<button class="primary" id="resume">${active.completedAt ? "Review puzzle" : "Resume puzzle"}<small>${escapeHtml(active.puzzle.difficulty)} · ${rating(active.puzzle)} · ${formatTime(active.elapsed)}</small></button>` : `<button class="primary" id="quick-start">Start an Easy puzzle<small>Chosen from the offline collection</small></button>`}
    </section>
    <section aria-labelledby="choose-title"><div class="section-heading"><div><span class="eyebrow">New puzzle</span><h2 id="choose-title">Choose your pace</h2></div><button class="text-button" data-nav="library">See all 80 →</button></div>
      <div class="band-grid">${(["Easy", "Medium", "Hard", "Diabolical"] as Difficulty[]).map((band) => {
        const detail = band === "Easy" ? "Singles and a gentle start" : band === "Medium" ? "Pairs and locked candidates" : band === "Hard" ? "Longer logical paths" : "Advanced solving; hints may be partial";
        return `<button class="band-card" data-band="${band}"><span class="band-mark ${band.toLowerCase()}"></span><strong>${band}</strong><small>${detail}</small></button>`;
      }).join("")}</div>
    </section>
    <section aria-labelledby="recent-title"><div class="section-heading"><div><span class="eyebrow">On this device</span><h2 id="recent-title">Recent puzzles</h2></div></div>
      ${recent.length ? `<div class="recent-list">${recent.map((game) => `<button class="recent-card" data-game="${game.id}"><span>${metaPill(game.puzzle)}</span><strong>${game.completedAt ? "Completed" : `${Math.round(game.values.filter(Boolean).length / 81 * 100)}% filled`}</strong><small>${new Date(game.updatedAt).toLocaleDateString()}</small></button>`).join("")}</div>` : `<div class="empty card"><span aria-hidden="true">⌁</span><h3>No local history yet</h3><p>Started and completed puzzles will stay here on this device.</p></div>`}
    </section>`, `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}`);
  app.querySelector("#resume")?.addEventListener("click", () => { view = "player"; render(); });
  app.querySelector("#quick-start")?.addEventListener("click", () => startPuzzle(pickPuzzle("Easy")));
  app.querySelectorAll<HTMLElement>("[data-band]").forEach((button) => button.addEventListener("click", () => startPuzzle(pickPuzzle(button.dataset.band as Difficulty))));
  app.querySelectorAll<HTMLElement>("[data-game]").forEach((button) => button.addEventListener("click", async () => { store.data.activeGameId = button.dataset.game!; await store.saveSettings(); view = "player"; render(); }));
}

function pickPuzzle(band: Difficulty): Puzzle {
  const candidates = catalogue.filter((puzzle) => puzzle.difficulty === band && puzzleStatus(puzzle) === "new");
  const pool = candidates.length ? candidates : catalogue.filter((puzzle) => puzzle.difficulty === band);
  const seed = [...new Date().toISOString().slice(0, 10)].reduce((total, char) => total + char.charCodeAt(0), 0) + Object.keys(store.data.games).length;
  return pool[seed % pool.length];
}

async function startPuzzle(puzzle: Puzzle) {
  const existing = Object.values(store.data.games).find((game) => game.puzzle.id === puzzle.id && !game.completedAt);
  await store.putGame(existing || createGame(puzzle));
  view = "player";
  render();
}

function renderLibrary() {
  const filtered = catalogue.filter((puzzle) => {
    const completion = puzzleStatus(puzzle);
    return (libraryBand === "All" || puzzle.difficulty === libraryBand) &&
      (libraryCompletion === "all" || completion === libraryCompletion) &&
      (!minRating || (puzzle.seRating ?? -1) >= Number(minRating)) &&
      (!maxRating || (puzzle.seRating ?? 99) <= Number(maxRating));
  });
  shell(`
    <section class="filters card" aria-label="Puzzle filters">
      <label>Difficulty<select id="band-filter">${["All", "Easy", "Medium", "Hard", "Diabolical"].map((value) => `<option ${value === libraryBand ? "selected" : ""}>${value}</option>`).join("")}</select></label>
      <label>Progress<select id="completion-filter">${[["all", "All"], ["new", "Not started"], ["started", "In progress"], ["complete", "Completed"]].map(([value, label]) => `<option value="${value}" ${value === libraryCompletion ? "selected" : ""}>${label}</option>`).join("")}</select></label>
      <label>Min SE<input id="min-rating" inputmode="decimal" value="${escapeHtml(minRating)}" placeholder="1.0" /></label>
      <label>Max SE<input id="max-rating" inputmode="decimal" value="${escapeHtml(maxRating)}" placeholder="9.9" /></label>
    </section>
    <div class="library-summary"><p><strong>${filtered.length}</strong> puzzles · bundled and available offline</p><button id="surprise" class="secondary">Surprise me</button></div>
    <section class="puzzle-list" aria-label="Puzzle library">${filtered.map((puzzle) => {
      const status = puzzleStatus(puzzle);
      return `<article class="puzzle-card card"><div><span>${metaPill(puzzle)}</span><h2>Puzzle ${puzzle.id.slice(-6).toUpperCase()}</h2><p>${status === "complete" ? "Completed on this device" : status === "started" ? "In progress" : puzzle.fullHints ? "Full local hint path" : "Advanced hints may be partial"}</p></div><div class="puzzle-actions"><button class="info-button" data-info="${puzzle.id}" aria-label="Puzzle details">i</button><button class="primary compact" data-puzzle="${puzzle.id}">${status === "started" ? "Continue" : status === "complete" ? "Play again" : "Play"}</button></div></article>`;
    }).join("") || `<div class="empty card"><h3>No puzzles match</h3><p>Try widening the rating or progress filters.</p></div>`}</section>`, "Puzzle library");
  const rerender = () => renderLibrary();
  app.querySelector<HTMLSelectElement>("#band-filter")!.addEventListener("change", (event) => { libraryBand = (event.target as HTMLSelectElement).value as typeof libraryBand; rerender(); });
  app.querySelector<HTMLSelectElement>("#completion-filter")!.addEventListener("change", (event) => { libraryCompletion = (event.target as HTMLSelectElement).value as typeof libraryCompletion; rerender(); });
  app.querySelector<HTMLInputElement>("#min-rating")!.addEventListener("change", (event) => { minRating = (event.target as HTMLInputElement).value; rerender(); });
  app.querySelector<HTMLInputElement>("#max-rating")!.addEventListener("change", (event) => { maxRating = (event.target as HTMLInputElement).value; rerender(); });
  app.querySelector("#surprise")?.addEventListener("click", () => startPuzzle(filtered[0] || pickPuzzle("Easy")));
  app.querySelectorAll<HTMLElement>("[data-puzzle]").forEach((button) => button.addEventListener("click", () => startPuzzle(catalogue.find((puzzle) => puzzle.id === button.dataset.puzzle)!)));
  app.querySelectorAll<HTMLElement>("[data-info]").forEach((button) => button.addEventListener("click", () => showPuzzleInfo(catalogue.find((puzzle) => puzzle.id === button.dataset.info)!)));
}

function showPuzzleInfo(puzzle: Puzzle) {
  showDialog(`
    <span class="eyebrow">Puzzle details</span><h2>${escapeHtml(puzzle.difficulty)} · ${rating(puzzle)}</h2>
    <dl><dt>Rating engine</dt><dd>${escapeHtml(puzzle.ratingEngine)}</dd><dt>Rating provenance</dt><dd>${escapeHtml(puzzle.ratingVersion)}</dd><dt>Source</dt><dd><a href="${escapeHtml(puzzle.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(puzzle.source)}</a></dd><dt>Licence</dt><dd>${escapeHtml(puzzle.licence)}</dd><dt>Catalogue</dt><dd>${escapeHtml(puzzle.catalogueVersion)}</dd></dl>
    <p>${escapeHtml(puzzle.provenance)}</p><p><strong>What SE means:</strong> the number represents the hardest technique on SukakuExplainer’s selected logical solve path. It is useful and reproducible, but not a universal or official difficulty scale.</p>`, "Close details");
}

function cellMarkup(game: Game, cell: number, hint: Hint | null): string {
  const value = game.values[cell];
  const given = game.puzzle.givens[cell] !== "0";
  const selected = game.selected.includes(cell);
  const anchorValue = game.values[game.anchor];
  const classes = ["sudoku-cell", given ? "given" : "", selected ? "selected" : "", !selected && store.data.preferences.highlightPeers && game.selected.some((chosen) => peers[chosen].includes(cell)) ? "peer" : "", store.data.preferences.highlightMatches && anchorValue && value === anchorValue ? "match" : "", store.data.preferences.showMistakes && value && value !== game.puzzle.solution[cell] ? "mistake" : "", hint?.evidence.includes(cell) ? "hint-evidence" : "", hint?.targets.some((target) => target.cell === cell) ? "hint-target" : "", game.colours[cell] ? `colour-${game.colours[cell]}` : ""].filter(Boolean).join(" ");
  let content = "";
  if (value) content = `<span class="cell-value">${value}</span>`;
  else {
    if (game.corner[cell].length) content += `<span class="corner-marks">${[1,2,3,4,5,6,7,8,9].map((digit) => `<i>${game.corner[cell].includes(digit) ? digit : ""}</i>`).join("")}</span>`;
    if (game.centre[cell].length) content += `<span class="centre-marks">${game.centre[cell].join("")}</span>`;
    if (!game.corner[cell].length && !game.centre[cell].length && store.data.preferences.autoCandidates) content = `<span class="corner-marks auto">${[1,2,3,4,5,6,7,8,9].map((digit) => `<i>${candidateList(game.values, cell, game.eliminated).includes(digit) ? digit : ""}</i>`).join("")}</span>`;
  }
  return `<button class="${classes}" data-cell="${cell}" aria-label="${cellLabel(cell)}${value ? `, ${given ? "given " : ""}${value}` : ", empty"}" aria-pressed="${selected}">${content}<span class="colour-cue" aria-hidden="true"></span></button>`;
}

function renderPlayer() {
  const game = store.activeGame();
  if (!game) { view = "home"; return renderHome(); }
  if (game.hintStage === "preview") activeHint = findHint(game.values, game.eliminated);
  const wrong = game.values.some((value, cell) => value && value !== game.puzzle.solution[cell]);
  shell(`
    <section class="player-meta"><button class="back-button" data-nav="home">← Home</button><div>${metaPill(game.puzzle)}</div><button class="info-button" id="puzzle-info" aria-label="Puzzle details">i</button></section>
    <section class="player-layout">
      <div class="board-column">
        <div class="board-status"><span id="timer" class="timer ${store.data.preferences.showTimer ? "" : "hidden"}">${formatTime(game.elapsed)}</span><span>${game.completedAt ? "Solved" : game.paused ? "Paused" : navigator.onLine ? "Saved on device" : "Saved · offline"}</span></div>
        <div class="sudoku-board ${game.paused && !game.completedAt ? "paused" : ""}" role="grid" aria-label="Sudoku board">${Array.from({ length: 81 }, (_, cell) => cellMarkup(game, cell, activeHint)).join("")}${game.paused && !game.completedAt ? `<button class="pause-cover" id="resume-board"><strong>Paused</strong><span>Tap to continue</span></button>` : ""}</div>
        ${game.completedAt ? `<div class="completion-banner" role="status"><span aria-hidden="true">✓</span><div><strong>Puzzle complete</strong><small>${game.puzzle.difficulty} · ${rating(game.puzzle)} · ${formatTime(game.elapsed)}</small></div><button id="next-puzzle">Next puzzle</button></div>` : ""}
      </div>
      <aside class="controls" aria-label="Puzzle controls">
        <div class="toolbar"><button id="undo" aria-label="Undo" ${!game.history.length ? "disabled" : ""}>↶<small>Undo</small></button><button id="redo" aria-label="Redo" ${!game.future.length ? "disabled" : ""}>↷<small>Redo</small></button><button id="pause" aria-label="${game.paused ? "Resume" : "Pause"} puzzle">${game.paused ? "▶" : "Ⅱ"}<small>${game.paused ? "Resume" : "Pause"}</small></button><button id="hint" aria-label="Get a logical hint">?<small>Hint</small></button></div>
        ${activeHint ? `<div class="hint-panel" role="status"><span class="eyebrow">${escapeHtml(activeHint.technique)}</span><h3>${escapeHtml(activeHint.summary)}</h3><p>${escapeHtml(activeHint.explanation)}</p><div class="actions"><button id="apply-hint" class="primary compact">Apply deduction</button><button id="reveal" class="text-button">Reveal selected value</button></div></div>` : ""}
        ${wrong && !store.data.preferences.showMistakes ? `<p class="quiet-warning">Something on the board conflicts with the solution. Turn on mistake checks in Settings for cell-level cues.</p>` : ""}
        <div class="mode-switch" role="group" aria-label="Entry mode">${([['normal','Digit'],['corner','Corner'],['centre','Centre'],['colour','Colour']] as [EntryMode,string][]).map(([mode,label]) => `<button data-mode="${mode}" class="${game.mode === mode ? "active" : ""}" aria-pressed="${game.mode === mode}">${label}</button>`).join("")}</div>
        ${game.mode === "colour" ? `<div class="colour-pad" aria-label="Cell colours">${["cyan","amber","violet","green","rose","slate"].map((colour) => `<button data-colour="${colour}" class="colour-${colour}" aria-label="Apply ${colour} colour"><span></span></button>`).join("")}<button data-colour="" aria-label="Clear cell colour">×</button></div>` : `<div class="number-pad" aria-label="Number pad">${[1,2,3,4,5,6,7,8,9].map((digit) => `<button data-digit="${digit}">${digit}</button>`).join("")}<button id="clear" class="clear-key">Clear</button></div>`}
        <button id="multi" class="multi-toggle ${multiSelect ? "active" : ""}" aria-pressed="${multiSelect}"><span aria-hidden="true">▦</span> Multi-select ${multiSelect ? "on" : "off"}</button>
        <p class="control-help">Keyboard: arrows move · 1–9 enter · C corner · M centre · V colour · Shift extends selection · Ctrl/⌘ Z undo</p>
      </aside>
    </section>`, "Puzzle desk");
  bindPlayer(game);
}

function bindPlayer(game: Game) {
  app.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell) => cell.addEventListener("click", async (event) => { selectCell(game, Number(cell.dataset.cell), multiSelect || (event as MouseEvent).shiftKey || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey); await store.putGame(game); renderPlayer(); }));
  app.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => button.addEventListener("click", async () => { setMode(game, button.dataset.mode as EntryMode); await store.putGame(game); renderPlayer(); }));
  app.querySelectorAll<HTMLElement>("[data-digit]").forEach((button) => button.addEventListener("click", () => changeGame(game, () => enterDigit(game, Number(button.dataset.digit), store.data.preferences.cleanCandidates))));
  app.querySelectorAll<HTMLElement>("[data-colour]").forEach((button) => button.addEventListener("click", () => changeGame(game, () => applyColour(game, button.dataset.colour!))));
  app.querySelector("#clear")?.addEventListener("click", () => changeGame(game, () => clearSelected(game)));
  app.querySelector("#undo")?.addEventListener("click", () => changeGame(game, () => undo(game)));
  app.querySelector("#redo")?.addEventListener("click", () => changeGame(game, () => redo(game)));
  app.querySelector("#multi")?.addEventListener("click", () => { multiSelect = !multiSelect; renderPlayer(); });
  app.querySelector("#pause")?.addEventListener("click", () => changeGame(game, () => { game.paused = !game.paused; }));
  app.querySelector("#resume-board")?.addEventListener("click", () => changeGame(game, () => { game.paused = false; }));
  app.querySelector("#puzzle-info")?.addEventListener("click", () => showPuzzleInfo(game.puzzle));
  app.querySelector("#hint")?.addEventListener("click", () => {
    activeHint = findHint(game.values, game.eliminated);
    game.hintStage = activeHint ? "preview" : "none";
    game.hintId = activeHint?.id || null;
    if (!activeHint) notify("No supported logical step found. You can reveal the selected value from Help.");
    renderPlayer();
  });
  app.querySelector("#apply-hint")?.addEventListener("click", () => activeHint && changeGame(game, () => applyHint(game, activeHint!)));
  app.querySelector("#reveal")?.addEventListener("click", () => changeGame(game, () => { if (!revealCell(game)) notify("Select an empty or incorrect cell first."); }));
  app.querySelector("#next-puzzle")?.addEventListener("click", () => startPuzzle(pickPuzzle(game.puzzle.difficulty as Difficulty)));
}

async function changeGame(game: Game, change: () => unknown) {
  if (game.paused && !game.completedAt) return;
  change();
  activeHint = null;
  await store.putGame(game);
  renderPlayer();
}

function renderImport() {
  const fromUrl = new URLSearchParams(location.search).get("p") || "";
  shell(`
    <section class="split-layout">
      <form id="import-form" class="card form-card"><span class="eyebrow">Puzzle string</span><h2>Open a puzzle</h2><p>Paste 81 cells. Use 1–9 for givens and 0 or . for blanks. Validation and solving happen entirely on this device.</p><label for="puzzle-string">81-character puzzle</label><textarea id="puzzle-string" rows="5" spellcheck="false" placeholder="53..7....6..195...…">${escapeHtml(fromUrl)}</textarea><div id="import-feedback" role="status"></div><button class="primary" type="submit">Validate puzzle</button></form>
      <div class="card explainer"><span class="eyebrow">Private by design</span><h2>Share without uploading</h2><p>After validation, STrack creates a link containing only the givens. The puzzle is never sent to a server.</p><ol><li>Shape and givens are checked.</li><li>A local solver confirms exactly one solution.</li><li>You choose whether to play or copy the link.</li></ol></div>
    </section>`, "Open or share");
  const form = app.querySelector<HTMLFormElement>("#import-form")!;
  if (fromUrl) setTimeout(() => form.requestSubmit(), 0);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const input = app.querySelector<HTMLTextAreaElement>("#puzzle-string")!.value;
    const feedback = app.querySelector<HTMLDivElement>("#import-feedback")!;
    feedback.innerHTML = `<p class="checking">Checking shape, conflicts, and uniqueness…</p>`;
    setTimeout(() => {
      const result = validatePuzzle(input);
      if (!result.valid) return void (feedback.innerHTML = `<p class="error">${escapeHtml(result.message)}</p>`);
      const normalized = result.normalized!;
      feedback.innerHTML = `<div class="success"><strong>Unique puzzle</strong><p>${escapeHtml(result.message)}</p><div class="actions"><button type="button" class="primary compact" id="play-import">Play now</button><button type="button" class="secondary compact" id="copy-link">Copy share link</button></div></div>`;
      const puzzle: Puzzle = { id: `import-${normalized.slice(0, 12)}-${normalized.slice(-6)}`, givens: normalized, solution: result.solution!, source: "Imported", sourceUrl: "", provenance: "Entered or opened locally by the user.", licence: "User-provided; redistribution terms unknown", seRating: null, ratingEngine: "Not rated", ratingVersion: "Not rated", difficulty: "Unrated", catalogueVersion: "user-import", fullHints: false };
      feedback.querySelector("#play-import")!.addEventListener("click", () => startPuzzle(puzzle));
      feedback.querySelector("#copy-link")!.addEventListener("click", async () => {
        const url = new URL(location.href); url.search = ""; url.hash = ""; url.searchParams.set("p", normalized);
        await navigator.clipboard.writeText(url.href); notify("Share link copied");
      });
    }, 20);
  });
}

function renderSettings() {
  const preferences = store.data.preferences;
  shell(`
    <section class="settings-grid">
      <div class="card settings-card account-card"><span class="eyebrow">Cross-device sessions</span><h2>${cloudUser ? "Progress sync is on" : "Continue on another device"}</h2>
        ${!cloudConfigured ? `<p>Cloud sessions are not configured in this build. Device-only play remains fully available.</p>` : cloudUser ? `<p>Signed in as <strong>${escapeHtml(cloudUser.email || "your account")}</strong>. Puzzle edits, notation, colours, elapsed time, completion history, and preferences sync through your private Firestore account.</p><p class="sync-message ${cloud.error ? "error" : ""}" data-cloud-status>${escapeHtml(cloud.status())}</p>${cloud.error ? `<p class="error">${escapeHtml(cloud.error)}</p><button id="retry-sync" class="secondary">Retry sync</button>` : ""}<button id="sign-out" class="secondary">Sign out on this device</button>` : `<p>Create an account or sign in with the same email on your PC and phone. Offline edits remain on each device and reconcile by the newest saved puzzle version when a connection returns.</p><form id="account-form"><label>Email<input id="account-email" type="email" autocomplete="email" required /></label><label>Password<input id="account-password" type="password" autocomplete="current-password" minlength="6" required /></label><div class="actions"><button class="primary compact" type="submit">Sign in</button><button class="secondary compact" type="submit" data-create="true">Create account</button></div><button class="text-button" type="button" id="reset-password">Send password reset email</button><p id="account-feedback" role="status"></p></form>`}
      </div>
      <div class="card settings-card"><span class="eyebrow">Appearance</span><h2>Make the desk yours</h2><label>Theme<select id="theme">${(["system","light","dark"] as Theme[]).map((theme) => `<option value="${theme}" ${theme === preferences.theme ? "selected" : ""}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join("")}</select></label>${toggle("showTimer", "Show timer", "Keep time available without turning it into a score.", preferences.showTimer)}${toggle("highlightPeers", "Highlight peers", "Shade cells sharing a row, column, or box.", preferences.highlightPeers)}${toggle("highlightMatches", "Highlight matching digits", "Show every copy of the selected digit.", preferences.highlightMatches)}</div>
      <div class="card settings-card"><span class="eyebrow">Assistance</span><h2>Notation and checks</h2>${toggle("autoCandidates", "Automatic candidates", "Show canonical candidates in empty cells with no notes.", preferences.autoCandidates)}${toggle("cleanCandidates", "Clean notes after entry", "Remove a placed digit from peer notes.", preferences.cleanCandidates)}${toggle("showMistakes", "Show conflicts with solution", "Add a symbol and outline; never rely on colour alone.", preferences.showMistakes)}</div>
      <div class="card settings-card"><span class="eyebrow">Backup</span><h2>Your device data</h2><p>Browser storage can be cleared or evicted. Cloud sync keeps signed-in sessions current across devices; JSON export remains the independent backup and the only backup for device-only play.</p><div class="stack-actions"><button id="export" class="secondary">Download JSON backup</button><label class="file-button">Import JSON backup<input type="file" id="backup-file" accept="application/json" /></label><button id="reset-current" class="danger-quiet">Reset current puzzle</button><button id="reset-history" class="danger-quiet">Clear completed history</button><button id="reset-all" class="danger-quiet">Erase all local STrack data</button></div><p class="storage-note">Local reset actions do not delete signed-in cloud copies; sign out first if you want a blank device-only workspace.</p></div>
      <div class="card settings-card"><span class="eyebrow">Help</span><h2>How STrack works</h2><button id="open-help" class="secondary">Open user guide</button><p class="storage-note"><strong>${navigator.onLine ? "Online" : "Offline"}.</strong> The app shell, catalogue, help, preferences, solver, and saved progress work without a connection after the first production load.</p></div>
    </section>`, "Settings & help");
  app.querySelector<HTMLSelectElement>("#theme")!.addEventListener("change", async (event) => { preferences.theme = (event.target as HTMLSelectElement).value as Theme; applyTheme(); await store.saveSettings(); });
  app.querySelectorAll<HTMLInputElement>("[data-preference]").forEach((input) => input.addEventListener("change", async () => { (preferences as unknown as Record<string, boolean>)[input.dataset.preference!] = input.checked; await store.saveSettings(); }));
  app.querySelector("#sign-out")?.addEventListener("click", async () => { await signOutAccount(); notify("Signed out; device data remains available"); });
  app.querySelector("#retry-sync")?.addEventListener("click", () => cloud.uploadLocal());
  const accountForm = app.querySelector<HTMLFormElement>("#account-form");
  accountForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const feedback = app.querySelector<HTMLParagraphElement>("#account-feedback")!;
    const submitter = (event as SubmitEvent).submitter as HTMLElement | null;
    feedback.textContent = submitter?.dataset.create ? "Creating your private sync account…" : "Signing in…";
    try {
      await signInAccount(app.querySelector<HTMLInputElement>("#account-email")!.value.trim(), app.querySelector<HTMLInputElement>("#account-password")!.value, submitter?.dataset.create === "true");
      feedback.textContent = "Connected. Merging this device with your cloud sessions…";
    } catch (error) { feedback.textContent = accountError(error); feedback.className = "error"; }
  });
  app.querySelector("#reset-password")?.addEventListener("click", async () => {
    const email = app.querySelector<HTMLInputElement>("#account-email")!.value.trim();
    const feedback = app.querySelector<HTMLParagraphElement>("#account-feedback")!;
    if (!email) return void (feedback.textContent = "Enter your email address first.");
    try { await sendReset(email); feedback.textContent = "Password reset email sent."; }
    catch (error) { feedback.textContent = accountError(error); feedback.className = "error"; }
  });
  app.querySelector("#open-help")!.addEventListener("click", showHelp);
  app.querySelector("#export")!.addEventListener("click", () => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `strack-backup-${new Date().toISOString().slice(0,10)}.json`; link.click(); URL.revokeObjectURL(link.href);
  });
  app.querySelector<HTMLInputElement>("#backup-file")!.addEventListener("change", async (event) => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    try { const result = await store.importJson(await file.text()); notify(`Imported ${result.added}; kept ${result.skipped} existing`); }
    catch (error) { notify(error instanceof Error ? error.message : "Import failed"); }
  });
  app.querySelector("#reset-current")!.addEventListener("click", () => confirmReset("current", "Reset the current puzzle and its notes?"));
  app.querySelector("#reset-history")!.addEventListener("click", () => confirmReset("history", "Clear completed puzzle history?"));
  app.querySelector("#reset-all")!.addEventListener("click", () => confirmReset("all", "Erase all STrack data on this device? This cannot be undone."));
}

function toggle(key: string, title: string, detail: string, checked: boolean) {
  return `<label class="toggle"><span><strong>${title}</strong><small>${detail}</small></span><input type="checkbox" role="switch" data-preference="${key}" ${checked ? "checked" : ""} /></label>`;
}

function confirmReset(scope: "current" | "history" | "all", message: string) {
  showDialog(`<h2>Confirm data reset</h2><p>${escapeHtml(message)}</p><button class="danger" id="confirm-reset">Confirm reset</button>`, "Cancel");
  dialog.querySelector("#confirm-reset")!.addEventListener("click", async () => { await store.clear(scope); dialog.close(); notify("Local data updated"); renderSettings(); });
}

function showDialog(content: string, closeLabel = "Done") {
  dialog.innerHTML = `<div class="dialog-content">${content}<button class="dialog-close secondary">${closeLabel}</button></div>`;
  dialog.querySelector(".dialog-close")!.addEventListener("click", () => dialog.close());
  dialog.showModal();
}

function showHelp() {
  showDialog(`<span class="eyebrow">User guide</span><h2>Solving with STrack</h2><h3>Entering digits and notes</h3><p>Select one cell or turn on Multi-select. Digit writes an answer; Corner is for Snyder marks; Centre is for candidate lists. Colour applies one of six shades and a visible dot, so meaning never depends on colour alone.</p><h3>Keyboard</h3><p>Arrow keys move. Shift + arrows extends the selection. Press 1–9 to enter, Backspace/Delete to clear, C for corner, M for centre, V for colour, and Ctrl/⌘ Z or Y for undo/redo.</p><h3>Hints</h3><p>Hint first identifies evidence and names the technique. Read the explanation, then choose Apply deduction. Revealing a solution value is a separate fallback action.</p><h3>Difficulty</h3><p>SE values come from SukakuExplainer and describe the hardest logical technique on its selected path. Easy, Medium, Hard, and Diabolical are STrack’s friendly bands, not an official universal scale. Diabolical puzzles can outgrow the local hint engine.</p><h3>Offline, sync, and privacy</h3><p>The production PWA caches its shell, bundled 80-puzzle catalogue, help, and solver. Progress always saves to IndexedDB first. Optional email/password accounts sync private puzzle sessions and preferences through Firestore so you can continue on another device. Core play never requires a connection, and there are no analytics or ads. Keep JSON exports as an independent backup.</p>`, "Got it");
}

function accountError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  if (code.includes("invalid-credential")) return "Email or password is incorrect.";
  if (code.includes("email-already-in-use")) return "That email already has an account. Choose Sign in.";
  if (code.includes("weak-password")) return "Use a password with at least six characters.";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a moment and try again.";
  return "Cloud access failed. Your device data is safe; check the connection and try again.";
}

function render() {
  applyTheme();
  if (view === "home") renderHome();
  else if (view === "library") renderLibrary();
  else if (view === "player") renderPlayer();
  else if (view === "import") renderImport();
  else renderSettings();
}

document.addEventListener("keydown", async (event) => {
  if (view !== "player" || dialog.open || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement).tagName)) return;
  const game = store.activeGame(); if (!game || game.paused) return;
  const mod = event.metaKey || event.ctrlKey;
  if (mod && event.key.toLowerCase() === "z") { event.preventDefault(); await changeGame(game, () => event.shiftKey ? redo(game) : undo(game)); }
  else if (mod && event.key.toLowerCase() === "y") { event.preventDefault(); await changeGame(game, () => redo(game)); }
  else if (/^[1-9]$/.test(event.key)) { event.preventDefault(); await changeGame(game, () => enterDigit(game, Number(event.key), store.data.preferences.cleanCandidates)); }
  else if (["Backspace", "Delete", "0"].includes(event.key)) { event.preventDefault(); await changeGame(game, () => clearSelected(game)); }
  else if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(game, -1, 0, event.shiftKey); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(game, 1, 0, event.shiftKey); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(game, 0, -1, event.shiftKey); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(game, 0, 1, event.shiftKey); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "c") { setMode(game, "corner"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "m") { setMode(game, "centre"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "v") { setMode(game, "colour"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "n") { setMode(game, "normal"); await store.putGame(game); renderPlayer(); }
});

setInterval(async () => {
  const game = store.activeGame();
  if (view !== "player" || !game || game.paused || game.completedAt || document.hidden) return;
  game.elapsed++;
  const timer = document.querySelector("#timer"); if (timer) timer.textContent = formatTime(game.elapsed);
  if (++timerSaveCounter % 10 === 0) await store.putGame(game);
}, 1000);

addEventListener("online", render);
addEventListener("offline", render);

async function boot() {
  await store.load();
  store.onGameSaved = (game) => { void cloud.syncGame(game); };
  store.onSettingsSaved = () => { void cloud.syncSettings(); };
  applyTheme();
  if (new URLSearchParams(location.search).has("p")) view = "import";
  render();
  watchAuth(async (user) => {
    cloudUser = user;
    await cloud.setUser(user);
    render();
  });
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    try { await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`); }
    catch { notify("Offline installation will retry on the next visit."); }
  }
}

void boot();
