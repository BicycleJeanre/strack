import "./style.css";
import catalogueJson from "./data/puzzles.json";
import { challengePeriodKey, challengeSet, type ChallengeCadence } from "./challenges.ts";
import { CloudSync, cloudConfigured, sendReset, signInAccount, signOutAccount, watchAuth, type CloudUser } from "./cloud.ts";
import { applyColour, applyHint, clearColours, clearLines, clearSelected, createGame, digitIsComplete, enterDigit, fillAllCandidates, moveSelection, redo, selectCell, setMode, toggleLine, undo } from "./game.ts";
import { candidateList, cellLabel, findHint, normalizePuzzle, peers, validatePuzzle } from "./sudoku.ts";
import { Store } from "./store.ts";
import { deductionMatches, findTrainingPosition, patternCells, patternMatches, TRAINING_ROADMAP, TRAINING_TECHNIQUES, trainingTechnique, type TrainingPosition } from "./training.ts";
import type { AnnotationColour, Difficulty, EntryMode, Game, Hint, Puzzle, Theme, TrainingTechniqueId } from "./types.ts";

const catalogue = catalogueJson as Puzzle[];
const store = new Store();
const app = document.querySelector<HTMLDivElement>("#app")!;
const dialog = document.querySelector<HTMLDialogElement>("#dialog")!;
const toast = document.querySelector<HTMLDivElement>("#toast")!;
type View = "home" | "training" | "library" | "player" | "import" | "settings";
let view: View = "home";
let viewBeforeSettings: Exclude<View, "settings"> = "home";
let libraryBand: Difficulty | "All" = "All";
let libraryCompletion: "all" | "new" | "started" | "complete" = "all";
let minRating = "";
let maxRating = "";
let multiSelect = false;
let highlightMode = false;
let activeHint: Hint | null = null;
let revealedHintId: string | null = null;
let timerSaveCounter = 0;
let cloudUser: CloudUser | null = null;
let suppressCellClick = false;
let celebratingGameId: string | null = null;
let celebrationTimer: number | null = null;
let activeAnnotationColour: AnnotationColour = "cyan";
let activeTraining: TrainingTechniqueId | null = null;
let trainingStage: "learn" | "find" | "deduce" | "complete" = "learn";
let trainingSelection = new Set<number>();
let trainingFeedback = "";
let trainingAssisted = false;
let trainingPatternRevealed = false;
let trainingAnswerRevealed = false;
type TrainingTrackId = typeof TRAINING_ROADMAP[number]["id"];
let trainingTrack: TrainingTrackId | null = null;
let challengeCadence: ChallengeCadence = "daily";
const highlightedDigits = new Set<number>();
const annotationColours: AnnotationColour[] = ["cyan", "amber", "violet", "green", "rose", "slate", "lime", "orange", "indigo"];
const cloud = new CloudSync(store, () => {
  document.querySelectorAll<HTMLElement>("[data-cloud-status]").forEach((element) => { element.textContent = cloud.status(); });
  if (["home", "training", "library", "settings"].includes(view) && app.querySelector("main")) render();
});

const escapeHtml = (value: unknown) => String(value).replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
const formatTime = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function highlightOnly(digit: number | null) {
  highlightedDigits.clear();
  if (digit) highlightedDigits.add(digit);
}

function toggleHighlight(digit: number) {
  if (highlightedDigits.has(digit)) highlightedDigits.delete(digit);
  else highlightedDigits.add(digit);
}

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
        <button data-nav="training" class="${view === "training" ? "active" : ""}">Train</button>
        <button data-nav="library" class="${view === "library" ? "active" : ""}">Puzzles</button>
        <button data-nav="import" class="${view === "import" ? "active" : ""}">Open</button>
        <button data-nav="settings" class="${view === "settings" ? "active" : ""}" aria-label="${view === "settings" ? "Close settings and help" : "Settings and help"}" aria-pressed="${view === "settings"}">•••</button>
      </nav>
    </header>
    <main id="main" class="${view === "player" ? "player-main" : ""}" tabindex="-1">
      <div class="page-heading"><div><span class="eyebrow">${online ? "Ready offline" : "Offline"}</span><h1>${escapeHtml(title)}</h1></div></div>
      ${content}
    </main>`;
  bindNavigation();
}

function bindNavigation() {
  app.querySelectorAll<HTMLElement>("[data-nav]").forEach((button) => button.addEventListener("click", () => navigate(button.dataset.nav as View)));
}

function navigate(next: View) {
  if (next === "settings") {
    if (view === "settings") next = viewBeforeSettings;
    else viewBeforeSettings = view;
  }
  view = next;
  activeHint = null;
  revealedHintId = null;
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
  const games = Object.values(store.data.games).sort((a, b) => b.updatedAt - a.updatedAt);
  const recent = games.filter((game) => !game.completedAt).slice(0, 4);
  const completed = games.filter((game) => game.completedAt).slice(0, 4);
  const challenges = challengeSet(catalogue, challengeCadence);
  const periodKey = challengePeriodKey(challengeCadence);
  const periodLabel = challengeCadence === "daily"
    ? new Intl.DateTimeFormat(undefined, { dateStyle: "long", timeZone: "UTC" }).format(new Date())
    : `ISO week ${Number(periodKey.slice(-2))}, ${periodKey.slice(0, 4)}`;
  const challengeStatus = (puzzle: Puzzle) => {
    const matching = games.filter((game) => game.puzzle.id === puzzle.id);
    const current = matching.find((game) => !game.completedAt) || matching.find((game) => game.completedAt);
    if (!current) return "Not started";
    if (current.completedAt) return `Completed · ${formatTime(current.elapsed)}`;
    return `Continue · ${Math.round(current.values.filter(Boolean).length / 81 * 100)}% filled`;
  };
  const gameCards = (items: Game[], complete = false) => items.map((game) => `<article class="recent-card"><button class="recent-open" data-game="${game.id}" aria-label="${complete ? "Review" : "Open"} ${escapeHtml(game.puzzle.difficulty)} puzzle"><span>${metaPill(game.puzzle)}</span><strong>${complete ? `Completed · ${formatTime(game.elapsed)}` : `${Math.round(game.values.filter(Boolean).length / 81 * 100)}% filled`}</strong><small>${new Date(game.updatedAt).toLocaleDateString()}</small></button><button class="recent-delete" data-delete-game="${game.id}" aria-label="Delete ${complete ? "completed" : "recent"} ${escapeHtml(game.puzzle.difficulty)} puzzle">×</button></article>`).join("");
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
    <section class="challenge-section" aria-labelledby="challenge-title"><div class="section-heading challenge-heading"><div><span class="eyebrow">${escapeHtml(periodLabel)} · UTC</span><h2 id="challenge-title">${challengeCadence === "daily" ? "Daily" : "Weekly"} challenges</h2></div><div class="challenge-tabs" role="group" aria-label="Challenge schedule"><button data-challenge-cadence="daily" aria-pressed="${challengeCadence === "daily"}">Today</button><button data-challenge-cadence="weekly" aria-pressed="${challengeCadence === "weekly"}">This week</button></div></div>
      <p class="challenge-intro">One shared offline puzzle at every difficulty. Return on any signed-in device to continue the same saved grid.</p>
      <div class="challenge-grid">${challenges.map((puzzle) => {
        const status = puzzleStatus(puzzle);
        return `<button class="challenge-card card ${status}" data-challenge-puzzle="${puzzle.id}" aria-label="${escapeHtml(puzzle.difficulty)} ${challengeCadence} challenge, ${challengeStatus(puzzle)}"><span class="challenge-calendar" aria-hidden="true"><i>${challengeCadence === "daily" ? "DAY" : "WK"}</i><b>${challengeCadence === "daily" ? periodKey.slice(-2) : Number(periodKey.slice(-2))}</b></span><span><span>${metaPill(puzzle)}</span><strong>${escapeHtml(puzzle.difficulty)} challenge</strong><small>${challengeStatus(puzzle)}</small></span><span class="challenge-arrow" aria-hidden="true">→</span></button>`;
      }).join("")}</div>
    </section>
    <section class="training-callout card" aria-labelledby="training-home-title"><div><span class="eyebrow">Technique training</span><h2 id="training-home-title">Learn the logic, not the answer</h2><p>Short guided lessons use real puzzle positions and focused candidate diagrams to build pattern recognition. Your progress works offline and syncs when you sign in.</p></div><button class="primary compact" data-nav="training">Start training</button></section>
    <section aria-labelledby="recent-title"><div class="section-heading"><div><span class="eyebrow">On this device</span><h2 id="recent-title">Recent puzzles</h2></div></div>
      ${recent.length ? `<div class="recent-list">${gameCards(recent)}</div>` : `<div class="empty card"><span aria-hidden="true">⌁</span><h3>No puzzles in progress</h3><p>Start a puzzle and it will appear here.</p></div>`}
    </section>
    <section class="completed-section" aria-labelledby="completed-title"><div class="section-heading"><div><span class="eyebrow">Finished</span><h2 id="completed-title">Completed puzzles</h2></div></div>
      ${completed.length ? `<div class="recent-list">${gameCards(completed, true)}</div>` : `<div class="empty card"><span aria-hidden="true">✓</span><h3>No completed puzzles yet</h3><p>Finished puzzles are kept separate from games in progress.</p></div>`}
    </section>`, `Good ${new Date().getHours() < 12 ? "morning" : new Date().getHours() < 18 ? "afternoon" : "evening"}`);
  app.querySelector("#resume")?.addEventListener("click", () => { view = "player"; render(); });
  app.querySelector("#quick-start")?.addEventListener("click", () => startPuzzle(pickPuzzle("Easy")));
  app.querySelectorAll<HTMLElement>("[data-band]").forEach((button) => button.addEventListener("click", () => startPuzzle(pickPuzzle(button.dataset.band as Difficulty))));
  app.querySelectorAll<HTMLElement>("[data-challenge-cadence]").forEach((button) => button.addEventListener("click", () => { challengeCadence = button.dataset.challengeCadence as ChallengeCadence; renderHome(); }));
  app.querySelectorAll<HTMLElement>("[data-challenge-puzzle]").forEach((button) => button.addEventListener("click", () => openChallenge(button.dataset.challengePuzzle!)));
  app.querySelectorAll<HTMLElement>("[data-game]").forEach((button) => button.addEventListener("click", async () => { store.data.activeGameId = button.dataset.game!; await store.saveSettings(); view = "player"; render(); }));
  app.querySelectorAll<HTMLElement>("[data-delete-game]").forEach((button) => button.addEventListener("click", () => confirmDeleteGame(button.dataset.deleteGame!)));
}

