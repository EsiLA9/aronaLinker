import "./style.css";
import type { CreateTypes, Options as ConfettiOptions } from "canvas-confetti";

const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Starter game container was not found.");
}

const root = app;
const appTitle = app.dataset.title?.trim() || "Chara-Halo 图片连连看";
const autoPackUrl = app.dataset.autoPackUrl?.trim() || "";
const storageNamespace = app.dataset.storageKey?.trim() || "starter";

type AssetSource = "demo" | "upload";
type NoticeTone = "info" | "success" | "error";
type GamePhase = "setup" | "playing" | "won";
type HaloKindsMode = "manual" | "maximize";
type AssetBankTab = "halo" | "chara";
type AudioCueKey = "start" | "click" | "match" | "finish";

type HaloAsset = {
  id: string;
  name: string;
  alias: string;
  src: string;
  source: AssetSource;
  persistMode: "inline" | "blob";
};

type CharaAsset = {
  id: string;
  name: string;
  alias: string;
  src: string;
  haloId: string | null;
  source: AssetSource;
  persistMode: "inline" | "blob";
};

type GameConfig = {
  rows: number;
  cols: number;
  haloKindsMode: HaloKindsMode;
  haloKinds: number;
  maxCharasPerHalo: number;
  tutorialMode: boolean;
};

type ThemeConfig = {
  appColor: string;
  headingColor: string;
  mutedTextColor: string;
  softTextColor: string;
  buttonTextColor: string;
  accentColor: string;
  candidateGlow: string;
  panelTint: string;
  backgroundStart: string;
  backgroundEnd: string;
  backgroundImage: string;
};

type AudioClip = {
  src: string;
  mimeType: string;
};

type AudioCueConfig = {
  clip: AudioClip | null;
  volume: number;
};

type AudioConfig = Record<AudioCueKey, AudioCueConfig>;

type BoardCell = {
  id: string;
  assetId: string;
  haloId: string;
  name: string;
  src: string;
  kind: "halo" | "chara";
  removed: boolean;
};

type Notice = {
  tone: NoticeTone;
  text: string;
};

type DemoSet = {
  halos: HaloAsset[];
  charas: CharaAsset[];
};

type SerializedAsset = {
  id: string;
  name: string;
  alias?: string;
  src?: string;
  source: AssetSource;
  file?: string;
  mimeType?: string;
  persistMode: "inline" | "blob";
  haloId?: string | null;
};

type SerializedAudioClip = {
  src?: string;
  file?: string;
  mimeType?: string;
  volume?: number;
};

type SerializedAudioConfig = Partial<Record<AudioCueKey, SerializedAudioClip | null>>;

type SavedWorkspace = {
  version: 1;
  halos: SerializedAsset[];
  charas: SerializedAsset[];
  config: GameConfig;
  theme: ThemeConfig;
  audio?: SerializedAudioConfig;
};

type ScrollSnapshot = {
  windowX: number;
  windowY: number;
  modalScrollTop: Partial<Record<"workbench" | "halo-chara", number>>;
};

type PagerState = {
  page: number;
  pageSize: number;
};

const STORAGE_KEY = `bagame.${storageNamespace}.workspace.v1`;
const STORAGE_DB_NAME = "bagame-workspace-db";
const STORAGE_STORE_NAME = "workspace";
const DEFAULT_PAGE_SIZE = 8;

const DEFAULT_CONFIG: GameConfig = {
  rows: 6,
  cols: 6,
  haloKindsMode: "manual",
  haloKinds: 3,
  maxCharasPerHalo: 2,
  tutorialMode: true,
};

const DEFAULT_THEME: ThemeConfig = {
  appColor: "#edf4ff",
  headingColor: "#ffffff",
  mutedTextColor: "#9db2ce",
  softTextColor: "#bad0ea",
  buttonTextColor: "#082032",
  accentColor: "#7dd3fc",
  candidateGlow: "#facc15",
  panelTint: "#08101d",
  backgroundStart: "#06111f",
  backgroundEnd: "#0b1324",
  backgroundImage: "",
};

const DEFAULT_AUDIO: AudioConfig = {
  start: {
    clip: null,
    volume: 1,
  },
  click: {
    clip: null,
    volume: 1,
  },
  match: {
    clip: null,
    volume: 1,
  },
  finish: {
    clip: null,
    volume: 1,
  },
};

const AUDIO_CUE_LABELS: Record<AudioCueKey, { title: string; description: string }> = {
  start: {
    title: "开始音乐",
    description: "点击开始或重新开始时播放",
  },
  click: {
    title: "点击音乐",
    description: "每次点选棋盘格时播放",
  },
  match: {
    title: "连接成功音乐",
    description: "配对成功但尚未通关时播放",
  },
  finish: {
    title: "结束音乐",
    description: "全部消除完成时播放",
  },
};

const state = {
  halos: [] as HaloAsset[],
  charas: [] as CharaAsset[],
  config: { ...DEFAULT_CONFIG },
  theme: { ...DEFAULT_THEME },
  audio: { ...DEFAULT_AUDIO },
  phase: "setup" as GamePhase,
  isWorkbenchOpen: false,
  assetBankTab: "halo" as AssetBankTab,
  assetBankSearch: {
    halo: "",
    chara: "",
  } as Record<AssetBankTab, string>,
  haloCharaSearch: "",
  pagers: {
    halo: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    chara: { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    "halo-chara-linked": { page: 1, pageSize: DEFAULT_PAGE_SIZE },
    "halo-chara-unlinked": { page: 1, pageSize: DEFAULT_PAGE_SIZE },
  } as Record<"halo" | "chara" | "halo-chara-linked" | "halo-chara-unlinked", PagerState>,
  selectedHaloId: null as string | null,
  board: [] as BoardCell[],
  selectedCellId: null as string | null,
  hintedCellIds: [] as string[],
  moves: 0,
  matches: 0,
  startedAt: null as number | null,
  elapsedMs: 0,
  notice: {
    tone: "info",
    text: "已加载演示素材。你可以直接开始，也可以导入本地图片并重新配置关系。",
  } as Notice,
};

const view = {
  notice: null as HTMLDivElement | null,
  stage: null as HTMLElement | null,
  modalLayer: null as HTMLDivElement | null,
  boardGrid: null as HTMLDivElement | null,
  selectionChip: null as HTMLDivElement | null,
  statsMoves: null as HTMLSpanElement | null,
  statsMatches: null as HTMLSpanElement | null,
  statsRemain: null as HTMLSpanElement | null,
  stageTitle: null as HTMLHeadingElement | null,
  timerToast: null as HTMLButtonElement | null,
  timerToastTime: null as HTMLSpanElement | null,
  timerToastHint: null as HTMLSpanElement | null,
};
let timerHandle: number | null = null;
let confettiLauncher: CreateTypes | null = null;
let confettiLoadPromise: Promise<CreateTypes | null> | null = null;
let restartHoldTimeoutHandle: number | null = null;
let restartHoldIntervalHandle: number | null = null;
let restartHoldStartedAt: number | null = null;
const RESTART_HOLD_MS = 2000;
const activeSoundPlayers = new Set<HTMLAudioElement>();
const activeAudioByCue = new Map<AudioCueKey, HTMLAudioElement>();
let tutorialHintTimeoutHandle: number | null = null;
let tutorialHintClearHandle: number | null = null;
const TUTORIAL_HINT_DELAY_MS = 5000;
const TUTORIAL_HINT_FLASH_MS = 1200;
const TUTORIAL_HINT_REPEAT_MS = 3200;

function getExclusiveAudioCueGroup(cue: AudioCueKey): AudioCueKey[] {
  switch (cue) {
    case "start":
    case "finish":
      return ["start", "finish"];
    default:
      return [cue];
  }
}

function createDemoData(): DemoSet {
  const haloSeeds = [
    { key: "aurora", name: "Aurora Halo", bg: "#1d4ed8", accent: "#7dd3fc" },
    { key: "ember", name: "Ember Halo", bg: "#b45309", accent: "#fcd34d" },
    { key: "mint", name: "Mint Halo", bg: "#0f766e", accent: "#99f6e4" },
    { key: "violet", name: "Violet Halo", bg: "#6d28d9", accent: "#c4b5fd" },
  ];

  const charaSeeds = [
    { key: "c1", name: "Chara Nova", haloKey: "aurora", bg: "#0f172a", accent: "#7dd3fc" },
    { key: "c2", name: "Chara Sora", haloKey: "aurora", bg: "#1e293b", accent: "#93c5fd" },
    { key: "c3", name: "Chara Flare", haloKey: "ember", bg: "#451a03", accent: "#fbbf24" },
    { key: "c4", name: "Chara Aki", haloKey: "ember", bg: "#7c2d12", accent: "#fdba74" },
    { key: "c5", name: "Chara Tide", haloKey: "mint", bg: "#042f2e", accent: "#5eead4" },
    { key: "c6", name: "Chara Nami", haloKey: "mint", bg: "#134e4a", accent: "#99f6e4" },
    { key: "c7", name: "Chara Iris", haloKey: "violet", bg: "#2e1065", accent: "#ddd6fe" },
    { key: "c8", name: "Chara Echo", haloKey: "violet", bg: "#4c1d95", accent: "#c4b5fd" },
  ];

  const halos = haloSeeds.map((seed) => ({
    id: seed.key,
    name: seed.name,
    alias: "",
    src: createAssetPreview(seed.name, "HALO", seed.bg, seed.accent),
    source: "demo" as const,
    persistMode: "inline" as const,
  }));

  const charas = charaSeeds.map((seed) => ({
    id: seed.key,
    name: seed.name,
    alias: "",
    src: createAssetPreview(seed.name, "CHARA", seed.bg, seed.accent),
    haloId: seed.haloKey,
    source: "demo" as const,
    persistMode: "inline" as const,
  }));

  return { halos, charas };
}

function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function getPairableCellIds(selectedCellId: string | null): string[] {
  if (!selectedCellId) {
    return [];
  }

  const selectedCell = state.board.find((cell) => cell.id === selectedCellId);
  if (!selectedCell || selectedCell.removed) {
    return [];
  }

  const targetKind = selectedCell.kind === "chara" ? "halo" : "chara";
  return state.board
    .filter((cell) =>
      !cell.removed &&
      cell.id !== selectedCell.id &&
      cell.kind === targetKind &&
      cell.haloId === selectedCell.haloId,
    )
    .map((cell) => cell.id);
}

function updateElapsedTime(): void {
  if (state.startedAt === null) {
    state.elapsedMs = 0;
    return;
  }

  state.elapsedMs = Date.now() - state.startedAt;
}

function syncTimerStat(): void {
  if (!view.timerToastTime) {
    return;
  }

  view.timerToastTime.textContent = `用时 ${formatElapsedTime(state.elapsedMs)}`;
}

function stopGameTimer(): void {
  if (timerHandle !== null) {
    window.clearInterval(timerHandle);
    timerHandle = null;
  }
}

function resetGameTimer(): void {
  stopGameTimer();
  cancelRestartHold();
  cancelTutorialHint();
  state.startedAt = null;
  state.elapsedMs = 0;
}

function startGameTimer(): void {
  stopGameTimer();
  cancelRestartHold();
  state.startedAt = Date.now();
  state.elapsedMs = 0;
  timerHandle = window.setInterval(() => {
    if (state.phase !== "playing" || state.startedAt === null) {
      stopGameTimer();
      return;
    }

    updateElapsedTime();
    syncTimerToast();
  }, 1000);
}

function getRestartHoldProgress(): number {
  if (restartHoldStartedAt === null) {
    return 0;
  }

  return Math.min(1, (Date.now() - restartHoldStartedAt) / RESTART_HOLD_MS);
}

function syncTimerToast(): void {
  if (!view.timerToast || !view.timerToastTime || !view.timerToastHint) {
    return;
  }

  const isHoldingRestart = restartHoldStartedAt !== null && state.phase === "playing";
  view.timerToast.dataset.phase = state.phase;
  view.timerToast.dataset.holdRestart = state.phase === "playing" ? "true" : "false";
  view.timerToast.classList.toggle("is-holding", isHoldingRestart);
  view.timerToast.style.setProperty("--hold-progress", `${getRestartHoldProgress()}`);
  view.timerToast.disabled = false;

  if (state.phase === "setup") {
    view.timerToast.setAttribute("aria-label", "开始游戏");
    view.timerToastTime.textContent = "开始游戏";
    view.timerToastHint.textContent = "点击部署棋盘";
    return;
  }

  if (state.phase === "won") {
    view.timerToast.setAttribute("aria-label", "重新开始");
    view.timerToastTime.textContent = `完成 ${formatElapsedTime(state.elapsedMs)}`;
    view.timerToastHint.textContent = "点击再次开局";
    return;
  }

  view.timerToast.setAttribute("aria-label", "长按两秒重新开始");
  view.timerToastTime.textContent = `用时 ${formatElapsedTime(state.elapsedMs)}`;
  view.timerToastHint.textContent = isHoldingRestart
    ? `继续按住 ${(RESTART_HOLD_MS / 1000 - (RESTART_HOLD_MS / 1000) * getRestartHoldProgress()).toFixed(1)} 秒重开`
    : "长按 2 秒重新开始";
}

function cancelRestartHold(): void {
  if (restartHoldTimeoutHandle !== null) {
    window.clearTimeout(restartHoldTimeoutHandle);
    restartHoldTimeoutHandle = null;
  }

  if (restartHoldIntervalHandle !== null) {
    window.clearInterval(restartHoldIntervalHandle);
    restartHoldIntervalHandle = null;
  }

  restartHoldStartedAt = null;
  syncTimerToast();
}

function beginRestartHold(): void {
  if (state.phase !== "playing" || restartHoldStartedAt !== null) {
    return;
  }

  restartHoldStartedAt = Date.now();
  syncTimerToast();
  restartHoldIntervalHandle = window.setInterval(() => {
    syncTimerToast();
  }, 100);
  restartHoldTimeoutHandle = window.setTimeout(() => {
    cancelRestartHold();
    restartGame();
  }, RESTART_HOLD_MS);
}

function clearHintedCells(): void {
  if (state.hintedCellIds.length === 0) {
    return;
  }

  state.hintedCellIds = [];
  syncBoardState();
}

function cancelTutorialHint(): void {
  if (tutorialHintTimeoutHandle !== null) {
    window.clearTimeout(tutorialHintTimeoutHandle);
    tutorialHintTimeoutHandle = null;
  }

  if (tutorialHintClearHandle !== null) {
    window.clearTimeout(tutorialHintClearHandle);
    tutorialHintClearHandle = null;
  }

  clearHintedCells();
}

function queueTutorialHint(delayMs: number): void {
  tutorialHintTimeoutHandle = window.setTimeout(() => {
    tutorialHintTimeoutHandle = null;

    if (!state.config.tutorialMode || state.phase !== "playing" || !state.selectedCellId) {
      return;
    }

    state.hintedCellIds = getPairableCellIds(state.selectedCellId);
    if (state.hintedCellIds.length === 0) {
      queueTutorialHint(TUTORIAL_HINT_REPEAT_MS);
      return;
    }

    syncBoardState();
    tutorialHintClearHandle = window.setTimeout(() => {
      tutorialHintClearHandle = null;
      clearHintedCells();

      if (!state.config.tutorialMode || state.phase !== "playing" || !state.selectedCellId) {
        return;
      }

      queueTutorialHint(TUTORIAL_HINT_REPEAT_MS);
    }, TUTORIAL_HINT_FLASH_MS);
  }, delayMs);
}

function scheduleTutorialHint(): void {
  cancelTutorialHint();

  if (!state.config.tutorialMode || state.phase !== "playing" || !state.selectedCellId) {
    return;
  }

  queueTutorialHint(TUTORIAL_HINT_DELAY_MS);
}

async function loadConfettiLauncher(): Promise<CreateTypes | null> {
  if (confettiLauncher) {
    return confettiLauncher;
  }

  if (!confettiLoadPromise) {
    confettiLoadPromise = import("canvas-confetti")
      .then((module) => {
        confettiLauncher = module.default.create(undefined, {
          resize: true,
          useWorker: true,
          disableForReducedMotion: true,
        });
        return confettiLauncher;
      })
      .catch(() => null);
  }

  return confettiLoadPromise;
}

async function launchWinConfetti(): Promise<void> {
  const launcher = await loadConfettiLauncher();
  if (!launcher) {
    return;
  }

  const burstOptions: ConfettiOptions = {
    particleCount: 220,
    spread: 112,
    startVelocity: 64,
    scalar: 1.6,
  };

  await Promise.all([
    launcher({
      ...burstOptions,
      origin: { x: 0.14, y: 0.7 },
    }),
    launcher({
      ...burstOptions,
      origin: { x: 0.86, y: 0.7 },
    }),
    launcher({
      ...burstOptions,
      particleCount: 180,
      spread: 124,
      startVelocity: 70,
      scalar: 1.8,
      origin: { x: 0.5, y: 0.34 },
    }),
  ]);
}

function createAssetPreview(
  title: string,
  subtitle: string,
  bg: string,
  accent: string,
): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 600">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="#020617"/>
        </linearGradient>
      </defs>
      <rect width="480" height="600" rx="42" fill="url(#bg)"/>
      <circle cx="240" cy="150" r="92" fill="none" stroke="${accent}" stroke-width="18" stroke-dasharray="20 14"/>
      <circle cx="240" cy="150" r="48" fill="${accent}" fill-opacity="0.16"/>
      <path d="M150 470c20-98 68-146 90-146 26 0 72 52 92 146" fill="${accent}" fill-opacity="0.22"/>
      <circle cx="240" cy="280" r="68" fill="${accent}" fill-opacity="0.2"/>
      <text x="44" y="540" fill="#e2e8f0" font-family="Segoe UI, Arial, sans-serif" font-size="42" font-weight="700">${title}</text>
      <text x="44" y="82" fill="${accent}" font-family="Segoe UI, Arial, sans-serif" font-size="26" letter-spacing="6">${subtitle}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function setNotice(tone: NoticeTone, text: string): void {
  state.notice = { tone, text };
}

function getAssetDisplayName(asset: { name: string; alias?: string }): string {
  return (asset.alias ?? "").trim() || asset.name;
}

function matchesAssetSearch(
  asset: { name: string; alias?: string },
  rawKeyword: string,
): boolean {
  const keyword = rawKeyword.trim().toLowerCase();
  if (!keyword) {
    return true;
  }

  return [(asset.alias ?? ""), asset.name].some((value) => value.toLowerCase().includes(keyword));
}

function openWorkspaceDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(STORAGE_DB_NAME, 1);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORAGE_STORE_NAME)) {
        db.createObjectStore(STORAGE_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

function saveWorkspaceToDb(payload: SavedWorkspace): Promise<void> {
  return openWorkspaceDb().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(STORAGE_STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORAGE_STORE_NAME);
        store.put(payload, STORAGE_KEY);
        transaction.oncomplete = () => {
          db.close();
          resolve();
        };
        transaction.onerror = () => {
          db.close();
          reject(transaction.error ?? new Error("Failed to persist workspace."));
        };
      }),
  );
}