async function openChallenge(puzzleId: string) {
  const puzzle = catalogue.find((item) => item.id === puzzleId);
  if (!puzzle) return;
  const existing = Object.values(store.data.games)
    .filter((game) => game.puzzle.id === puzzle.id)
    .sort((left, right) => Number(Boolean(left.completedAt)) - Number(Boolean(right.completedAt)) || right.updatedAt - left.updatedAt)[0];
  if (!existing) return startPuzzle(puzzle);
  store.data.activeGameId = existing.id;
  highlightMode = false;
  highlightOnly(Number(existing.values[existing.anchor]) || null);
  await store.saveSettings();
  view = "player";
  render();
}

function trainingStatus(id: TrainingTechniqueId) {
  const progress = store.data.trainingProgress[id];
  if (progress?.mastered) return "Mastered";
  if (progress?.completed) return `${progress.completed} completed`;
  return "Not started";
}

function renderTrainingHub(scrollToLessons = false) {
  const mastered = TRAINING_TECHNIQUES.filter((technique) => store.data.trainingProgress[technique.id]?.mastered).length;
  const completed = TRAINING_TECHNIQUES.filter((technique) => store.data.trainingProgress[technique.id]?.completed).length;
  const selectedTrack = TRAINING_ROADMAP.find((track) => track.id === trainingTrack);
  const visibleTechniques = selectedTrack ? TRAINING_TECHNIQUES.filter((technique) => (selectedTrack.families as readonly string[]).includes(technique.family)) : TRAINING_TECHNIQUES;
  const recommended = visibleTechniques.find((technique) => !store.data.trainingProgress[technique.id]?.mastered) || visibleTechniques[0];
  shell(`
    <section class="training-hero card"><div><span class="eyebrow">Guided curriculum</span><h2>From your first single to forcing chains.</h2><p>Each lesson shows the idea, asks you to find it in an offline puzzle position or focused candidate diagram, then makes you choose the deduction yourself.</p></div><div class="training-progress" aria-label="Training progress"><strong>${mastered}/${TRAINING_TECHNIQUES.length}</strong><span>mastered · ${completed} explored</span></div></section>
    <section class="training-next card"><div><span class="eyebrow">Recommended next</span><h2>${escapeHtml(recommended.title)}</h2><p>${escapeHtml(recommended.concept)}</p></div><button class="primary compact" data-training="${recommended.id}">${store.data.trainingProgress[recommended.id]?.completed ? "Practice again" : "Begin lesson"}</button></section>
    <section aria-labelledby="lessons-title"><div class="section-heading"><div><span class="eyebrow" aria-live="polite">${visibleTechniques.length} of ${TRAINING_TECHNIQUES.length} available offline</span><h2 id="lessons-title">${selectedTrack ? escapeHtml(selectedTrack.title) : "Technique"} lessons</h2></div>${selectedTrack ? `<button class="text-button" id="clear-training-track">Show all techniques</button>` : ""}</div><div class="lesson-grid">${visibleTechniques.map((technique) => {
      const progress = store.data.trainingProgress[technique.id];
      return `<button class="lesson-card card ${progress?.mastered ? "mastered" : ""}" data-training="${technique.id}"><span class="lesson-level">${technique.level}</span><span><small>${escapeHtml(technique.family)}</small><strong>${escapeHtml(technique.title)}</strong><em>${trainingStatus(technique.id)}</em></span><span aria-hidden="true">→</span></button>`;
    }).join("")}</div></section>
    <section aria-labelledby="roadmap-title"><div class="section-heading"><div><span class="eyebrow">Curriculum filters</span><h2 id="roadmap-title">Choose a technique family</h2></div>${selectedTrack ? `<button class="text-button" data-clear-training-track>Show all</button>` : ""}</div><div class="roadmap-grid">${TRAINING_ROADMAP.map((track) => `<button class="roadmap-card card ${trainingTrack === track.id ? "active" : ""}" data-training-track="${track.id}" aria-pressed="${trainingTrack === track.id}"><span>${trainingTrack === track.id ? "Showing" : "Filter lessons"}</span><h3>${escapeHtml(track.title)}</h3><p>${escapeHtml(track.detail)}</p></button>`).join("")}</div></section>`, "Training");
  app.querySelectorAll<HTMLElement>("[data-training]").forEach((button) => button.addEventListener("click", () => openTraining(button.dataset.training as TrainingTechniqueId)));
  app.querySelectorAll<HTMLElement>("[data-training-track]").forEach((button) => button.addEventListener("click", () => {
    const next = button.dataset.trainingTrack as TrainingTrackId;
    trainingTrack = trainingTrack === next ? null : next;
    renderTrainingHub(true);
  }));
  app.querySelectorAll<HTMLElement>("#clear-training-track, [data-clear-training-track]").forEach((button) => button.addEventListener("click", () => { trainingTrack = null; renderTrainingHub(true); }));
  if (scrollToLessons) requestAnimationFrame(() => document.querySelector("#lessons-title")?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" }));
}

function openTraining(id: TrainingTechniqueId) {
  activeTraining = id;
  trainingStage = "learn";
  trainingSelection = new Set();
  trainingFeedback = "";
  trainingAssisted = false;
  trainingPatternRevealed = false;
  trainingAnswerRevealed = false;
  renderTrainingLesson();
}

function trainingBoard(position: TrainingPosition, stage: typeof trainingStage, reveal = false) {
  const focus = new Set(patternCells(position));
  const evidence = new Set(position.hint.evidence);
  const targets = new Set(position.hint.targets.map((target) => `${target.cell}-${target.digit}`));
  const showPattern = stage === "learn" || reveal;
  const linked = showPattern && activeTraining && ["simple-coloring", "x-chain", "xy-chain", "aic"].includes(activeTraining);
  const links = linked ? position.hint.evidence.slice(1).map((to, index) => {
    const from = position.hint.evidence[index];
    return `<line class="training-link ${index % 2 && activeTraining !== "simple-coloring" ? "weak" : "strong"}" x1="${from % 9 * 100 + 50}" y1="${Math.floor(from / 9) * 100 + 50}" x2="${to % 9 * 100 + 50}" y2="${Math.floor(to / 9) * 100 + 50}"></line>`;
  }).join("") : "";
  return `<div class="training-board sudoku-board" role="grid" aria-label="Training Sudoku grid">${position.values.map((value, cell) => {
    const given = position.puzzle ? position.puzzle.givens[cell] !== "0" : false;
    const selected = trainingSelection.has(cell);
    const classes = ["training-cell", "sudoku-cell", !value && !position.candidates[cell].length ? "training-irrelevant" : "", value ? "has-value" : "", given ? "given" : "", selected ? "selected" : "", showPattern && evidence.has(cell) ? "training-evidence" : "", showPattern && focus.has(cell) ? "training-focus" : ""].filter(Boolean).join(" ");
    const candidates = position.candidates[cell];
    const content = value ? `<span class="cell-value">${value}</span>` : `<span class="training-candidates">${Array.from({ length: 9 }, (_, index) => index + 1).map((digit) => {
      if (!candidates.includes(digit)) return `<i aria-hidden="true"></i>`;
      const target = targets.has(`${cell}-${digit}`);
      const candidateClass = (stage === "learn" || stage === "deduce" && reveal) && target ? position.hint.kind === "place" ? "training-answer" : "training-elimination" : "";
      return stage === "deduce" ? `<button class="training-candidate ${candidateClass}" data-training-cell="${cell}" data-training-digit="${digit}" aria-label="Candidate ${digit}, ${cellLabel(cell)}">${digit}</button>` : `<i class="${candidateClass}">${digit}</i>`;
    }).join("")}</span>`;
    if (stage === "find" && !value) return `<button class="${classes}" data-training-select="${cell}" aria-label="${cellLabel(cell)}, empty" aria-pressed="${selected}">${content}</button>`;
    return `<div class="${classes}" aria-label="${cellLabel(cell)}${value ? `, ${value}` : ", empty"}">${content}</div>`;
  }).join("")}${links ? `<svg class="training-links" viewBox="0 0 900 900" aria-hidden="true">${links}</svg>` : ""}</div>`;
}

function renderTrainingLesson() {
  if (!activeTraining) return renderTrainingHub();
  const technique = trainingTechnique(activeTraining);
  const position = findTrainingPosition(activeTraining, catalogue);
  if (!position) { activeTraining = null; notify("That lesson position is unavailable"); return renderTrainingHub(); }
  const stageNumber = trainingStage === "learn" ? 1 : trainingStage === "find" ? 2 : trainingStage === "deduce" ? 3 : 4;
  const reveal = trainingStage === "find" ? trainingPatternRevealed : trainingStage === "deduce" ? trainingAnswerRevealed : false;
  let panel = "";
  if (trainingStage === "learn") panel = `<span class="eyebrow">Step 1 · Learn</span><h2>${escapeHtml(technique.title)}</h2><p class="lesson-concept">${escapeHtml(technique.concept)}</p><div class="lesson-explanation"><strong>In this position</strong><p>${escapeHtml(position.hint.summary)} ${escapeHtml(position.hint.explanation)}</p></div><button class="primary" id="training-practice">Practice this position</button>`;
  else if (trainingStage === "find") panel = `<span class="eyebrow">Step 2 · Find the pattern</span><h2>${escapeHtml(technique.findPrompt)}</h2><p>Tap cells to select or deselect them, then check your pattern.</p>${trainingFeedback ? `<p class="training-feedback" role="status">${escapeHtml(trainingFeedback)}</p>` : ""}<div class="stack-actions"><button class="primary" id="training-check-pattern">Check pattern</button><button class="secondary" id="training-clue">${reveal ? "Clue shown" : "Show a clue"}</button></div>`;
  else if (trainingStage === "deduce") panel = `<span class="eyebrow">Step 3 · Make the deduction</span><h2>${escapeHtml(technique.deductionPrompt)}</h2><p>Tap a candidate in the grid. ${position.hint.kind === "place" ? "A correct choice places it." : "A correct choice removes it."}</p>${trainingFeedback ? `<p class="training-feedback" role="status">${escapeHtml(trainingFeedback)}</p>` : ""}<button class="secondary" id="training-answer">${reveal ? "Answer shown" : "Show the answer"}</button>`;
  else panel = `<span class="eyebrow">Lesson complete</span><h2>You used ${escapeHtml(technique.title)}.</h2><p>${trainingAssisted ? "You completed the reasoning with guidance. Repeat it without a clue to build independent mastery." : "You found the pattern and made the deduction independently."}</p><div class="training-complete-mark" aria-hidden="true">✓</div><div class="stack-actions"><button class="primary" id="training-repeat">Practice again</button><button class="secondary" id="training-next">Next technique</button><button class="text-button" id="training-all">All lessons</button></div>`;
  shell(`<div class="lesson-toolbar"><button class="text-button" id="training-back">← All training</button><div class="lesson-steps" aria-label="Lesson progress">${[1,2,3,4].map((step) => `<i class="${step <= stageNumber ? "active" : ""}">${step}</i>`).join("")}</div></div><section class="lesson-player"><div>${trainingBoard(position, trainingStage, reveal)}</div><aside class="lesson-panel card">${panel}</aside></section><p class="training-source">${escapeHtml(position.origin)}${position.puzzle ? ` · ${escapeHtml(position.puzzle.difficulty)} · SE ${position.puzzle.seRating?.toFixed(1) ?? "unrated"}` : " · candidates outside the teaching pattern are intentionally omitted"}</p>`, `${technique.title} training`);
  app.querySelector("#training-back")?.addEventListener("click", () => { activeTraining = null; renderTrainingHub(); });
  app.querySelector("#training-practice")?.addEventListener("click", () => { trainingStage = "find"; trainingSelection.clear(); trainingFeedback = ""; renderTrainingLesson(); });
  app.querySelectorAll<HTMLElement>("[data-training-select]").forEach((cell) => cell.addEventListener("click", () => { const index = Number(cell.dataset.trainingSelect); if (trainingSelection.has(index)) trainingSelection.delete(index); else trainingSelection.add(index); trainingFeedback = ""; renderTrainingLesson(); }));
  app.querySelector("#training-clue")?.addEventListener("click", () => { trainingAssisted = true; trainingPatternRevealed = true; trainingFeedback = `Look for ${patternCells(position).length} highlighted ${patternCells(position).length === 1 ? "cell" : "cells"}.`; renderTrainingLesson(); });
  app.querySelector("#training-check-pattern")?.addEventListener("click", () => {
    if (!patternMatches(trainingSelection, position)) { trainingFeedback = "Not quite. Recheck the candidates and the unit they share."; return renderTrainingLesson(); }
    trainingStage = "deduce"; trainingFeedback = "Pattern found. Now make the logical deduction."; renderTrainingLesson();
  });
  app.querySelector("#training-answer")?.addEventListener("click", () => { trainingAssisted = true; trainingAnswerRevealed = true; trainingFeedback = "The correct candidate is emphasized in the grid."; renderTrainingLesson(); });
  app.querySelectorAll<HTMLElement>("[data-training-digit]").forEach((candidate) => candidate.addEventListener("click", async () => {
    if (!deductionMatches(Number(candidate.dataset.trainingCell), Number(candidate.dataset.trainingDigit), position)) { trainingFeedback = "That candidate is not justified by this pattern. Follow the highlighted cells through their shared unit."; return renderTrainingLesson(); }
    await completeTraining(activeTraining!);
  }));
  app.querySelector("#training-repeat")?.addEventListener("click", () => openTraining(activeTraining!));
  app.querySelector("#training-all")?.addEventListener("click", () => { activeTraining = null; renderTrainingHub(); });
  app.querySelector("#training-next")?.addEventListener("click", () => { const index = TRAINING_TECHNIQUES.findIndex((item) => item.id === activeTraining); openTraining(TRAINING_TECHNIQUES[(index + 1) % TRAINING_TECHNIQUES.length].id); });
}

async function completeTraining(id: TrainingTechniqueId) {
  const previous = store.data.trainingProgress[id] || { attempts: 0, correct: 0, completed: 0, mastered: false, lastPracticedAt: 0 };
  const attempts = previous.attempts + 1;
  const correct = previous.correct + (trainingAssisted ? 0 : 1);
  const completed = previous.completed + 1;
  store.data.trainingProgress[id] = { attempts, correct, completed, mastered: completed >= 3 && correct / attempts >= 2 / 3, lastPracticedAt: Date.now() };
  await store.saveSettings();
  trainingStage = "complete";
  trainingFeedback = "";
  renderTrainingLesson();
}

function confirmDeleteGame(id: string) {
  const game = store.data.games[id];
  if (!game) return;
  showDialog(`<h2>Delete puzzle?</h2><p>Remove this ${escapeHtml(game.puzzle.difficulty)} puzzle and its saved values, notes, colours, lines, and history${cloudUser ? " from your synced devices" : " from this device"}?</p><button class="danger" id="confirm-delete-game">Delete puzzle</button>`, "Keep puzzle");
  dialog.querySelector("#confirm-delete-game")!.addEventListener("click", async () => {
    await store.removeGame(id);
    const synced = await cloud.deleteGame(id);
    dialog.close();
    notify(synced ? "Puzzle deleted" : "Deleted here; cloud deletion will retry");
    renderHome();
  });
}

function pickPuzzle(band: Difficulty): Puzzle {
  const candidates = catalogue.filter((puzzle) => puzzle.difficulty === band && puzzleStatus(puzzle) === "new");
  const pool = candidates.length ? candidates : catalogue.filter((puzzle) => puzzle.difficulty === band);
  const seed = [...new Date().toISOString().slice(0, 10)].reduce((total, char) => total + char.charCodeAt(0), 0) + Object.keys(store.data.games).length;
  return pool[seed % pool.length];
}

async function startPuzzle(puzzle: Puzzle) {
  const existing = Object.values(store.data.games).find((game) => game.puzzle.id === puzzle.id && !game.completedAt);
  const game = existing || createGame(puzzle);
  highlightMode = false;
  celebratingGameId = null;
  highlightOnly(Number(game.values[game.anchor]) || null);
  await store.putGame(game);
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

function cellMarkup(game: Game, cell: number, hint: Hint | null, answerShown: boolean): string {
  const value = game.values[cell];
  const given = game.puzzle.givens[cell] !== "0";
  const selected = game.selected.includes(cell);
  const noteDigit = (digit: number) => `<i${store.data.preferences.highlightMatches && highlightedDigits.has(digit) ? ` class="note-match"` : ""}>${digit}</i>`;
  const cellColours = game.colours[cell];
  const hintFocus = hint?.targets.some((target) => target.cell === cell);
  const classes = ["sudoku-cell", given ? "given" : "", value ? "has-value" : "", game.corner[cell].length ? "has-corner" : "", game.centre[cell].length ? "has-centre" : "", cellColours.length ? "has-colours" : "", selected ? "selected" : "", !selected && store.data.preferences.highlightPeers && game.selected.some((chosen) => game.values[chosen] && peers[chosen].includes(cell)) ? "peer" : "", store.data.preferences.highlightMatches && value && highlightedDigits.has(Number(value)) ? "match" : "", store.data.preferences.showMistakes && value && value !== game.puzzle.solution[cell] ? "mistake" : "", hint?.evidence.includes(cell) ? "hint-evidence" : "", hintFocus ? answerShown ? "hint-target" : "hint-focus" : ""].filter(Boolean).join(" ");
  let content = cellColours.length ? `<span class="cell-colours" style="--colour-count:${cellColours.length}" aria-hidden="true">${cellColours.map((colour) => `<i class="colour-${colour}"></i>`).join("")}</span>` : "";
  if (value) content = `<span class="cell-value">${value}</span>`;
  if (game.corner[cell].length) content += `<span class="corner-marks">${game.corner[cell].map(noteDigit).join("")}</span>`;
  if (game.centre[cell].length) content += `<span class="centre-marks">${game.centre[cell].map(noteDigit).join("")}</span>`;
  if (!value && !game.corner[cell].length && !game.centre[cell].length && store.data.preferences.autoCandidates) { const candidates = candidateList(game.values, cell, game.eliminated); content = `<span class="centre-marks auto">${candidates.map(noteDigit).join("")}</span>`; }
  const noteLabel = `${game.corner[cell].length ? `, corner notes ${game.corner[cell].join(" ")}` : ""}${game.centre[cell].length ? `, centre notes ${game.centre[cell].join(" ")}` : ""}`;
  const colourLabel = cellColours.length ? `, colours ${cellColours.join(", ")}` : "";
  const lineLabel = game.lines.filter((line) => line.from === cell || line.to === cell).map((line) => `${line.colour} line to ${cellLabel(line.from === cell ? line.to : line.from)}`).join(", ");
  return `<button class="${classes}" data-cell="${cell}" aria-label="${cellLabel(cell)}${value ? `, ${given ? "given " : ""}${value}` : ", empty"}${noteLabel}${colourLabel}${lineLabel ? `, ${lineLabel}` : ""}" aria-pressed="${selected}">${content}<span class="colour-cues" aria-hidden="true">${cellColours.map((colour) => `<i class="colour-${colour}"></i>`).join("")}</span></button>`;
}

function lineMarkup(game: Game) {
  const point = (cell: number) => ({ x: cell % 9 * 100 + 50, y: Math.floor(cell / 9) * 100 + 50 });
  return `<svg class="annotation-lines" viewBox="0 0 900 900" preserveAspectRatio="none" aria-hidden="true">${game.lines.map((line) => {
    const from = point(line.from); const to = point(line.to);
    return `<line class="annotation-line colour-${line.colour}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}"></line>`;
  }).join("")}<line class="annotation-line preview colour-${activeAnnotationColour}" data-line-preview hidden></line></svg>`;
}

function annotationPalette(game: Game) {
  const lineMode = game.mode === "line";
  return `<div class="colour-pad" aria-label="${lineMode ? "Line colours" : "Cell colours"}">${annotationColours.map((colour) => {
    const active = lineMode ? activeAnnotationColour === colour : game.selected.length > 0 && game.selected.every((cell) => game.colours[cell].includes(colour));
    return `<button data-colour="${colour}" class="colour-${colour} ${active ? "active" : ""}" aria-pressed="${active}" aria-label="${lineMode ? "Use" : "Toggle"} ${colour} ${lineMode ? "line" : "cell"} colour"><span></span><small>${colour}</small></button>`;
  }).join("")}</div>${lineMode
    ? `<div class="line-actions"><button id="connect-cells" class="secondary" ${game.selected.length === 2 ? "" : "disabled"}>Connect selected cells</button><button id="clear-lines" class="secondary" ${game.lines.length ? "" : "disabled"}>Clear all lines</button></div><p class="annotation-guide">Drag from one cell to another, or select exactly two cells and connect them. Drawing the same colour again removes the line.</p>`
    : `<button id="clear-colours" class="secondary candidate-action" ${game.selected.some((cell) => game.colours[cell].length) ? "" : "disabled"}>Clear selected cell colours</button>`}`;
}

function recordedHint(game: Game, id: string | null) {
  return id ? [...game.hintHistory].reverse().find((hint) => hint.id === id) || null : null;
}

function hintAnswer(hint: Hint) {
  const action = hint.kind === "place" ? "Place" : "Remove";
  const joiner = hint.kind === "place" ? " in " : " from ";
  return hint.targets.map((target) => `${action} ${target.digit}${joiner}${cellLabel(target.cell)}`).join("; ") + ".";
}

function hintPreview(hint: Hint) {
  if (hint.technique === "Naked single") return { summary: "One focus cell has only one possible candidate.", explanation: "Use the placed digits in its row, column, and box to rule out the other candidates." };
  if (hint.technique === "Hidden single") return { summary: "One candidate has only one possible home in a unit.", explanation: "Compare the highlighted unit with the intersecting rows, columns, and boxes to find which candidate is blocked everywhere else." };
  if (hint.technique === "Locked candidates") return { summary: "A candidate is confined to one line inside a box.", explanation: "When every possible position for a candidate in a box lies on the same row or column, look for that candidate elsewhere on the line." };
  if (hint.technique === "Naked pair") return { summary: "Two highlighted cells confine the same two candidates.", explanation: "Those candidates must occupy the highlighted cells, so inspect the other cells in the unit for a deduction." };
  if (hint.technique === "Naked triple") return { summary: "Three highlighted cells confine the same three candidates.", explanation: "Those candidates must occupy the highlighted cells, so inspect the other cells in the unit for a deduction." };
  if (hint.technique === "X-Wing") return { summary: "A candidate forms the same two-column pattern across two rows.", explanation: "Compare the four highlighted corners and consider where that candidate can still appear in the intersecting columns." };
  return { summary: "The highlighted cells contain a logical next step.", explanation: "Review their candidates and shared units before revealing the exact deduction." };
}

function showHintHistory(game: Game) {
  const items = [...game.hintHistory].reverse();
  showDialog(`<span class="eyebrow">Puzzle notebook</span><h2>Previous hints</h2>${items.length ? `<div class="hint-history">${items.map((hint) => {
    const outcome = hint.applied ? "Applied" : hint.dismissed ? "Dismissed" : hint.answerShown ? "Answer viewed" : "Viewed";
    const preview = hintPreview(hint);
    return `<article><div><strong>${escapeHtml(hint.technique)}</strong><small>${escapeHtml(outcome)} · ${escapeHtml(new Date(hint.viewedAt).toLocaleString())}</small></div><h3>${escapeHtml(preview.summary)}</h3><p>${escapeHtml(preview.explanation)}</p><details><summary>Show answer</summary><p class="hint-answer">${escapeHtml(hintAnswer(hint))}</p></details></article>`;
  }).join("")}</div>` : `<p>No hints have been viewed for this puzzle yet.</p>`}`, "Close history");
}

function renderPlayer() {
  const game = store.activeGame();
  if (!game) { view = "home"; return renderHome(); }
  if (game.hintStage === "preview") activeHint = recordedHint(game, game.hintId) || findHint(game.values, game.eliminated);
  else activeHint = null;
  const activeRecord = activeHint ? recordedHint(game, activeHint.id) : null;
  const answerShown = activeHint?.id === revealedHintId;
  const preview = activeHint ? hintPreview(activeHint) : null;
  const wrong = game.values.some((value, cell) => value && value !== game.puzzle.solution[cell]);
  const celebrating = celebratingGameId === game.id && Boolean(game.completedAt);
  shell(`
    <section class="player-meta"><button class="back-button" data-nav="home">← Home</button><div>${metaPill(game.puzzle)}</div><button class="info-button" id="puzzle-info" aria-label="Puzzle details">i</button></section>
    <section class="player-layout">
      <div class="board-column">
        <div class="board-status"><span id="timer" class="timer ${store.data.preferences.showTimer ? "" : "hidden"}">${formatTime(game.elapsed)}</span><span>${game.completedAt ? "Solved" : game.paused ? "Paused" : navigator.onLine ? "Saved on device" : "Saved · offline"}</span></div>
        <div class="sudoku-board ${game.mode === "line" ? "drawing-lines" : ""} ${game.paused && !game.completedAt ? "paused" : ""} ${celebrating ? "celebrating" : ""}" role="grid" aria-label="Sudoku board">${Array.from({ length: 81 }, (_, cell) => cellMarkup(game, cell, activeHint, answerShown)).join("")}${lineMarkup(game)}${game.paused && !game.completedAt ? `<button class="pause-cover" id="resume-board"><strong>Paused</strong><span>Tap to continue</span></button>` : ""}</div>
        ${celebrating ? `<div class="completion-confetti" aria-hidden="true">${Array.from({ length: 14 }, () => "<i></i>").join("")}</div>` : ""}
        ${game.completedAt ? `<div class="completion-banner ${celebrating ? "celebrating" : ""}" role="status"><span aria-hidden="true">★</span><div><strong>Puzzle complete!</strong><small>${game.puzzle.difficulty} · ${rating(game.puzzle)} · ${formatTime(game.elapsed)}</small></div><button id="next-puzzle">Next puzzle</button></div>` : ""}
      </div>
      <aside class="controls" aria-label="Puzzle controls">
        <div class="toolbar"><button id="undo" aria-label="Undo" ${!game.history.length ? "disabled" : ""}>↶<small>Undo</small></button><button id="redo" aria-label="Redo" ${!game.future.length ? "disabled" : ""}>↷<small>Redo</small></button><button id="pause" aria-label="${game.paused ? "Resume" : "Pause"} puzzle">${game.paused ? "▶" : "Ⅱ"}<small>${game.paused ? "Resume" : "Pause"}</small></button><button id="hint" aria-label="Get a logical hint">?<small>Hint</small></button></div>
        ${activeHint && preview ? `<div class="hint-panel" role="status"><span class="eyebrow">${escapeHtml(activeHint.technique)}</span><h3>${escapeHtml(preview.summary)}</h3><p>${escapeHtml(preview.explanation)}</p>${answerShown ? `<p class="hint-answer"><strong>Answer:</strong> ${escapeHtml(hintAnswer(activeHint))}</p>` : ""}<div class="actions">${answerShown ? `<button id="apply-hint" class="primary compact">Apply deduction</button>` : `<button id="show-hint-answer" class="secondary compact">Show answer</button>`}<button id="dismiss-hint" class="text-button">Dismiss hint</button></div></div>` : ""}
        ${game.hintHistory.length ? `<button id="hint-history" class="history-button">Previous hints (${game.hintHistory.length})</button>` : ""}
        ${wrong && !store.data.preferences.showMistakes ? `<p class="quiet-warning">Something on the board conflicts with the solution. Turn on mistake checks in Settings for cell-level cues.</p>` : ""}
        <div class="mode-switch" role="group" aria-label="Entry mode">${([['normal','Digit'],['corner','Corner'],['centre','Centre'],['colour','Colour'],['line','Lines']] as [EntryMode,string][]).map(([mode,label]) => `<button data-mode="${mode}" class="${game.mode === mode ? "active" : ""}" aria-pressed="${game.mode === mode}">${label}</button>`).join("")}</div>
        ${game.mode === "colour" || game.mode === "line" ? annotationPalette(game) : `<div class="number-pad" aria-label="Number pad">${[1,2,3,4,5,6,7,8,9].map((digit) => { const complete = digitIsComplete(game.values, digit); const active = highlightedDigits.has(digit); return `<button data-digit="${digit}" class="${active ? "active-digit " : ""}${complete ? "complete-digit" : ""}" aria-pressed="${active}" aria-label="${digit}${complete ? ", all placed" : ""}">${digit}</button>`; }).join("")}<button id="clear" class="clear-key">Clear</button></div><p class="highlight-guide ${highlightMode ? "" : "hidden"}">Highlight mode · tap several digits to compare them together.</p>`}
        <div class="selection-tools"><button id="multi" class="multi-toggle ${multiSelect ? "active" : ""}" aria-pressed="${multiSelect}"><span aria-hidden="true">▦</span> Multi-select ${multiSelect ? "on" : "off"}</button><button id="highlight-mode" class="multi-toggle ${highlightMode ? "active" : ""}" aria-label="Highlight multiple values" aria-pressed="${highlightMode}"><span aria-hidden="true">◎</span> Highlight values ${highlightMode ? "on" : "off"}</button></div>
        <button id="fill-candidates" class="secondary candidate-action">Calculate all candidates</button>
        <p class="control-help">Keyboard: arrows move · 1–9 enter · C corner · M centre · V colour · L lines · Shift extends selection · Ctrl/⌘ Z undo. Digit entry clears both note types. Highlight values lets number keys select several matches without editing cells.</p>
      </aside>
    </section>`, "Puzzle desk");
  bindPlayer(game);
}

function bindPlayer(game: Game) {
  bindCellDrag(game);
  app.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell) => cell.addEventListener("click", async (event) => {
    if (suppressCellClick) { event.preventDefault(); return; }
    highlightMode = false;
    selectCell(game, Number(cell.dataset.cell), multiSelect || (event as MouseEvent).shiftKey || (event as MouseEvent).metaKey || (event as MouseEvent).ctrlKey);
    highlightOnly(Number(game.values[game.anchor]) || null);
    game.updatedAt = Date.now();
    await store.putGame(game);
    renderPlayer();
  }));
  app.querySelectorAll<HTMLElement>("[data-mode]").forEach((button) => button.addEventListener("click", async () => { setMode(game, button.dataset.mode as EntryMode); await store.putGame(game); renderPlayer(); }));
  app.querySelectorAll<HTMLElement>("[data-digit]").forEach((button) => button.addEventListener("click", () => {
    const digit = Number(button.dataset.digit);
    if (highlightMode || !game.selected.length) { highlightMode = true; toggleHighlight(digit); renderPlayer(); return; }
    void changeGame(game, () => { highlightOnly(digit); enterDigit(game, digit, store.data.preferences.cleanCandidates); });
  }));
  app.querySelectorAll<HTMLElement>("[data-colour]").forEach((button) => button.addEventListener("click", () => {
    const colour = button.dataset.colour as AnnotationColour;
    activeAnnotationColour = colour;
    if (game.mode === "line") renderPlayer();
    else void changeGame(game, () => applyColour(game, colour));
  }));
  app.querySelector("#clear-colours")?.addEventListener("click", () => changeGame(game, () => clearColours(game)));
  app.querySelector("#connect-cells")?.addEventListener("click", () => {
    if (game.selected.length === 2) void changeGame(game, () => toggleLine(game, game.selected[0], game.selected[1], activeAnnotationColour));
  });
  app.querySelector("#clear-lines")?.addEventListener("click", () => changeGame(game, () => clearLines(game)));
  app.querySelector("#clear")?.addEventListener("click", () => {
    if (!game.selected.length) { highlightedDigits.clear(); renderPlayer(); return; }
    void changeGame(game, () => { highlightedDigits.clear(); clearSelected(game); });
  });
  app.querySelector("#undo")?.addEventListener("click", () => changeGame(game, () => undo(game)));
  app.querySelector("#redo")?.addEventListener("click", () => changeGame(game, () => redo(game)));
  app.querySelector("#multi")?.addEventListener("click", () => { multiSelect = !multiSelect; highlightMode = false; highlightedDigits.clear(); renderPlayer(); });
  app.querySelector("#highlight-mode")?.addEventListener("click", async () => {
    highlightMode = !highlightMode;
    multiSelect = false;
    highlightedDigits.clear();
    const hadSelection = game.selected.length > 0;
    game.selected = [];
    if (hadSelection) { game.updatedAt = Date.now(); await store.putGame(game); }
    renderPlayer();
  });
  app.querySelector("#fill-candidates")?.addEventListener("click", () => changeGame(game, () => { if (fillAllCandidates(game)) notify("Candidates calculated for every empty cell"); }));
  app.querySelector("#pause")?.addEventListener("click", () => changeGame(game, () => { game.paused = !game.paused; }));
  app.querySelector("#resume-board")?.addEventListener("click", () => changeGame(game, () => { game.paused = false; }));
  app.querySelector("#puzzle-info")?.addEventListener("click", () => showPuzzleInfo(game.puzzle));
  app.querySelector("#hint")?.addEventListener("click", async () => {
    activeHint = findHint(game.values, game.eliminated);
    revealedHintId = null;
    game.hintStage = activeHint ? "preview" : "none";
    game.hintId = activeHint?.id || null;
    if (activeHint) {
      let record = recordedHint(game, activeHint.id);
      if (!record) {
        record = { ...activeHint, viewedAt: Date.now(), answerShown: false, applied: false, dismissed: false };
        game.hintHistory.push(record);
        if (game.hintHistory.length > 40) game.hintHistory.shift();
      } else {
        record.viewedAt = Date.now();
        record.dismissed = false;
      }
      game.updatedAt = Date.now();
      await store.putGame(game);
    } else notify("No supported logical step was found for this position.");
    renderPlayer();
  });
  app.querySelector("#apply-hint")?.addEventListener("click", () => activeHint && changeGame(game, () => {
    const record = recordedHint(game, activeHint!.id); if (record) record.applied = true;
    applyHint(game, activeHint!);
  }));
  app.querySelector("#show-hint-answer")?.addEventListener("click", async () => {
    if (!activeHint) return;
    const record = recordedHint(game, activeHint.id); if (record) record.answerShown = true;
    revealedHintId = activeHint.id;
    game.updatedAt = Date.now();
    await store.putGame(game);
    renderPlayer();
  });
  app.querySelector("#dismiss-hint")?.addEventListener("click", async () => {
    if (activeHint) { const record = recordedHint(game, activeHint.id); if (record) record.dismissed = true; }
    activeHint = null; revealedHintId = null; game.hintStage = "none"; game.hintId = null; game.updatedAt = Date.now();
    await store.putGame(game);
    renderPlayer();
  });
  app.querySelector("#hint-history")?.addEventListener("click", () => showHintHistory(game));
  app.querySelector("#next-puzzle")?.addEventListener("click", () => startPuzzle(pickPuzzle(game.puzzle.difficulty as Difficulty)));
  app.querySelectorAll("#main, .app-header").forEach((surface) => surface.addEventListener("click", async (event) => {
    const target = event.target as HTMLElement;
    if ((!game.selected.length && !highlightedDigits.size && !highlightMode) || target.closest(".sudoku-board, button, a, input, select, textarea, dialog")) return;
    const hadSelection = game.selected.length > 0;
    game.selected = [];
    highlightedDigits.clear();
    highlightMode = false;
    if (hadSelection) { game.updatedAt = Date.now(); await store.putGame(game); }
    renderPlayer();
  }));
}

function bindCellDrag(game: Game) {
  const board = app.querySelector<HTMLElement>(".sudoku-board")!;
  let activePointer: number | null = null;
  let lineStart: number | null = null;
  let lineEnd: number | null = null;
  const visited = new Set<number>();
  const cellAt = (x: number, y: number) => {
    const cell = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-cell]");
    return cell && board.contains(cell) ? cell : null;
  };
  const paintSelection = () => {
    board.querySelectorAll<HTMLElement>("[data-cell]").forEach((cell) => {
      const selected = game.selected.includes(Number(cell.dataset.cell));
      cell.classList.toggle("selected", selected);
      cell.setAttribute("aria-pressed", String(selected));
    });
  };
  const point = (cell: number) => ({ x: cell % 9 * 100 + 50, y: Math.floor(cell / 9) * 100 + 50 });
  const paintLinePreview = () => {
    const preview = board.querySelector<SVGLineElement>("[data-line-preview]");
    if (!preview || lineStart === null || lineEnd === null || lineStart === lineEnd) { preview?.setAttribute("hidden", ""); return; }
    const from = point(lineStart); const to = point(lineEnd);
    preview.setAttribute("x1", String(from.x)); preview.setAttribute("y1", String(from.y));
    preview.setAttribute("x2", String(to.x)); preview.setAttribute("y2", String(to.y));
    preview.removeAttribute("hidden");
  };
  const finish = (event: PointerEvent) => {
    if (event.pointerId !== activePointer) return;
    activePointer = null;
    suppressCellClick = true;
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    if (game.mode === "line" && lineStart !== null && lineEnd !== null) toggleLine(game, lineStart, lineEnd, activeAnnotationColour);
    lineStart = null; lineEnd = null;
    game.updatedAt = Date.now();
    void store.putGame(game);
    renderPlayer();
    setTimeout(() => { suppressCellClick = false; }, 0);
  };

  board.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activePointer !== null) return;
    const cell = (event.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell || !board.contains(cell)) return;
    const index = Number(cell.dataset.cell);
    highlightMode = false;
    if (game.mode === "line") {
      activePointer = event.pointerId;
      lineStart = index;
      lineEnd = index;
      selectCell(game, index, false);
      board.setPointerCapture(event.pointerId);
      paintSelection();
      event.preventDefault();
      return;
    }
    const extend = multiSelect || event.shiftKey || event.metaKey || event.ctrlKey;
    activePointer = event.pointerId;
    visited.clear();
    visited.add(index);
    selectCell(game, index, extend);
    highlightOnly(Number(game.values[index]) || null);
    board.setPointerCapture(event.pointerId);
    paintSelection();
    event.preventDefault();
  });
  board.addEventListener("pointermove", (event) => {
    if (event.pointerId !== activePointer) return;
    const cell = cellAt(event.clientX, event.clientY);
    if (!cell) return;
    const index = Number(cell.dataset.cell);
    if (game.mode === "line") {
      lineEnd = index;
      paintLinePreview();
      event.preventDefault();
      return;
    }
    if (visited.has(index)) return;
    visited.add(index);
    if (!game.selected.includes(index)) game.selected.push(index);
    game.anchor = index;
    highlightedDigits.clear();
    paintSelection();
    event.preventDefault();
  });
  board.addEventListener("pointerup", finish);
  board.addEventListener("pointercancel", finish);
}