function loadWorkspaceFromDb(): Promise<SavedWorkspace | null> {
  return openWorkspaceDb().then(
    (db) =>
      new Promise<SavedWorkspace | null>((resolve, reject) => {
        const transaction = db.transaction(STORAGE_STORE_NAME, "readonly");
        const store = transaction.objectStore(STORAGE_STORE_NAME);
        const request = store.get(STORAGE_KEY);
        request.onsuccess = () => {
          db.close();
          resolve((request.result as SavedWorkspace | undefined) ?? null);
        };
        request.onerror = () => {
          db.close();
          reject(request.error ?? new Error("Failed to load workspace."));
        };
      }),
  );
}

function normalizePagerPage(totalItems: number, pageSize: number, page: number): number {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  return clamp(page, 1, totalPages);
}

function paginateItems<T>(items: T[], pager: PagerState): { items: T[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(items.length / pager.pageSize));
  const page = normalizePagerPage(items.length, pager.pageSize, pager.page);
  const start = (page - 1) * pager.pageSize;

  return {
    items: items.slice(start, start + pager.pageSize),
    totalPages,
    page,
  };
}

function renderPagination(
  pagerKey: "halo" | "chara" | "halo-chara-linked" | "halo-chara-unlinked",
  totalItems: number,
): string {
  const pager = state.pagers[pagerKey];
  const totalPages = Math.max(1, Math.ceil(totalItems / pager.pageSize));
  const currentPage = normalizePagerPage(totalItems, pager.pageSize, pager.page);

  if (totalItems <= pager.pageSize) {
    return "";
  }

  const pageNumbers = Array.from({ length: totalPages }, (_, index) => index + 1)
    .filter((page) => {
      if (totalPages <= 7) {
        return true;
      }

      return page === 1 || page === totalPages || Math.abs(page - currentPage) <= 1;
    })
    .reduce<number[]>((accumulator, page) => {
      if (accumulator[accumulator.length - 1] !== page) {
        accumulator.push(page);
      }
      return accumulator;
    }, []);

  return `
    <div class="pager-bar">
      <button class="ghost-button compact-action" type="button" data-page-nav="${pagerKey}" data-page-target="${currentPage - 1}" ${currentPage <= 1 ? "disabled" : ""}>
        上一页
      </button>
      <div class="pager-numbers">
        ${pageNumbers
          .map((page, index) => {
            const previous = pageNumbers[index - 1];
            const gap = previous && page - previous > 1 ? `<span class="pager-ellipsis">...</span>` : "";
            const button = `
              <button
                class="${page === currentPage ? "primary-button" : "ghost-button"} compact-action"
                type="button"
                data-page-nav="${pagerKey}"
                data-page-target="${page}"
                aria-current="${page === currentPage ? "page" : "false"}"
              >
                ${page}
              </button>
            `;
            return `${gap}${button}`;
          })
          .join("")}
      </div>
      <span class="pager-copy">第 ${currentPage} / ${totalPages} 页，共 ${totalItems} 项</span>
      <button class="ghost-button compact-action" type="button" data-page-nav="${pagerKey}" data-page-target="${currentPage + 1}" ${currentPage >= totalPages ? "disabled" : ""}>
        下一页
      </button>
    </div>
  `;
}

function serializeWorkspace(): SavedWorkspace {
  return {
    version: 1,
    halos: state.halos.map((halo) => ({
      id: halo.id,
      name: halo.name,
      alias: halo.alias,
      src: halo.src,
      source: halo.source,
      persistMode: "inline" as const,
    })),
    charas: state.charas.map((chara) => ({
      id: chara.id,
      name: chara.name,
      alias: chara.alias,
      src: chara.src,
      source: chara.source,
      haloId: chara.haloId,
      persistMode: "inline" as const,
    })),
    config: { ...state.config },
    theme: { ...state.theme },
    audio: {
      start: {
        ...(state.audio.start.clip ? { ...state.audio.start.clip } : {}),
        volume: state.audio.start.volume,
      },
      click: {
        ...(state.audio.click.clip ? { ...state.audio.click.clip } : {}),
        volume: state.audio.click.volume,
      },
      match: {
        ...(state.audio.match.clip ? { ...state.audio.match.clip } : {}),
        volume: state.audio.match.volume,
      },
      finish: {
        ...(state.audio.finish.clip ? { ...state.audio.finish.clip } : {}),
        volume: state.audio.finish.volume,
      },
    },
  };
}

function applyWorkspaceData(payload: SavedWorkspace): void {
  stopAudioCueGroup("start");
  releaseThemeBackgroundImage();
  revokeUploadedUrls(state.halos);
  revokeUploadedUrls(state.charas);
  stopAllActiveSounds();

  state.halos = payload.halos.map((halo) => ({
    id: halo.id,
    name: halo.name,
    alias: halo.alias ?? "",
    src: halo.src ?? "",
    source: halo.source,
    persistMode: "inline",
  }));

  state.charas = payload.charas.map((chara) => ({
    id: chara.id,
    name: chara.name,
    alias: chara.alias ?? "",
    src: chara.src ?? "",
    source: chara.source,
    haloId: chara.haloId ?? null,
    persistMode: "inline",
  }));

  state.config = {
    rows: clamp(payload.config.rows, 2, 12),
    cols: clamp(payload.config.cols, 2, 12),
    haloKindsMode: payload.config.haloKindsMode === "maximize" ? "maximize" : "manual",
    haloKinds: Math.max(1, Math.round(payload.config.haloKinds)),
    maxCharasPerHalo: clamp(payload.config.maxCharasPerHalo, 1, 12),
    tutorialMode: payload.config.tutorialMode ?? DEFAULT_CONFIG.tutorialMode,
  };

  state.theme = {
    appColor: payload.theme.appColor || DEFAULT_THEME.appColor,
    headingColor: payload.theme.headingColor || DEFAULT_THEME.headingColor,
    mutedTextColor: payload.theme.mutedTextColor || DEFAULT_THEME.mutedTextColor,
    softTextColor: payload.theme.softTextColor || DEFAULT_THEME.softTextColor,
    buttonTextColor: payload.theme.buttonTextColor || DEFAULT_THEME.buttonTextColor,
    accentColor: payload.theme.accentColor || DEFAULT_THEME.accentColor,
    candidateGlow: payload.theme.candidateGlow || DEFAULT_THEME.candidateGlow,
    panelTint: payload.theme.panelTint || DEFAULT_THEME.panelTint,
    backgroundStart: payload.theme.backgroundStart || DEFAULT_THEME.backgroundStart,
    backgroundEnd: payload.theme.backgroundEnd || DEFAULT_THEME.backgroundEnd,
    backgroundImage: payload.theme.backgroundImage || "",
  };

  state.audio = {
    start: {
      clip: payload.audio?.start?.src
        ? {
            src: payload.audio.start.src,
            mimeType: payload.audio.start.mimeType || dataUrlToBlob(payload.audio.start.src).type || "audio/mpeg",
          }
        : null,
      volume: clamp(payload.audio?.start?.volume ?? DEFAULT_AUDIO.start.volume, 0, 1),
    },
    click: {
      clip: payload.audio?.click?.src
        ? {
            src: payload.audio.click.src,
            mimeType: payload.audio.click.mimeType || dataUrlToBlob(payload.audio.click.src).type || "audio/mpeg",
          }
        : null,
      volume: clamp(payload.audio?.click?.volume ?? DEFAULT_AUDIO.click.volume, 0, 1),
    },
    match: {
      clip: payload.audio?.match?.src
        ? {
            src: payload.audio.match.src,
            mimeType: payload.audio.match.mimeType || dataUrlToBlob(payload.audio.match.src).type || "audio/mpeg",
          }
        : null,
      volume: clamp(payload.audio?.match?.volume ?? DEFAULT_AUDIO.match.volume, 0, 1),
    },
    finish: {
      clip: payload.audio?.finish?.src
        ? {
            src: payload.audio.finish.src,
            mimeType: payload.audio.finish.mimeType || dataUrlToBlob(payload.audio.finish.src).type || "audio/mpeg",
          }
        : null,
      volume: clamp(payload.audio?.finish?.volume ?? DEFAULT_AUDIO.finish.volume, 0, 1),
    },
  };

  state.phase = "setup";
  state.board = [];
  state.selectedCellId = null;
  state.hintedCellIds = [];
  state.moves = 0;
  state.matches = 0;
  resetGameTimer();
  applyTheme();
}

function persistWorkspace(): void {
  const payload = serializeWorkspace();
  void saveWorkspaceToDb(payload).catch(() => {
    setNotice("error", "当前浏览器无法保存本地工作台。");
    syncNotice();
  });
}

async function restoreWorkspace(): Promise<boolean> {
  try {
    const payload = await loadWorkspaceFromDb();
    if (payload?.version === 1) {
      applyWorkspaceData(payload);
      return true;
    }
  } catch {
    // Fall through to legacy localStorage restore.
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return false;
    }

    const parsed = JSON.parse(raw) as SavedWorkspace;
    if (parsed.version !== 1) {
      return false;
    }

    applyWorkspaceData(parsed);
    void saveWorkspaceToDb(parsed);
    localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

function getFileExtensionFromMime(mimeType: string): string {
  const normalizedMimeType = mimeType.toLowerCase();

  if (normalizedMimeType.includes("png")) {
    return "png";
  }

  if (normalizedMimeType.includes("jpeg")) {
    return "jpg";
  }

  if (normalizedMimeType.includes("webp")) {
    return "webp";
  }

  if (normalizedMimeType.includes("gif")) {
    return "gif";
  }

  if (normalizedMimeType.includes("svg")) {
    return "svg";
  }

  if (normalizedMimeType.includes("bmp")) {
    return "bmp";
  }

  if (normalizedMimeType.includes("avif")) {
    return "avif";
  }

  if (normalizedMimeType.includes("mpeg")) {
    return "mp3";
  }

  if (normalizedMimeType.includes("wav")) {
    return "wav";
  }

  if (normalizedMimeType.includes("ogg")) {
    return "ogg";
  }

  if (normalizedMimeType.includes("aac")) {
    return "aac";
  }

  if (normalizedMimeType.includes("mp4") || normalizedMimeType.includes("m4a")) {
    return "m4a";
  }

  return "bin";
}

function getMimeTypeFromFileName(fileName: string): string | null {
  const extension = fileName.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    case "svg":
      return "image/svg+xml";
    case "bmp":
      return "image/bmp";
    case "avif":
      return "image/avif";
    case "mp3":
      return "audio/mpeg";
    case "wav":
      return "audio/wav";
    case "ogg":
      return "audio/ogg";
    case "aac":
      return "audio/aac";
    case "m4a":
      return "audio/mp4";
    default:
      return null;
  }
}

function sniffImageMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return "image/gif";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    bytes[8] === 0x61 &&
    bytes[9] === 0x76 &&
    bytes[10] === 0x69 &&
    (bytes[11] === 0x66 || bytes[11] === 0x73)
  ) {
    return "image/avif";
  }

  const text = new TextDecoder().decode(bytes.subarray(0, Math.min(bytes.length, 256)));
  const normalizedText = text.replace(/^\uFEFF/, "").trimStart();
  if (normalizedText.startsWith("<svg") || (normalizedText.startsWith("<?xml") && normalizedText.includes("<svg"))) {
    return "image/svg+xml";
  }

  return null;
}

function sniffAudioMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0x49 &&
    bytes[1] === 0x44 &&
    bytes[2] === 0x33
  ) {
    return "audio/mpeg";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) {
    return "audio/mpeg";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x41 &&
    bytes[10] === 0x56 &&
    bytes[11] === 0x45
  ) {
    return "audio/wav";
  }

  if (
    bytes.length >= 4 &&
    bytes[0] === 0x4f &&
    bytes[1] === 0x67 &&
    bytes[2] === 0x67 &&
    bytes[3] === 0x53
  ) {
    return "audio/ogg";
  }

  if (
    bytes.length >= 12 &&
    bytes[4] === 0x66 &&
    bytes[5] === 0x74 &&
    bytes[6] === 0x79 &&
    bytes[7] === 0x70 &&
    (bytes[8] === 0x4d || bytes[8] === 0x69)
  ) {
    return "audio/mp4";
  }

  return null;
}

async function normalizeBlobMimeType(
  blob: Blob,
  fileName?: string,
  storedMimeType?: string,
): Promise<Blob> {
  const directMimeType = [storedMimeType, blob.type, fileName ? getMimeTypeFromFileName(fileName) : null].find(
    (candidate): candidate is string =>
      Boolean(candidate?.startsWith("image/") || candidate?.startsWith("audio/")),
  );

  if (directMimeType) {
    return directMimeType === blob.type ? blob : blob.slice(0, blob.size, directMimeType);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const sniffedMimeType = sniffImageMimeType(bytes) ?? sniffAudioMimeType(bytes);
  if (!sniffedMimeType || sniffedMimeType === blob.type) {
    return blob;
  }

  return blob.slice(0, blob.size, sniffedMimeType);
}

function describeWorkspacePackImportError(error: unknown): string {
  if (error instanceof SyntaxError) {
    return "workspace.json 不是合法的 JSON。";
  }

  if (error instanceof Error) {
    const message = error.message.trim();
    if (!message) {
      return "发生了未知错误。";
    }

    if (message === "workspace.json missing") {
      return "压缩包内缺少 workspace.json。";
    }

    if (message.startsWith("Unsupported pack version:")) {
      return `不支持的素材包版本。${message.replace("Unsupported pack version:", " version=").trim()}`;
    }

    if (message.includes("Can't find end of central directory")) {
      return "文件不是合法的 zip 压缩包，或压缩包已损坏。";
    }

    return message;
  }

  return "发生了未知错误。";
}

function stopAllActiveSounds(): void {
  activeSoundPlayers.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  activeSoundPlayers.clear();
  activeAudioByCue.clear();
}

function stopAudioCueGroup(cue: AudioCueKey): void {
  getExclusiveAudioCueGroup(cue).forEach((groupCue) => {
    const audio = activeAudioByCue.get(groupCue);
    if (!audio) {
      return;
    }

    audio.pause();
    audio.currentTime = 0;
    activeSoundPlayers.delete(audio);
    activeAudioByCue.delete(groupCue);
  });
}

async function playAudioCue(cue: AudioCueKey, options?: { loop?: boolean }): Promise<void> {
  const cueConfig = state.audio[cue];
  const clip = cueConfig.clip;
  if (!clip?.src) {
    return;
  }

  try {
    stopAudioCueGroup(cue);
    const audio = new Audio(clip.src);
    audio.preload = "auto";
    audio.volume = clamp(cueConfig.volume, 0, 1);
    audio.loop = options?.loop ?? false;
    activeSoundPlayers.add(audio);
    activeAudioByCue.set(cue, audio);

    const cleanup = () => {
      activeSoundPlayers.delete(audio);
      if (activeAudioByCue.get(cue) === audio) {
        activeAudioByCue.delete(cue);
      }
      audio.removeEventListener("ended", cleanup);
      audio.removeEventListener("error", cleanup);
      audio.removeEventListener("pause", cleanup);
    };

    if (!audio.loop) {
      audio.addEventListener("ended", cleanup);
    }
    audio.addEventListener("error", cleanup);
    audio.addEventListener("pause", cleanup);

    await audio.play();
  } catch (error) {
    console.warn(`Failed to play audio cue: ${cue}`, error);
  }
}

async function updateAudioCue(cue: AudioCueKey, files: FileList): Promise<void> {
  const audioFile = Array.from(files).find((file) => file.type.startsWith("audio/"));

  if (!audioFile) {
    setNotice("error", `没有读取到可用音频，请为 ${AUDIO_CUE_LABELS[cue].title} 选择音频文件。`);
    syncNotice();
    return;
  }

  stopAllActiveSounds();
  state.audio[cue].clip = {
    src: await blobToDataUrl(audioFile),
    mimeType: audioFile.type || "audio/mpeg",
  };
  persistWorkspace();
  setNotice("success", `${AUDIO_CUE_LABELS[cue].title}已更新。`);
  syncUiPreserveScroll({ stage: false });
}

function clearAudioCue(cue: AudioCueKey): void {
  stopAllActiveSounds();
  state.audio[cue].clip = null;
  persistWorkspace();
  setNotice("info", `已清除${AUDIO_CUE_LABELS[cue].title}。`);
  syncUiPreserveScroll({ stage: false });
}

function updateAudioCueVolume(cue: AudioCueKey, rawValue: string): void {
  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return;
  }

  state.audio[cue].volume = clamp(numeric / 100, 0, 1);
  persistWorkspace();

  const volumeLabel = root.querySelector<HTMLElement>(`[data-audio-volume-label="${cue}"]`);
  if (volumeLabel) {
    volumeLabel.textContent = formatAudioVolumePercentage(state.audio[cue].volume);
  }
}

async function downloadWorkspacePack(): Promise<void> {
  const { default: JSZip } = await import("jszip");
  const payload = serializeWorkspace();
  const zip = new JSZip();
  const pack: SavedWorkspace = {
    ...payload,
    halos: [],
    charas: [],
    theme: {
      ...payload.theme,
      backgroundImage: payload.theme.backgroundImage,
    },
  };

  for (const halo of payload.halos) {
    const blob = dataUrlToBlob(halo.src ?? "");
    const fileName = `halos/${halo.id}.${getFileExtensionFromMime(blob.type)}`;
    zip.file(fileName, blob);
    pack.halos.push({
      id: halo.id,
      name: halo.name,
      alias: halo.alias,
      source: halo.source,
      file: fileName,
      mimeType: blob.type,
      persistMode: "inline",
    });
  }

  for (const chara of payload.charas) {
    const blob = dataUrlToBlob(chara.src ?? "");
    const fileName = `charas/${chara.id}.${getFileExtensionFromMime(blob.type)}`;
    zip.file(fileName, blob);
    pack.charas.push({
      id: chara.id,
      name: chara.name,
      alias: chara.alias,
      source: chara.source,
      haloId: chara.haloId ?? null,
      file: fileName,
      mimeType: blob.type,
      persistMode: "inline",
    });
  }

  if (payload.theme.backgroundImage) {
    const backgroundBlob = dataUrlToBlob(payload.theme.backgroundImage);
    const backgroundFile = `theme/background.${getFileExtensionFromMime(backgroundBlob.type)}`;
    zip.file(backgroundFile, backgroundBlob);
    pack.theme.backgroundImage = backgroundFile;
  }

  const audioPack: SerializedAudioConfig = {};
  const audioCueKeys: AudioCueKey[] = ["start", "click", "match", "finish"];
  for (const cue of audioCueKeys) {
    const cueConfig = payload.audio?.[cue];
    const clip = cueConfig?.clip;
    const volume = cueConfig?.volume ?? DEFAULT_AUDIO[cue].volume;
    if (!clip?.src) {
      audioPack[cue] = {
        volume,
      };
      continue;
    }

    const blob = dataUrlToBlob(clip.src);
    const fileName = `audio/${cue}.${getFileExtensionFromMime(blob.type)}`;
    zip.file(fileName, blob);
    audioPack[cue] = {
      file: fileName,
      mimeType: clip.mimeType || blob.type,
      volume,
    };
  }
  pack.audio = audioPack;

  zip.file("workspace.json", JSON.stringify(pack, null, 2));

  const content = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = "chara-halo-pack.zip";
  anchor.click();
  URL.revokeObjectURL(url);

  setNotice("success", "素材压缩包已导出。");
  syncNotice();
}