async function changeGame(game: Game, change: () => unknown) {
  if (game.paused && !game.completedAt) return;
  const wasCompleted = Boolean(game.completedAt);
  change();
  if (!wasCompleted && game.completedAt) {
    celebratingGameId = game.id;
    navigator.vibrate?.([70, 45, 110]);
    if (celebrationTimer !== null) window.clearTimeout(celebrationTimer);
    celebrationTimer = window.setTimeout(() => { if (celebratingGameId === game.id) celebratingGameId = null; celebrationTimer = null; }, 2400);
  }
  activeHint = null;
  revealedHintId = null;
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
        ${!cloudConfigured ? `<p>Cloud sessions are not configured in this build. Device-only play remains fully available.</p>` : cloudUser ? `<p>Signed in as <strong>${escapeHtml(cloudUser.email || "your account")}</strong>. Puzzle edits, notation, cell colours, drawn lines, elapsed time, completion history, preferences, and training progress sync through your private Firestore account.</p><p class="sync-message ${cloud.error ? "error" : ""}" data-cloud-status>${escapeHtml(cloud.status())}</p>${cloud.error ? `<p class="error">${escapeHtml(cloud.error)}</p><button id="retry-sync" class="secondary">Retry sync</button>` : ""}<button id="sign-out" class="secondary">Sign out on this device</button>` : `<p>Create an account or sign in with the same email on your PC and phone. Offline puzzle and training progress remains on each device and reconciles by the newest saved version when a connection returns.</p><form id="account-form"><label>Email<input id="account-email" type="email" autocomplete="email" required /></label><label>Password<input id="account-password" type="password" autocomplete="current-password" minlength="6" required /></label><div class="actions"><button class="primary compact" type="submit">Sign in</button><button class="secondary compact" type="submit" data-create="true">Create account</button></div><button class="text-button" type="button" id="reset-password">Send password reset email</button><p id="account-feedback" role="status"></p></form>`}
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
  showDialog(`<span class="eyebrow">User guide</span><h2>Solving with STrack</h2><h3>Training</h3><p>Train contains 20 lessons from singles through fish, wings, coloring, chains, uniqueness, ALS-XZ, and forcing chains. Each moves through Learn, Find, Deduce, and Complete. A clue highlights the pattern without naming the candidate; Show answer is a separate, explicit fallback. Core lessons use bundled puzzle positions, advanced lessons use focused candidate diagrams with strong and weak link lines, and all progress works offline and syncs across signed-in devices.</p><h3>Entering digits and notes</h3><p>Select one cell, drag across cells, or turn on Multi-select. Digit writes an answer for one cell; with several cells selected it defaults to corner notes. Warm corner notes stay in the top-left. Cool centre notes stay centred. Both wrap only when needed, and entering a final value clears both note types from that cell. Across several selected cells, a note is added everywhere first and removed everywhere only when every cell already has it. Calculate all candidates removes corner notes and writes canonical centre candidates in every empty editable cell as one undoable action. The number buttons form a 3×3 keypad. On portrait phones, the compact player keeps the board and full keypad in the initial screen; secondary tools remain available below. Phone note digits are enlarged for legibility. Turn on Highlight values, then tap several digits to compare all of their matching placed values and notes without editing the puzzle. Highlighted notes keep their original warm or cool color and become slightly larger and bold, without a circle or background. Clicking blank space outside the grid and controls clears the cell selection and every value highlight. A digit button becomes grey once all nine instances are placed in the grid, and returns to normal if one is cleared or undone. Peer shading appears only when the selected cell contains a placed value; selecting an empty or notes-only cell keeps the row, column, and box unshaded. Colour offers nine independently toggled shades; cells divide into equal segments when several are applied, with dots as a second cue. Lines uses the same palette: drag between cells, or select exactly two and connect them. Repeating a colored connection removes it; choosing another color recolors it. All annotations support undo, offline saves, backup, and signed-in sync. Solving the final cell adds a short completion celebration that respects reduced-motion settings.</p><h3>History</h3><p>The home screen keeps in-progress puzzles under Recent puzzles and finished games under Completed puzzles. Delete removes a puzzle from this device and, while signed in, from your synced session.</p><h3>Keyboard</h3><p>Arrow keys move. Shift + arrows extends the selection. Press 1–9 to enter, Backspace/Delete to clear, C for corner, M for centre, V for colour, L for lines, and Ctrl/⌘ Z or Y for undo/redo.</p><h3>Hints</h3><p>Hint first identifies evidence and names the technique without revealing the digit or exact elimination. Show answer explicitly reveals the deduction; only then does Apply deduction become available. Dismiss any hint and reopen it from Previous hints.</p><h3>Difficulty</h3><p>SE values come from SukakuExplainer and describe the hardest logical technique on its selected path. Easy, Medium, Hard, and Diabolical are STrack’s friendly bands, not an official universal scale. Diabolical puzzles can outgrow the local hint engine.</p><h3>Offline, sync, and privacy</h3><p>The production PWA caches its shell, bundled 80-puzzle catalogue, help, training, and solver. Progress always saves to IndexedDB first. Optional email/password accounts sync private puzzle sessions, training progress, and preferences through Firestore so you can continue on another device. Core play never requires a connection, and there are no analytics or ads. Keep JSON exports as an independent backup.</p>`, "Got it");
  dialog.querySelector("h2")?.insertAdjacentHTML("afterend", `<h3>Daily and weekly challenges</h3><p>Home offers one daily and one weekly puzzle in every difficulty. The selections are based on the UTC date or ISO week, so everyone receives the same bundled puzzle and it remains available offline. Opening a challenge resumes its existing saved game; signed-in progress follows you between devices through the same private Firestore session as every other puzzle.</p>`);
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
  else if (view === "training") activeTraining ? renderTrainingLesson() : renderTrainingHub();
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
  else if (/^[1-9]$/.test(event.key)) {
    event.preventDefault();
    const digit = Number(event.key);
    if (highlightMode || !game.selected.length) { highlightMode = true; toggleHighlight(digit); renderPlayer(); }
    else await changeGame(game, () => { highlightOnly(digit); enterDigit(game, digit, store.data.preferences.cleanCandidates); });
  }
  else if (["Backspace", "Delete", "0"].includes(event.key)) {
    event.preventDefault();
    if (!game.selected.length) { highlightedDigits.clear(); renderPlayer(); }
    else await changeGame(game, () => { highlightedDigits.clear(); clearSelected(game); });
  }
  else if (event.key === "ArrowUp") { event.preventDefault(); moveSelection(game, -1, 0, event.shiftKey); highlightOnly(Number(game.values[game.anchor]) || null); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowDown") { event.preventDefault(); moveSelection(game, 1, 0, event.shiftKey); highlightOnly(Number(game.values[game.anchor]) || null); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowLeft") { event.preventDefault(); moveSelection(game, 0, -1, event.shiftKey); highlightOnly(Number(game.values[game.anchor]) || null); await store.putGame(game); renderPlayer(); }
  else if (event.key === "ArrowRight") { event.preventDefault(); moveSelection(game, 0, 1, event.shiftKey); highlightOnly(Number(game.values[game.anchor]) || null); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "c") { setMode(game, "corner"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "m") { setMode(game, "centre"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "v") { setMode(game, "colour"); await store.putGame(game); renderPlayer(); }
  else if (event.key.toLowerCase() === "l") { setMode(game, "line"); await store.putGame(game); renderPlayer(); }
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