async function importWorkspacePack(files: FileList): Promise<boolean> {
  const file = files[0];
  if (!file) {
    return false;
  }

  try {
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(file);
    const workspaceFile = zip.file("workspace.json");

    if (!workspaceFile) {
      throw new Error("workspace.json missing");
    }

    const text = await workspaceFile.async("string");
    const parsed = JSON.parse(text) as SavedWorkspace;

    if (parsed.version !== 1) {
      throw new Error(`Unsupported pack version: ${String((parsed as { version?: unknown }).version ?? "unknown")}`);
    }

    const resolvedHalos = await Promise.all(
      parsed.halos.map(async (halo) => {
        const fileEntry = halo.file ? zip.file(halo.file) : null;
        if (!fileEntry) {
          throw new Error(`缺少 Halo 素材文件: ${halo.file || `${halo.id} (未记录 file 字段)`}`);
        }

        const blob = await normalizeBlobMimeType(await fileEntry.async("blob"), halo.file, halo.mimeType);
        return {
          ...halo,
          src: await blobToDataUrl(blob),
        };
      }),
    );

    const resolvedCharas = await Promise.all(
      parsed.charas.map(async (chara) => {
        const fileEntry = chara.file ? zip.file(chara.file) : null;
        if (!fileEntry) {
          throw new Error(`缺少 Chara 素材文件: ${chara.file || `${chara.id} (未记录 file 字段)`}`);
        }

        const blob = await normalizeBlobMimeType(await fileEntry.async("blob"), chara.file, chara.mimeType);
        return {
          ...chara,
          src: await blobToDataUrl(blob),
        };
      }),
    );

    let resolvedBackgroundImage = "";
    if (parsed.theme.backgroundImage) {
      const backgroundEntry = zip.file(parsed.theme.backgroundImage);
      if (!backgroundEntry) {
        throw new Error(`缺少背景图片文件: ${parsed.theme.backgroundImage}`);
      }

      const backgroundBlob = await normalizeBlobMimeType(
        await backgroundEntry.async("blob"),
        parsed.theme.backgroundImage,
      );
      resolvedBackgroundImage = await blobToDataUrl(backgroundBlob);
    }

    const resolvedAudioEntries = await Promise.all(
      (["start", "click", "match", "finish"] as AudioCueKey[]).map(async (cue) => {
        const audioEntryMeta = parsed.audio?.[cue];
        if (!audioEntryMeta) {
          return [
            cue,
            {
              volume: DEFAULT_AUDIO[cue].volume,
            },
          ] as const;
        }

        if (audioEntryMeta.src) {
          return [
            cue,
            {
              src: audioEntryMeta.src,
              mimeType: audioEntryMeta.mimeType || dataUrlToBlob(audioEntryMeta.src).type || "audio/mpeg",
              volume: clamp(audioEntryMeta.volume ?? DEFAULT_AUDIO[cue].volume, 0, 1),
            },
          ] as const;
        }

        if (!audioEntryMeta.file) {
          return [
            cue,
            {
              volume: clamp(audioEntryMeta.volume ?? DEFAULT_AUDIO[cue].volume, 0, 1),
            },
          ] as const;
        }

        const audioEntry = zip.file(audioEntryMeta.file);
        if (!audioEntry) {
          throw new Error(`缺少音频文件: ${audioEntryMeta.file}`);
        }

        const audioBlob = await normalizeBlobMimeType(
          await audioEntry.async("blob"),
          audioEntryMeta.file,
          audioEntryMeta.mimeType,
        );
        return [
          cue,
          {
            src: await blobToDataUrl(audioBlob),
            mimeType: audioBlob.type || audioEntryMeta.mimeType || "audio/mpeg",
            volume: clamp(audioEntryMeta.volume ?? DEFAULT_AUDIO[cue].volume, 0, 1),
          },
        ] as const;
      }),
    );

    applyWorkspaceData({
      ...parsed,
      halos: resolvedHalos,
      charas: resolvedCharas,
      theme: {
        ...parsed.theme,
        backgroundImage: resolvedBackgroundImage,
      },
      audio: Object.fromEntries(resolvedAudioEntries) as SerializedAudioConfig,
    });
    persistWorkspace();
    setNotice("success", "素材压缩包已导入。");
    syncUiPreserveScroll();
    return true;
  } catch (error) {
    console.error("Failed to import workspace pack", error);
    setNotice("error", `素材压缩包读取失败：${describeWorkspacePackImportError(error)}`);
    if (view.notice) {
      syncNotice();
    }
    return false;
  }
}

async function importWorkspacePackFromUrl(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) {
      return false;
    }

    const blob = await response.blob();
    const file = new File([blob], "resource.zip", { type: blob.type || "application/zip" });
    const fileList = {
      0: file,
      length: 1,
      item: (index: number) => (index === 0 ? file : null),
    } as unknown as FileList;

    return await importWorkspacePack(fileList);
  } catch {
    return false;
  }
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

function applyTheme(): void {
  const themeHost = document.documentElement;
  const backgroundImageValue = state.theme.backgroundImage
    ? `url("${state.theme.backgroundImage}")`
    : "none";

  themeHost.style.setProperty("--theme-app", state.theme.appColor);
  themeHost.style.setProperty("--theme-heading", state.theme.headingColor);
  themeHost.style.setProperty("--theme-muted", state.theme.mutedTextColor);
  themeHost.style.setProperty("--theme-soft", state.theme.softTextColor);
  themeHost.style.setProperty("--theme-button-text", state.theme.buttonTextColor);
  themeHost.style.setProperty("--theme-accent", state.theme.accentColor);
  themeHost.style.setProperty("--theme-candidate", state.theme.candidateGlow);
  themeHost.style.setProperty("--theme-panel", state.theme.panelTint);
  themeHost.style.setProperty("--theme-bg-start", state.theme.backgroundStart);
  themeHost.style.setProperty("--theme-bg-end", state.theme.backgroundEnd);
  themeHost.style.setProperty("--theme-bg-image", backgroundImageValue);
}

function releaseThemeBackgroundImage(): void {
  if (state.theme.backgroundImage.startsWith("blob:")) {
    URL.revokeObjectURL(state.theme.backgroundImage);
  }
}

function blobToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Failed to convert blob to data URL."));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file."));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, content] = dataUrl.split(",");
  const mimeMatch = meta.match(/^data:([^;,]+)?/);
  const mimeType = mimeMatch?.[1] ?? "application/octet-stream";
  if (meta.includes(";base64")) {
    const bytes = atob(content);
    const array = new Uint8Array(bytes.length);

    for (let index = 0; index < bytes.length; index += 1) {
      array[index] = bytes.charCodeAt(index);
    }

    return new Blob([array], { type: mimeType });
  }

  return new Blob([decodeURIComponent(content)], { type: mimeType });
}

async function updateThemeBackgroundImage(files: FileList): Promise<void> {
  const image = Array.from(files).find((file) => file.type.startsWith("image/"));

  if (!image) {
    setNotice("error", "没有读取到可用背景图，请确认选择的是图片文件。");
    syncNotice();
    return;
  }

  releaseThemeBackgroundImage();
  state.theme.backgroundImage = await blobToDataUrl(image);
  applyTheme();
  persistWorkspace();
  setNotice("success", "已更新 App 背景图片。");
  syncNotice();
}

function clearThemeBackgroundImage(): void {
  releaseThemeBackgroundImage();
  state.theme.backgroundImage = "";
  applyTheme();
  persistWorkspace();
  setNotice("info", "已清除 App 背景图片。");
  syncNotice();
}

function formatAudioVolumePercentage(volume: number): string {
  return `${Math.round(clamp(volume, 0, 1) * 100)}%`;
}

function renderAudioConfigCard(cue: AudioCueKey): string {
  const cueConfig = state.audio[cue];
  const clip = cueConfig.clip;
  const label = AUDIO_CUE_LABELS[cue];
  const statusText = clip ? "已设置 1 条音频" : "当前未设置音频";

  return `
    <div class="audio-config-card">
      <label class="import-item theme-image-item">
        <div class="import-copy">
          <span>${label.title}</span>
          <small>${label.description}。${statusText}</small>
        </div>
        <input type="file" accept="audio/*" data-audio-cue="${cue}" />
        <em>选择音频</em>
      </label>
      <div class="audio-config-actions">
        <button class="ghost-button compact-action" type="button" data-action="preview-audio-cue" data-audio-cue="${cue}" ${clip ? "" : "disabled"}>
          试听
        </button>
        <button class="ghost-button compact-action" type="button" data-action="clear-audio-cue" data-audio-cue="${cue}" ${clip ? "" : "disabled"}>
          清除
        </button>
      </div>
      <label class="field audio-volume-field">
        <span>${label.title}音量</span>
        <div class="audio-volume-row">
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value="${Math.round(cueConfig.volume * 100)}"
            data-audio-volume="${cue}"
          />
          <strong data-audio-volume-label="${cue}">${formatAudioVolumePercentage(cueConfig.volume)}</strong>
        </div>
      </label>
    </div>
  `;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function shuffle<T>(items: T[]): T[] {
  const clone = [...items];
  for (let index = clone.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [clone[index], clone[swapIndex]] = [clone[swapIndex], clone[index]];
  }
  return clone;
}

function sampleMany<T>(items: T[], count: number): T[] {
  return shuffle(items).slice(0, count);
}

function getLinkedHalos(): Array<{ halo: HaloAsset; charas: CharaAsset[] }> {
  return state.halos
    .map((halo) => ({
      halo,
      charas: state.charas.filter((chara) => chara.haloId === halo.id),
    }))
    .filter((entry) => entry.charas.length > 0);
}

function getEffectiveHaloKinds(linkedHaloCount = getLinkedHalos().length): number {
  const maxKindsByBoard = Math.floor((state.config.rows * state.config.cols) / 2);
  const maxKinds = Math.max(1, Math.min(linkedHaloCount, maxKindsByBoard));

  if (state.config.haloKindsMode === "maximize") {
    return maxKinds;
  }

  return clamp(state.config.haloKinds, 1, maxKinds);
}

function revokeUploadedUrls(items: Array<HaloAsset | CharaAsset>): void {
  items.forEach((item) => {
    if (item.source === "upload" && item.src.startsWith("blob:")) {
      URL.revokeObjectURL(item.src);
    }
  });
}

function resetToDemoAssets(): void {
  stopAudioCueGroup("start");
  revokeUploadedUrls(state.halos);
  revokeUploadedUrls(state.charas);
  const demo = createDemoData();
  state.halos = demo.halos;
  state.charas = demo.charas;
  state.phase = "setup";
  state.board = [];
  state.selectedCellId = null;
  state.hintedCellIds = [];
  state.moves = 0;
  state.matches = 0;
  resetGameTimer();
  setNotice("success", "素材已恢复为演示集。你可以先试玩，再替换成本地图片。");
  persistWorkspace();
  syncUiPreserveScroll();
}

function validateGameSetup(): string[] {
  const errors: string[] = [];
  const totalCells = state.config.rows * state.config.cols;
  const linkedHalos = getLinkedHalos();
  const effectiveHaloKinds = getEffectiveHaloKinds(linkedHalos.length);

  if (state.halos.length === 0) {
    errors.push("至少需要导入或保留 1 张 Halo 图片。");
  }

  if (state.charas.length === 0) {
    errors.push("至少需要导入或保留 1 张 Chara 图片。");
  }

  if (state.charas.some((chara) => !chara.haloId)) {
    errors.push("仍有 Chara 没有关联 Halo，请先在工作台中完成映射。");
  }

  if (totalCells % 2 !== 0) {
    errors.push("方格空间的总格数必须为偶数，否则无法成对消除。");
  }

  if (linkedHalos.length === 0) {
    errors.push("至少需要建立 1 组 Halo-Chara 对应关系。");
  }

  if (state.config.haloKindsMode === "manual" && state.config.haloKinds > linkedHalos.length) {
    errors.push("出现的 Halo 种类不能超过已建立映射的 Halo 数量。");
  }

  if (state.config.haloKindsMode === "manual" && state.config.haloKinds > totalCells / 2) {
    errors.push("当前棋盘过小，无法让所选 Halo 种类至少各出现 1 次。");
  }

  if (effectiveHaloKinds < 1) {
    errors.push("当前没有可用于开局的 Halo 种类。");
  }

  if (state.config.maxCharasPerHalo < 1) {
    errors.push("单个 Halo 至少需要允许 1 种 Chara 配对。");
  }

  return errors;
}

function createBoard(): BoardCell[] {
  const totalPairs = (state.config.rows * state.config.cols) / 2;
  const linkedHalos = getLinkedHalos();
  const effectiveHaloKinds = getEffectiveHaloKinds(linkedHalos.length);
  const selectedHalos = sampleMany(
    linkedHalos,
    Math.min(effectiveHaloKinds, linkedHalos.length),
  ).map((entry) => ({
    halo: entry.halo,
    charas: sampleMany(
      entry.charas,
      Math.min(entry.charas.length, state.config.maxCharasPerHalo),
    ),
  }));

  const pairEntries: Array<{ halo: HaloAsset; chara: CharaAsset }> = [];

  selectedHalos.forEach((entry) => {
    const chara = entry.charas[Math.floor(Math.random() * entry.charas.length)];
    pairEntries.push({ halo: entry.halo, chara });
  });

  while (pairEntries.length < totalPairs) {
    const entry = selectedHalos[Math.floor(Math.random() * selectedHalos.length)];
    const chara = entry.charas[Math.floor(Math.random() * entry.charas.length)];
    pairEntries.push({ halo: entry.halo, chara });
  }

  const cells = pairEntries.flatMap((pair, index) => [
    {
      id: `halo-cell-${index}-${crypto.randomUUID()}`,
      assetId: pair.halo.id,
      haloId: pair.halo.id,
      name: pair.halo.name,
      src: pair.halo.src,
      kind: "halo" as const,
      removed: false,
    },
    {
      id: `chara-cell-${index}-${crypto.randomUUID()}`,
      assetId: pair.chara.id,
      haloId: pair.halo.id,
      name: pair.chara.name,
      src: pair.chara.src,
      kind: "chara" as const,
      removed: false,
    },
  ]);

  return shuffle(cells);
}

function startGame(): void {
  const errors = validateGameSetup();
  if (errors.length > 0) {
    setNotice("error", errors[0]);
    syncNotice();
    return;
  }

  state.board = createBoard();
  state.phase = "playing";
  state.selectedCellId = null;
  state.hintedCellIds = [];
  state.moves = 0;
  state.matches = 0;
  startGameTimer();
  setNotice("success", "棋盘已部署。点击 1 个 Chara 和 1 个 Halo，若它们有映射关系即可消除。");
  void playAudioCue("start", { loop: true });
  syncUiPreserveScroll();
}

function openWorkbench(): void {
  state.isWorkbenchOpen = true;
  syncUiPreserveScroll({ stage: false });
}

function closeWorkbench(): void {
  state.isWorkbenchOpen = false;
  state.selectedHaloId = null;
  syncUiPreserveScroll({ stage: false });
}

function openHaloCharaModal(haloId: string): void {
  state.selectedHaloId = haloId;
  syncHaloCharaModal();
}

function closeHaloCharaModal(): void {
  state.selectedHaloId = null;
  syncHaloCharaModal();
}

function switchAssetBankTab(tab: AssetBankTab): void {
  if (state.assetBankTab === tab) {
    return;
  }

  state.assetBankTab = tab;
  const searchInput = root.querySelector<HTMLInputElement>('[data-search-kind="halo"], [data-search-kind="chara"]');
  if (searchInput) {
    searchInput.value = state.assetBankSearch[tab];
  }
  syncAssetBankPanel();
}

function setAssetAliasValue(kind: AssetBankTab, assetId: string, alias: string): void {
  if (kind === "halo") {
    state.halos = state.halos.map((halo) => (halo.id === assetId ? { ...halo, alias } : halo));
  } else {
    state.charas = state.charas.map((chara) =>
      chara.id === assetId ? { ...chara, alias } : chara,
    );
  }
}

function commitAssetAlias(kind: AssetBankTab, assetId: string, alias: string): void {
  setAssetAliasValue(kind, assetId, alias);
  persistWorkspace();
  if (state.selectedHaloId) {
    syncHaloCharaContent();
  }
  syncAssetBankPanel();
}

function updateAssetSearch(kind: AssetBankTab, keyword: string): void {
  state.assetBankSearch[kind] = keyword;
  state.pagers[kind].page = 1;
  syncAssetBankPanel();
}

function updateHaloCharaSearch(keyword: string): void {
  state.haloCharaSearch = keyword;
  state.pagers["halo-chara-linked"].page = 1;
  state.pagers["halo-chara-unlinked"].page = 1;
  syncHaloCharaContent();
}

function updatePagerPage(
  pagerKey: "halo" | "chara" | "halo-chara-linked" | "halo-chara-unlinked",
  page: number,
): void {
  state.pagers[pagerKey].page = Math.max(1, page);
  if (pagerKey === "halo" || pagerKey === "chara") {
    syncAssetBankPanel();
    return;
  }

  syncHaloCharaContent();
}

function movePagerToLastPage(
  pagerKey: "halo" | "chara" | "halo-chara-linked" | "halo-chara-unlinked",
  totalItems: number,
): void {
  state.pagers[pagerKey].page = Math.max(1, Math.ceil(totalItems / state.pagers[pagerKey].pageSize));
}

function restartGame(): void {
  startGame();
}

function handleCellSelection(cellId: string): void {
  if (state.phase !== "playing") {
    return;
  }

  const currentCell = state.board.find((cell) => cell.id === cellId);
  if (!currentCell || currentCell.removed) {
    return;
  }

  void playAudioCue("click");

  if (state.selectedCellId === cellId) {
    state.selectedCellId = null;
    cancelTutorialHint();
    setNotice("info", "已取消当前选择。");
    syncBoardState();
    syncNotice();
    return;
  }

  if (!state.selectedCellId) {
    state.selectedCellId = cellId;
    state.hintedCellIds = [];
    scheduleTutorialHint();
    setNotice(
      "info",
      `已选中 ${currentCell.kind === "chara" ? "Chara" : "Halo"}：${currentCell.name}`,
    );
    syncBoardState();
    syncNotice();
    return;
  }

  const previousCell = state.board.find((cell) => cell.id === state.selectedCellId);
  if (!previousCell || previousCell.removed) {
    state.selectedCellId = cellId;
    state.hintedCellIds = [];
    scheduleTutorialHint();
    syncBoardState();
    return;
  }

  state.moves += 1;
  cancelTutorialHint();

  const charaCell =
    previousCell.kind === "chara"
      ? previousCell
      : currentCell.kind === "chara"
        ? currentCell
        : null;

  const haloCell =
    previousCell.kind === "halo"
      ? previousCell
      : currentCell.kind === "halo"
        ? currentCell
        : null;

  if (charaCell && haloCell && charaCell.haloId === haloCell.assetId) {
    previousCell.removed = true;
    currentCell.removed = true;
    state.selectedCellId = null;
    state.hintedCellIds = [];
    state.matches += 1;

    const remainingCells = state.board.filter((cell) => !cell.removed).length;
    if (remainingCells === 0) {
      state.phase = "won";
      updateElapsedTime();
      stopGameTimer();
      setNotice("success", `全部清空，通关完成。共尝试 ${state.moves} 次配对，用时 ${formatElapsedTime(state.elapsedMs)}。`);
      void playAudioCue("finish");
      void launchWinConfetti();
    } else {
      setNotice("success", `配对成功：${charaCell.name} 与 ${haloCell.name} 已消除。`);
      void playAudioCue("match");
    }
  } else {
    state.selectedCellId = cellId;
    state.hintedCellIds = [];
    scheduleTutorialHint();
    setNotice("error", "这两个图片不存在对应关系，请重新选择。");
  }

  syncBoardState();
  syncNotice();
}

async function importFiles(kind: "halo" | "chara", files: FileList, haloId?: string): Promise<void> {
  const imageFiles = Array.from(files).filter((file) => file.type.startsWith("image/"));
  const imported = await Promise.all(
    imageFiles.map(async (file) => ({
      id: crypto.randomUUID(),
      name: file.name.replace(/\.[^.]+$/, ""),
      alias: "",
      src: await blobToDataUrl(file),
      source: "upload" as const,
      persistMode: "inline" as const,
    })),
  );

  if (imported.length === 0) {
    setNotice("error", "没有读取到可用图片，请确认选择的是图片文件。");
    syncNotice();
    return;
  }

  if (kind === "halo") {
    state.halos = [...state.halos, ...imported];
    movePagerToLastPage("halo", state.halos.length);
    setNotice("success", `已导入 ${imported.length} 张 Halo 图片。`);
  } else {
    state.charas = [
      ...state.charas,
      ...imported.map((asset) => ({ ...asset, haloId: haloId ?? null })),
    ];
    if (haloId && state.selectedHaloId === haloId) {
      movePagerToLastPage("halo-chara-linked", state.charas.filter((chara) => chara.haloId === haloId).length);
    } else if (haloId) {
      movePagerToLastPage("chara", state.charas.length);
    } else {
      movePagerToLastPage("chara", state.charas.length);
      movePagerToLastPage(
        "halo-chara-unlinked",
        state.charas.filter((chara) => !chara.haloId).length,
      );
    }
    setNotice(
      "success",
      haloId
        ? `已为当前 Halo 导入 ${imported.length} 张 Chara 图片。`
        : `已导入 ${imported.length} 张 Chara 图片，请为它们设置对应 Halo。`,
    );
  }

  stopAudioCueGroup("start");
  state.phase = "setup";
  persistWorkspace();
  if (kind === "chara" && haloId && state.selectedHaloId === haloId) {
    syncNotice();
    syncHaloCharaModal();
    syncAssetBankPanel();
    return;
  }

  syncUiPreserveScroll();
}

function removeHalo(haloId: string): void {
  stopAudioCueGroup("start");
  const target = state.halos.find((halo) => halo.id === haloId);
  if (!target) {
    return;
  }

  if (target.source === "upload") {
    URL.revokeObjectURL(target.src);
  }

  state.halos = state.halos.filter((halo) => halo.id !== haloId);
  state.charas = state.charas.map((chara) =>
    chara.haloId === haloId ? { ...chara, haloId: null } : chara,
  );
  state.phase = "setup";
  setNotice("info", `已移除 Halo：${target.name}。原先关联到它的 Chara 已解除映射。`);
  persistWorkspace();
  syncUiPreserveScroll();
}

function removeChara(charaId: string): void {
  const target = state.charas.find((chara) => chara.id === charaId);
  if (!target) {
    return;
  }

  if (target.haloId) {
    setNotice("error", "当前 Chara 仍在被 Halo 引用，请先解绑后再删除。");
    syncNotice();
    return;
  }

  if (target.source === "upload") {
    URL.revokeObjectURL(target.src);
  }

  stopAudioCueGroup("start");
  state.charas = state.charas.filter((chara) => chara.id !== charaId);
  state.phase = "setup";
  setNotice("info", `已移除 Chara：${target.name}。`);
  persistWorkspace();
  syncUiPreserveScroll();
}

function updateConfigValue(key: keyof GameConfig, rawValue: string): void {
  if (key === "tutorialMode") {
    state.config.tutorialMode = rawValue === "true";
    if (!state.config.tutorialMode) {
      cancelTutorialHint();
    } else if (state.selectedCellId) {
      scheduleTutorialHint();
    }
    persistWorkspace();
    stopAudioCueGroup("start");
    syncUiPreserveScroll();
    return;
  }

  if (key === "haloKindsMode") {
    state.config.haloKindsMode = rawValue === "maximize" ? "maximize" : "manual";
    persistWorkspace();
    stopAudioCueGroup("start");
    syncUiPreserveScroll();
    return;
  }

  const numeric = Number(rawValue);
  if (!Number.isFinite(numeric)) {
    return;
  }

  const ranges: Record<Exclude<keyof GameConfig, "haloKindsMode" | "tutorialMode">, [number, number]> = {
    rows: [2, 12],
    cols: [2, 12],
    haloKinds: [1, Number.MAX_SAFE_INTEGER],
    maxCharasPerHalo: [1, 12],
  };

  state.config[key] = clamp(Math.round(numeric), ranges[key][0], ranges[key][1]);
  persistWorkspace();
  stopAudioCueGroup("start");
  syncUiPreserveScroll();
}

function updateCharaRelation(charaId: string, haloId: string): void {
  stopAudioCueGroup("start");
  state.charas = state.charas.map((chara) =>
    chara.id === charaId ? { ...chara, haloId: haloId || null } : chara,
  );
  state.phase = "setup";
  setNotice("info", "Chara 与 Halo 的对应关系已更新。");
  persistWorkspace();
  syncUiPreserveScroll();
}

function updateThemeValue(key: keyof ThemeConfig, value: string): void {
  state.theme[key] = value;
  applyTheme();
  persistWorkspace();
}

function captureScrollSnapshot(): ScrollSnapshot {
  const snapshot: ScrollSnapshot = {
    windowX: window.scrollX,
    windowY: window.scrollY,
    modalScrollTop: {},
  };

  const workbenchModal = root.querySelector<HTMLElement>('[data-role="workbench-modal"]');
  if (workbenchModal) {
    snapshot.modalScrollTop.workbench = workbenchModal.scrollTop;
  }

  const haloCharaModal = root.querySelector<HTMLElement>('[data-role="halo-chara-modal-panel"]');
  if (haloCharaModal) {
    snapshot.modalScrollTop["halo-chara"] = haloCharaModal.scrollTop;
  }

  return snapshot;
}

function restoreScrollSnapshot(snapshot: ScrollSnapshot): void {
  window.scrollTo(snapshot.windowX, snapshot.windowY);

  const workbenchModal = root.querySelector<HTMLElement>('[data-role="workbench-modal"]');
  if (workbenchModal !== null && snapshot.modalScrollTop.workbench !== undefined) {
    workbenchModal.scrollTop = snapshot.modalScrollTop.workbench;
  }

  const haloCharaModal = root.querySelector<HTMLElement>('[data-role="halo-chara-modal-panel"]');
  if (haloCharaModal !== null && snapshot.modalScrollTop["halo-chara"] !== undefined) {
    haloCharaModal.scrollTop = snapshot.modalScrollTop["halo-chara"];
  }
}

function syncModalLayer(): void {
  if (!view.modalLayer) {
    return;
  }

  view.modalLayer.innerHTML = `${renderWorkbenchModal()}${renderHaloCharaModal()}`;
}

function syncAssetBankPanel(): void {
  const assetBankPanel = root.querySelector<HTMLElement>('[data-role="asset-bank-panel"]');
  if (!assetBankPanel) {
    return;
  }

  assetBankPanel.innerHTML = renderAssetBank(state.assetBankTab);
}

function syncHaloCharaModal(): void {
  const modalLayer = view.modalLayer;
  if (!modalLayer) {
    return;
  }

  const snapshot = captureScrollSnapshot();
  const haloCharaModal = modalLayer.querySelector<HTMLElement>('[data-role="halo-chara-modal"]');
  const markup = renderHaloCharaModal();

  if (!markup) {
    haloCharaModal?.remove();
    restoreScrollSnapshot(snapshot);
    return;
  }

  if (haloCharaModal) {
    haloCharaModal.outerHTML = markup;
  } else {
    modalLayer.insertAdjacentHTML("beforeend", markup);
  }

  restoreScrollSnapshot(snapshot);
}

function renderHaloCharaContent(): string {
  if (!state.selectedHaloId) {
    return "";
  }

  const halo = state.halos.find((item) => item.id === state.selectedHaloId);
  if (!halo) {
    return "";
  }

  const linkedCharas = state.charas.filter(
    (chara) => chara.haloId === halo.id && matchesAssetSearch(chara, state.haloCharaSearch),
  );
  const unlinkedCharas = state.charas.filter(
    (chara) => !chara.haloId && matchesAssetSearch(chara, state.haloCharaSearch),
  );
  const pagedLinkedCharas = paginateItems(linkedCharas, state.pagers["halo-chara-linked"]);
  const pagedUnlinkedCharas = paginateItems(unlinkedCharas, state.pagers["halo-chara-unlinked"]);
  state.pagers["halo-chara-linked"].page = pagedLinkedCharas.page;
  state.pagers["halo-chara-unlinked"].page = pagedUnlinkedCharas.page;

  return `
    <section class="bench-section">
      <div class="section-head">
        <p class="eyebrow">Linked Chara</p>
        <h3>为当前 Halo 管理 Chara</h3>
      </div>
      ${
        linkedCharas.length === 0
          ? `<p class="empty-copy">当前 Halo 还没有绑定任何 Chara。</p>`
          : `
            <div class="mapping-list">
              ${pagedLinkedCharas.items
                .map(
                  (chara) => `
                    <article class="mapping-row compact-row">
                      <img src="${chara.src}" alt="${getAssetDisplayName(chara)}" loading="lazy" />
                      <div class="mapping-copy">
                        <strong>${getAssetDisplayName(chara)}</strong>
                        <span>原名：${chara.name} · ${chara.source === "upload" ? "本地导入" : "演示素材"}</span>
                      </div>
                      <label class="alias-field">
                        <span>筛选别名</span>
                        <input type="text" value="${chara.alias}" data-asset-alias-kind="chara" data-asset-alias-id="${chara.id}" placeholder="仅用于搜索与筛选" />
                      </label>
                      <button class="ghost-button subtle-button" type="button" data-unlink-chara="${chara.id}">
                        解除绑定
                      </button>
                      <button class="ghost-button danger-button" type="button" data-remove-chara="${chara.id}">
                        移除
                      </button>
                    </article>
                  `,
                )
                .join("")}
            </div>
            ${renderPagination("halo-chara-linked", linkedCharas.length)}
          `
      }
    </section>

    <section class="bench-section">
      <div class="section-head">
        <p class="eyebrow">Unlinked</p>
        <h3>从未绑定 Chara 中加入</h3>
      </div>
      ${
        unlinkedCharas.length === 0
          ? `<p class="empty-copy">当前没有未绑定的 Chara。</p>`
          : `
            <div class="mapping-list">
              ${pagedUnlinkedCharas.items
                .map(
                  (chara) => `
                    <article class="mapping-row compact-row">
                      <img src="${chara.src}" alt="${getAssetDisplayName(chara)}" loading="lazy" />
                      <div class="mapping-copy">
                        <strong>${getAssetDisplayName(chara)}</strong>
                        <span>原名：${chara.name} · ${chara.source === "upload" ? "本地导入" : "演示素材"}</span>
                      </div>
                      <label class="alias-field">
                        <span>筛选别名</span>
                        <input type="text" value="${chara.alias}" data-asset-alias-kind="chara" data-asset-alias-id="${chara.id}" placeholder="仅用于搜索与筛选" />
                      </label>
                      <div class="action-row">
                        <button class="primary-button compact-action" type="button" data-bind-chara="${chara.id}" data-bind-halo="${halo.id}">
                          绑定到当前 Halo
                        </button>
                        <button class="ghost-button danger-button compact-action" type="button" data-remove-chara="${chara.id}">
                          删除
                        </button>
                      </div>
                    </article>
                  `,
                )
                .join("")}
            </div>
            ${renderPagination("halo-chara-unlinked", unlinkedCharas.length)}
          `
      }
    </section>
  `;
}

function syncHaloCharaContent(): void {
  const haloCharaContent = root.querySelector<HTMLElement>('[data-role="halo-chara-content"]');
  if (!haloCharaContent) {
    return;
  }

  haloCharaContent.innerHTML = renderHaloCharaContent();
}

function syncStage(): void {
  if (!view.stage) {
    return;
  }

  view.stage.innerHTML = renderBoard();
  view.boardGrid = root.querySelector<HTMLDivElement>('[data-role="board-grid"]');
  view.selectionChip = root.querySelector<HTMLDivElement>('[data-role="selection-chip"]');
  view.statsMoves = root.querySelector<HTMLSpanElement>('[data-role="stats-moves"]');
  view.statsMatches = root.querySelector<HTMLSpanElement>('[data-role="stats-matches"]');
  view.statsRemain = root.querySelector<HTMLSpanElement>('[data-role="stats-remain"]');
  view.stageTitle = root.querySelector<HTMLHeadingElement>('[data-role="stage-title"]');
  view.timerToast = root.querySelector<HTMLButtonElement>('[data-role="timer-toast"]');
  view.timerToastTime = root.querySelector<HTMLSpanElement>('[data-role="timer-toast-time"]');
  view.timerToastHint = root.querySelector<HTMLSpanElement>('[data-role="timer-toast-hint"]');
  syncTimerToast();
}

function syncUiPreserveScroll(options?: { stage?: boolean; modal?: boolean; notice?: boolean }): void {
  const snapshot = captureScrollSnapshot();
  const useStage = options?.stage ?? true;
  const useModal = options?.modal ?? true;
  const useNotice = options?.notice ?? true;

  if (useNotice) {
    syncNotice();
  }

  if (useStage) {
    syncStage();
  }

  if (useModal) {
    syncModalLayer();
  }

  restoreScrollSnapshot(snapshot);
}

function renderAssetBank(kind: "halo" | "chara"): string {
  if (kind === "halo") {
    const filteredHalos = state.halos.filter((halo) =>
      matchesAssetSearch(halo, state.assetBankSearch.halo),
    );
    const pagedHalos = paginateItems(filteredHalos, state.pagers.halo);
    state.pagers.halo.page = pagedHalos.page;
    return state.halos.length === 0
      ? `<p class="empty-copy">尚未加载 Halo 图片。</p>`
      : filteredHalos.length === 0
        ? `<p class="empty-copy">没有匹配当前搜索的 Halo。</p>`
      : `
        <div class="asset-bank-grid">
          ${pagedHalos.items
            .map((halo) => {
              const linkedCount = state.charas.filter((chara) => chara.haloId === halo.id).length;
              return `
                <article class="asset-row">
                  <img src="${halo.src}" alt="${getAssetDisplayName(halo)}" loading="lazy" />
                  <div class="asset-meta">
                    <strong>${getAssetDisplayName(halo)}</strong>
                    <span>原名：${halo.name} · ${linkedCount} 个 Chara 对应</span>
                  </div>
                  <label class="alias-field">
                    <span>筛选别名</span>
                    <input type="text" value="${halo.alias}" data-asset-alias-kind="halo" data-asset-alias-id="${halo.id}" placeholder="仅用于搜索与筛选" />
                  </label>
                  <button class="ghost-button" type="button" data-manage-halo="${halo.id}">
                    管理 Chara
                  </button>
                  <button class="ghost-button danger-button" type="button" data-remove-halo="${halo.id}">
                    移除
                  </button>
                </article>
              `;
            })
            .join("")}
        </div>
        ${renderPagination("halo", filteredHalos.length)}
      `;
  }

  const filteredCharas = state.charas.filter((chara) =>
    matchesAssetSearch(chara, state.assetBankSearch.chara),
  );
  const pagedCharas = paginateItems(filteredCharas, state.pagers.chara);
  state.pagers.chara.page = pagedCharas.page;
  return state.charas.length === 0
    ? `<p class="empty-copy">尚未加载 Chara 图片。</p>`
    : filteredCharas.length === 0
      ? `<p class="empty-copy">没有匹配当前搜索的 Chara。</p>`
    : `
      <div class="mapping-list">
        ${pagedCharas.items
          .map((chara) => {
            const canRemove = !chara.haloId;
            return `
              <article class="mapping-row compact-row">
                <img src="${chara.src}" alt="${getAssetDisplayName(chara)}" loading="lazy" />
                <div class="mapping-copy">
                  <strong>${getAssetDisplayName(chara)}</strong>
                  <span>原名：${chara.name} · ${chara.source === "upload" ? "本地导入" : "演示素材"}${chara.haloId ? " · 已绑定" : " · 未绑定"}</span>
                </div>
                <label class="alias-field">
                  <span>筛选别名</span>
                  <input type="text" value="${chara.alias}" data-asset-alias-kind="chara" data-asset-alias-id="${chara.id}" placeholder="仅用于搜索与筛选" />
                </label>
                <label class="select-wrap">
                  <span>对应 Halo</span>
                  <select data-chara-id="${chara.id}">
                    <option value="">未设置</option>
                    ${state.halos
                      .map(
                        (halo) => `
                          <option value="${halo.id}" ${chara.haloId === halo.id ? "selected" : ""}>
                            ${getAssetDisplayName(halo)}
                          </option>
                        `,
                      )
                      .join("")}
                  </select>
                </label>
                ${
                  canRemove
                    ? `<button class="ghost-button danger-button" type="button" data-remove-chara="${chara.id}">
                        移除
                      </button>`
                    : `<span class="row-note">已绑定 Chara 需先解绑后删除</span>`
                }
              </article>
            `;
          })
          .join("")}
      </div>
      ${renderPagination("chara", filteredCharas.length)}
    `;
}

function renderHaloCharaModal(): string {
  if (!state.selectedHaloId) {
    return "";
  }

  const halo = state.halos.find((item) => item.id === state.selectedHaloId);
  if (!halo) {
    return "";
  }

  return `
    <div class="modal-shell secondary-modal" data-role="halo-chara-modal">
      <div class="modal-backdrop" data-action="close-halo-chara"></div>
      <section class="workbench-modal halo-chara-modal" data-role="halo-chara-modal-panel" role="dialog" aria-modal="true" aria-label="Halo Chara 管理">
        <div class="modal-head">
          <div class="modal-title-with-thumb">
            <img src="${halo.src}" alt="${getAssetDisplayName(halo)}" />
            <div>
              <p class="eyebrow">Halo Manager</p>
              <h2>${getAssetDisplayName(halo)}</h2>
            </div>
          </div>
          <button class="ghost-button" type="button" data-action="close-halo-chara">关闭</button>
        </div>

        <div class="modal-body">
          <label class="search-field">
            <span>搜索 Chara</span>
            <input type="search" value="${state.haloCharaSearch}" data-search-kind="halo-chara" placeholder="按别名或原名筛选" />
          </label>
          <div class="pack-row">
            <label class="import-item pack-import-item">
              <div class="import-copy">
                <span>上传 Chara 图片</span>
                <small>上传后会自动绑定到当前 Halo</small>
              </div>
              <input type="file" accept="image/*" multiple data-halo-chara-input="${halo.id}" />
              <em>选择文件</em>
            </label>
          </div>
          <div data-role="halo-chara-content">
            ${renderHaloCharaContent()}
          </div>
        </div>
      </section>
    </div>
  `;
}

function renderWorkbenchModal(): string {
  const linkedHalos = getLinkedHalos();
  const totalCells = state.config.rows * state.config.cols;
  const evenStatus = totalCells % 2 === 0 ? "可开局" : "需调整为偶数格";
  const effectiveHaloKinds = getEffectiveHaloKinds(linkedHalos.length);

  if (!state.isWorkbenchOpen) {
    return "";
  }

  return `
    <div class="modal-shell" data-role="modal-shell">
      <div class="modal-backdrop" data-action="close-workbench"></div>
      <section class="workbench-modal" data-role="workbench-modal" role="dialog" aria-modal="true" aria-label="游戏工作台">
        <div class="modal-head">
          <div>
            <p class="eyebrow">Workbench</p>
            <h2>素材、规则与主题</h2>
          </div>
          <button class="ghost-button" type="button" data-action="close-workbench">关闭</button>
        </div>

        <div class="modal-body">
          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Assets</p>
              <h3>素材导入</h3>
            </div>
            <div class="pack-row">
              <button class="ghost-button" type="button" data-action="export-pack">导出素材包</button>
              <label class="import-item pack-import-item">
                <div class="import-copy">
                  <span>导入素材包</span>
                  <small>读取 zip 内配置和图片</small>
                </div>
                <input type="file" accept=".zip,application/zip" data-pack-input="workspace" />
                <em>选择文件</em>
              </label>
            </div>
            <div class="import-grid">
              <label class="import-item">
                <div class="import-copy">
                  <span>导入 Halo 图片</span>
                  <small>支持多选</small>
                </div>
                <input type="file" accept="image/*" multiple data-input="halo-files" />
                <em>选择文件</em>
              </label>
              <label class="import-item">
                <div class="import-copy">
                  <span>导入 Chara 图片</span>
                  <small>导入后绑定 Halo</small>
                </div>
                <input type="file" accept="image/*" multiple data-input="chara-files" />
                <em>选择文件</em>
              </label>
            </div>
            <div class="bank-head">
              <h3>${state.assetBankTab === "halo" ? "Halo 素材仓" : "Chara 素材仓"}</h3>
              <button class="ghost-button" type="button" data-action="reset-demo">恢复演示素材</button>
            </div>
            <div class="bank-switch" role="tablist" aria-label="素材仓切换">
              <button class="${state.assetBankTab === "halo" ? "primary-button" : "ghost-button"} compact-action" type="button" data-bank-tab="halo" aria-pressed="${state.assetBankTab === "halo"}">
                Halo
              </button>
              <button class="${state.assetBankTab === "chara" ? "primary-button" : "ghost-button"} compact-action" type="button" data-bank-tab="chara" aria-pressed="${state.assetBankTab === "chara"}">
                Chara
              </button>
            </div>
            <label class="search-field">
              <span>搜索 ${state.assetBankTab === "halo" ? "Halo" : "Chara"}</span>
              <input type="search" value="${state.assetBankSearch[state.assetBankTab]}" data-search-kind="${state.assetBankTab}" placeholder="按别名或原名筛选" />
            </label>
            <div data-role="asset-bank-panel">
              ${renderAssetBank(state.assetBankTab)}
            </div>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Rules</p>
              <h3>游戏参数</h3>
            </div>
            <div class="config-grid">
              <label class="field">
                <span>网格高度</span>
                <input type="number" min="2" max="12" value="${state.config.rows}" data-config-key="rows" />
              </label>
              <label class="field">
                <span>网格宽度</span>
                <input type="number" min="2" max="12" value="${state.config.cols}" data-config-key="cols" />
              </label>
              <label class="field">
                <span>出现 Halo 种类</span>
                <select data-config-key="haloKindsMode">
                  <option value="manual" ${state.config.haloKindsMode === "manual" ? "selected" : ""}>手动指定</option>
                  <option value="maximize" ${state.config.haloKindsMode === "maximize" ? "selected" : ""}>尽可能多</option>
                </select>
              </label>
              <label class="field">
                <span>手动 Halo 种类</span>
                <input type="number" min="1" value="${state.config.haloKinds}" data-config-key="haloKinds" ${state.config.haloKindsMode === "maximize" ? "disabled" : ""} />
              </label>
              <label class="field">
                <span>单 Halo 最多 Chara 种类</span>
                <input type="number" min="1" max="12" value="${state.config.maxCharasPerHalo}" data-config-key="maxCharasPerHalo" />
              </label>
              <label class="field">
                <span>新手模式</span>
                <select data-config-key="tutorialMode">
                  <option value="true" ${state.config.tutorialMode ? "selected" : ""}>开启</option>
                  <option value="false" ${!state.config.tutorialMode ? "selected" : ""}>关闭</option>
                </select>
              </label>
            </div>
            <p class="field-hint">
              当前总格数为 <strong>${totalCells}</strong>，状态：<strong>${evenStatus}</strong>。本局将使用 <strong>${effectiveHaloKinds}</strong> 种 Halo。
            </p>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Theme</p>
              <h3>界面颜色与背景</h3>
            </div>
            <div class="config-grid">
              <label class="field color-field">
                <span>App 主色</span>
                <input type="color" value="${state.theme.appColor}" data-theme-key="appColor" />
              </label>
              <label class="field color-field">
                <span>标题字色</span>
                <input type="color" value="${state.theme.headingColor}" data-theme-key="headingColor" />
              </label>
              <label class="field color-field">
                <span>说明字色</span>
                <input type="color" value="${state.theme.mutedTextColor}" data-theme-key="mutedTextColor" />
              </label>
              <label class="field color-field">
                <span>弱提示字色</span>
                <input type="color" value="${state.theme.softTextColor}" data-theme-key="softTextColor" />
              </label>
              <label class="field color-field">
                <span>主按钮字色</span>
                <input type="color" value="${state.theme.buttonTextColor}" data-theme-key="buttonTextColor" />
              </label>
              <label class="field color-field">
                <span>主高亮色</span>
                <input type="color" value="${state.theme.accentColor}" data-theme-key="accentColor" />
              </label>
              <label class="field color-field">
                <span>候选发光色</span>
                <input type="color" value="${state.theme.candidateGlow}" data-theme-key="candidateGlow" />
              </label>
              <label class="field color-field">
                <span>面板底色</span>
                <input type="color" value="${state.theme.panelTint}" data-theme-key="panelTint" />
              </label>
              <label class="field color-field">
                <span>背景起始色</span>
                <input type="color" value="${state.theme.backgroundStart}" data-theme-key="backgroundStart" />
              </label>
              <label class="field color-field">
                <span>背景结束色</span>
                <input type="color" value="${state.theme.backgroundEnd}" data-theme-key="backgroundEnd" />
              </label>
            </div>
            <div class="theme-image-row">
              <label class="import-item theme-image-item">
                <div class="import-copy">
                  <span>App 背景图片</span>
                  <small>${state.theme.backgroundImage ? "已加载 1 张背景图" : "当前未设置背景图"}</small>
                </div>
                <input type="file" accept="image/*" data-theme-image="background" />
                <em>选择图片</em>
              </label>
              <button class="ghost-button" type="button" data-action="clear-theme-background">清除背景图</button>
            </div>
          </section>

          <section class="bench-section">
            <div class="section-head">
              <p class="eyebrow">Audio</p>
              <h3>音乐与音效</h3>
            </div>
            <div class="audio-config-grid">
              ${(["start", "click", "match", "finish"] as AudioCueKey[]).map((cue) => renderAudioConfigCard(cue)).join("")}
            </div>
            <p class="field-hint">
              支持在工作台中分别设置开始、点击、连接成功、结束四个时机的音频，这些设置会跟随素材包一起导出和导入。
            </p>
          </section>

        </div>
      </section>
    </div>
  `;
}

function renderBoard(): string {
  if (state.phase === "setup") {
    const linkedHalos = getLinkedHalos();
    return `
      <section class="stage stage-idle">
        <div class="stage-metrics">
          <div>
            <strong>${state.halos.length}</strong>
            <span>Halo 素材</span>
          </div>
          <div>
            <strong>${state.charas.length}</strong>
            <span>Chara 素材</span>
          </div>
          <div>
            <strong>${linkedHalos.length}</strong>
            <span>可用映射 Halo</span>
          </div>
        </div>
      </section>
    `;
  }

  const remainingCells = state.board.filter((cell) => !cell.removed).length;
  const selectedCell = state.selectedCellId
    ? state.board.find((cell) => cell.id === state.selectedCellId) ?? null
    : null;
  const targetKind = selectedCell
    ? selectedCell.kind === "chara"
      ? "halo"
      : "chara"
    : null;

  return `
    <section class="stage">
      <div class="stage-topbar">
        <div>
          <p class="eyebrow">In Match</p>
          <h2 data-role="stage-title">${state.phase === "won" ? "全部清空" : "点选配对中"}</h2>
        </div>
        <div class="stage-stats">
          <span data-role="stats-moves">尝试 ${state.moves}</span>
          <span data-role="stats-matches">成功 ${state.matches}</span>
          <span data-role="stats-remain">剩余 ${remainingCells / 2} 对</span>
        </div>
      </div>
      <div class="selection-chip ${selectedCell ? "is-active" : ""}" data-role="selection-chip">
        ${
          selectedCell
            ? `
              <span>当前选择</span>
              <strong>${selectedCell.kind === "chara" ? "Chara" : "Halo"}</strong>
              <small>请选择另一类小方格</small>
            `
            : `
              <span>等待选择</span>
              <strong>任意小方格</strong>
              <small>一张 Chara 配一张 Halo</small>
            `
        }
      </div>
      <div class="board-grid" data-role="board-grid" style="--board-columns: ${state.config.cols};">
        ${state.board
          .map((cell) => {
            const isSelected = state.selectedCellId === cell.id;
            const isCandidate =
              !cell.removed &&
              !!selectedCell &&
              !isSelected &&
              cell.kind === targetKind;
            const isHinted = state.hintedCellIds.includes(cell.id);
            const isHintMuted =
              state.hintedCellIds.length > 0 &&
              !cell.removed &&
              !isSelected &&
              !isHinted;
            const classes = [
              "board-cell",
              cell.removed ? "is-removed" : "",
              isSelected ? "is-selected" : "",
              isCandidate ? "is-candidate" : "",
              isHinted ? "is-hinted" : "",
              isHintMuted ? "is-hint-muted" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return `
              <button
                class="${classes}"
                type="button"
                data-cell-id="${cell.id}"
                aria-label="${cell.kind === "halo" ? "Halo" : "Chara"}"
                ${cell.removed || state.phase === "won" ? "disabled" : ""}
              >
                <img src="${cell.src}" alt="${cell.name}" loading="lazy" />
              </button>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

function syncNotice(): void {
  if (!view.notice) {
    return;
  }

  view.notice.className = `notice notice-${state.notice.tone}`;
  view.notice.innerHTML = `<p>${state.notice.text}</p>`;
}

function syncBoardState(): void {
  if (!view.boardGrid || !view.selectionChip || !view.statsMoves || !view.statsMatches || !view.statsRemain || !view.stageTitle) {
    return;
  }

  const selectedCell = state.selectedCellId
    ? state.board.find((cell) => cell.id === state.selectedCellId) ?? null
    : null;
  const targetKind = selectedCell
    ? selectedCell.kind === "chara"
      ? "halo"
      : "chara"
    : null;
  const remainingPairs = state.board.filter((cell) => !cell.removed).length / 2;

  view.stageTitle.textContent = state.phase === "won" ? "全部清空" : "点选配对中";
  view.statsMoves.textContent = `尝试 ${state.moves}`;
  view.statsMatches.textContent = `成功 ${state.matches}`;
  view.statsRemain.textContent = `剩余 ${remainingPairs} 对`;
  syncTimerToast();

  view.selectionChip.classList.toggle("is-active", !!selectedCell);
  view.selectionChip.innerHTML = selectedCell
    ? `
        <span>当前选择</span>
        <strong>${selectedCell.kind === "chara" ? "Chara" : "Halo"}</strong>
        <small>请选择另一类小方格</small>
      `
    : `
        <span>等待选择</span>
        <strong>任意小方格</strong>
        <small>一张 Chara 配一张 Halo</small>
      `;

  const buttons = Array.from(view.boardGrid.querySelectorAll<HTMLButtonElement>("[data-cell-id]"));
  buttons.forEach((button) => {
    const cellId = button.dataset.cellId;
    const cell = state.board.find((item) => item.id === cellId);

    if (!cell) {
      return;
    }

    const isSelected = state.selectedCellId === cell.id;
    const isCandidate =
      !cell.removed &&
      !!selectedCell &&
      !isSelected &&
      cell.kind === targetKind;
    const isHinted = state.hintedCellIds.includes(cell.id);
    const isHintMuted =
      state.hintedCellIds.length > 0 &&
      !cell.removed &&
      !isSelected &&
      !isHinted;

    button.classList.toggle("is-selected", isSelected);
    button.classList.toggle("is-candidate", isCandidate);
    button.classList.toggle("is-hinted", isHinted);
    button.classList.toggle("is-hint-muted", isHintMuted);
    button.classList.toggle("is-removed", cell.removed);
    button.disabled = cell.removed || state.phase === "won";
  });
}

function render(): void {
  root.innerHTML = `
    <main class="linkup-shell">
      <header class="game-topbar">
        <div class="topbar-copy">
          <a class="back-link" href="../">返回首页</a>
          <p class="eyebrow">Single-Player Local Web Game</p>
          <h1>${appTitle}</h1>
        </div>
        <div class="topbar-actions">
          <button class="ghost-button" type="button" data-action="open-workbench">工作台</button>
        </div>
      </header>

      <section class="game-screen">
        <div class="notice notice-${state.notice.tone}" data-role="notice">
          <p>${state.notice.text}</p>
        </div>
        <section class="play-stage" data-role="stage">
          ${renderBoard()}
        </section>
      </section>

      <div data-role="modal-layer">
        ${renderWorkbenchModal()}
        ${renderHaloCharaModal()}
      </div>
      <button class="timer-toast" type="button" data-role="timer-toast">
        <span class="timer-toast-time" data-role="timer-toast-time"></span>
        <span class="timer-toast-hint" data-role="timer-toast-hint"></span>
      </button>
    </main>
  `;

  view.notice = root.querySelector<HTMLDivElement>('[data-role="notice"]');
  view.stage = root.querySelector<HTMLElement>('[data-role="stage"]');
  view.modalLayer = root.querySelector<HTMLDivElement>('[data-role="modal-layer"]');
  view.boardGrid = root.querySelector<HTMLDivElement>('[data-role="board-grid"]');
  view.selectionChip = root.querySelector<HTMLDivElement>('[data-role="selection-chip"]');
  view.statsMoves = root.querySelector<HTMLSpanElement>('[data-role="stats-moves"]');
  view.statsMatches = root.querySelector<HTMLSpanElement>('[data-role="stats-matches"]');
  view.statsRemain = root.querySelector<HTMLSpanElement>('[data-role="stats-remain"]');
  view.stageTitle = root.querySelector<HTMLHeadingElement>('[data-role="stage-title"]');
  view.timerToast = root.querySelector<HTMLButtonElement>('[data-role="timer-toast"]');
  view.timerToastTime = root.querySelector<HTMLSpanElement>('[data-role="timer-toast-time"]');
  view.timerToastHint = root.querySelector<HTMLSpanElement>('[data-role="timer-toast-hint"]');
  applyTheme();
  syncTimerToast();
}

root.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const cellButton = target.closest<HTMLElement>("[data-cell-id]");
  const actionButton = target.closest<HTMLElement>("[data-action]");
  const bankTabButton = target.closest<HTMLElement>("[data-bank-tab]");
  const pageNavButton = target.closest<HTMLElement>("[data-page-nav]");
  const removeHaloButton = target.closest<HTMLElement>("[data-remove-halo]");
  const removeCharaButton = target.closest<HTMLElement>("[data-remove-chara]");
  const manageHaloButton = target.closest<HTMLElement>("[data-manage-halo]");
  const bindCharaButton = target.closest<HTMLElement>("[data-bind-chara]");
  const unlinkCharaButton = target.closest<HTMLElement>("[data-unlink-chara]");
  const timerToastButton = target.closest<HTMLElement>("[data-role='timer-toast']");

  if (cellButton?.dataset.cellId) {
    handleCellSelection(cellButton.dataset.cellId);
    return;
  }

  if (removeHaloButton?.dataset.removeHalo) {
    removeHalo(removeHaloButton.dataset.removeHalo);
    return;
  }

  if (removeCharaButton?.dataset.removeChara) {
    removeChara(removeCharaButton.dataset.removeChara);
    return;
  }

  if (manageHaloButton?.dataset.manageHalo) {
    openHaloCharaModal(manageHaloButton.dataset.manageHalo);
    return;
  }

  if (bankTabButton?.dataset.bankTab === "halo" || bankTabButton?.dataset.bankTab === "chara") {
    switchAssetBankTab(bankTabButton.dataset.bankTab);
    return;
  }

  if (
    pageNavButton?.dataset.pageNav &&
    pageNavButton.dataset.pageTarget &&
    (
      pageNavButton.dataset.pageNav === "halo" ||
      pageNavButton.dataset.pageNav === "chara" ||
      pageNavButton.dataset.pageNav === "halo-chara-linked" ||
      pageNavButton.dataset.pageNav === "halo-chara-unlinked"
    )
  ) {
    updatePagerPage(pageNavButton.dataset.pageNav, Number(pageNavButton.dataset.pageTarget));
    return;
  }

  if (bindCharaButton?.dataset.bindChara && bindCharaButton.dataset.bindHalo) {
    updateCharaRelation(bindCharaButton.dataset.bindChara, bindCharaButton.dataset.bindHalo);
    if (state.selectedHaloId === bindCharaButton.dataset.bindHalo) {
      syncHaloCharaModal();
    }
    return;
  }

  if (unlinkCharaButton?.dataset.unlinkChara) {
    updateCharaRelation(unlinkCharaButton.dataset.unlinkChara, "");
    if (state.selectedHaloId) {
      syncHaloCharaModal();
    }
    return;
  }

  if (timerToastButton) {
    if (state.phase === "setup") {
      startGame();
    } else if (state.phase === "won") {
      restartGame();
    }
    return;
  }

  switch (actionButton?.dataset.action) {
    case "start-game":
      startGame();
      break;
    case "restart-game":
      restartGame();
      break;
    case "return-setup":
    case "open-workbench":
      openWorkbench();
      break;
    case "close-workbench":
      closeWorkbench();
      break;
    case "close-halo-chara":
      closeHaloCharaModal();
      break;
    case "clear-theme-background":
      clearThemeBackgroundImage();
      break;
    case "preview-audio-cue":
      if (
        actionButton instanceof HTMLElement &&
        actionButton.dataset.audioCue &&
        (
          actionButton.dataset.audioCue === "start" ||
          actionButton.dataset.audioCue === "click" ||
          actionButton.dataset.audioCue === "match" ||
          actionButton.dataset.audioCue === "finish"
        )
      ) {
        void playAudioCue(actionButton.dataset.audioCue);
      }
      break;
    case "clear-audio-cue":
      if (
        actionButton instanceof HTMLElement &&
        actionButton.dataset.audioCue &&
        (
          actionButton.dataset.audioCue === "start" ||
          actionButton.dataset.audioCue === "click" ||
          actionButton.dataset.audioCue === "match" ||
          actionButton.dataset.audioCue === "finish"
        )
      ) {
        clearAudioCue(actionButton.dataset.audioCue);
      }
      break;
    case "export-pack":
      void downloadWorkspacePack();
      break;
    case "reset-demo":
      resetToDemoAssets();
      break;
    default:
      break;
  }
});

root.addEventListener("pointerdown", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("[data-role='timer-toast']") && state.phase === "playing") {
    beginRestartHold();
  }
});

root.addEventListener("pointerup", () => {
  cancelRestartHold();
});

root.addEventListener("pointercancel", () => {
  cancelRestartHold();
});

root.addEventListener("pointerleave", (event) => {
  const target = event.target;
  if (!(target instanceof Element)) {
    return;
  }

  if (target.closest("[data-role='timer-toast']")) {
    cancelRestartHold();
  }
});

root.addEventListener("change", (event) => {
  const target = event.target;

  if (target instanceof HTMLInputElement && target.dataset.input === "halo-files" && target.files) {
    void importFiles("halo", target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.input === "chara-files" && target.files) {
    void importFiles("chara", target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.haloCharaInput && target.files) {
    void importFiles("chara", target.files, target.dataset.haloCharaInput);
    target.value = "";
    return;
  }

  if ((target instanceof HTMLInputElement || target instanceof HTMLSelectElement) && target.dataset.configKey) {
    updateConfigValue(target.dataset.configKey as keyof GameConfig, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.themeKey) {
    updateThemeValue(target.dataset.themeKey as keyof ThemeConfig, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.themeImage === "background" && target.files) {
    void updateThemeBackgroundImage(target.files);
    target.value = "";
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioCue &&
    target.files &&
    (
      target.dataset.audioCue === "start" ||
      target.dataset.audioCue === "click" ||
      target.dataset.audioCue === "match" ||
      target.dataset.audioCue === "finish"
    )
  ) {
    void updateAudioCue(target.dataset.audioCue, target.files);
    target.value = "";
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioVolume &&
    (
      target.dataset.audioVolume === "start" ||
      target.dataset.audioVolume === "click" ||
      target.dataset.audioVolume === "match" ||
      target.dataset.audioVolume === "finish"
    )
  ) {
    updateAudioCueVolume(target.dataset.audioVolume, target.value);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.assetAliasKind &&
    target.dataset.assetAliasId &&
    (target.dataset.assetAliasKind === "halo" || target.dataset.assetAliasKind === "chara")
  ) {
    commitAssetAlias(target.dataset.assetAliasKind, target.dataset.assetAliasId, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.packInput === "workspace" && target.files) {
    void importWorkspacePack(target.files);
    target.value = "";
    return;
  }

  if (target instanceof HTMLSelectElement && target.dataset.charaId) {
    updateCharaRelation(target.dataset.charaId, target.value);
  }
});

root.addEventListener("input", (event) => {
  const target = event.target;

  if (
    target instanceof HTMLInputElement &&
    target.dataset.assetAliasKind &&
    target.dataset.assetAliasId &&
    (target.dataset.assetAliasKind === "halo" || target.dataset.assetAliasKind === "chara")
  ) {
    setAssetAliasValue(target.dataset.assetAliasKind, target.dataset.assetAliasId, target.value);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.searchKind &&
    (target.dataset.searchKind === "halo" || target.dataset.searchKind === "chara")
  ) {
    updateAssetSearch(target.dataset.searchKind, target.value);
    return;
  }

  if (target instanceof HTMLInputElement && target.dataset.searchKind === "halo-chara") {
    updateHaloCharaSearch(target.value);
    return;
  }

  if (
    target instanceof HTMLInputElement &&
    target.dataset.audioVolume &&
    (
      target.dataset.audioVolume === "start" ||
      target.dataset.audioVolume === "click" ||
      target.dataset.audioVolume === "match" ||
      target.dataset.audioVolume === "finish"
    )
  ) {
    const volumeLabel = root.querySelector<HTMLElement>(`[data-audio-volume-label="${target.dataset.audioVolume}"]`);
    if (volumeLabel) {
      volumeLabel.textContent = formatAudioVolumePercentage(Number(target.value) / 100);
    }
  }
});

root.addEventListener(
  "focusout",
  (event) => {
    const target = event.target;

    if (
      target instanceof HTMLInputElement &&
      target.dataset.assetAliasKind &&
      target.dataset.assetAliasId &&
      (target.dataset.assetAliasKind === "halo" || target.dataset.assetAliasKind === "chara")
    ) {
      commitAssetAlias(target.dataset.assetAliasKind, target.dataset.assetAliasId, target.value);
    }
  },
  true,
);

async function bootstrap(): Promise<void> {
  setNotice("info", autoPackUrl ? "正在加载默认素材包..." : state.notice.text);
  try {
    applyTheme();
    render();
    await nextFrame();

    let restored = await restoreWorkspace();

    if (restored) {
      applyTheme();
      syncUiPreserveScroll();
      return;
    }

    if (!restored && autoPackUrl) {
      restored = await importWorkspacePackFromUrl(autoPackUrl);
    }

    if (restored) {
      applyTheme();
      syncUiPreserveScroll();
      return;
    }

    if (!restored) {
      const demo = createDemoData();
      state.halos = demo.halos;
      state.charas = demo.charas;
      setNotice("info", "已加载演示素材。你可以直接开始，也可以导入本地图片并重新配置关系。");
    }
  } catch (error) {
    console.error("Failed to bootstrap starter game.", error);
    const demo = createDemoData();
    state.halos = demo.halos;
    state.charas = demo.charas;
    setNotice("error", "默认素材加载失败，已回退到演示素材。");
  }

  applyTheme();
  syncUiPreserveScroll();
}

window.addEventListener("beforeunload", () => {
  stopGameTimer();
  cancelRestartHold();
  cancelTutorialHint();
});

void bootstrap();
