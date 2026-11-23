import { signal } from "nsh";
import {
  SubraConfig,
  SubraDownloader,
  SubraLibrary,
  SubraSpeech,
  SubraSystem,
  SubraTranslate,
} from "subra/native";
import {
  summarizeVideoSubtitles,
  translateSubtitles,
} from "./translator";
import {
  type AiProviderConfig,
  type ComponentStatus,
  DEFAULT_PROVIDERS,
  DEFAULT_SETTINGS,
  type NavRoute,
  type SubtitleCue,
  type VideoItem,
  type SubraSettings,
} from "./types";

function loadDownloadedModelsSync(): string[] {
  try {
    const raw = SubraSpeech.listDownloadedModels();
    const parsed = JSON.parse(raw) as string[];
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // Fallback
  }
  return DEFAULT_SETTINGS.downloadedWhisperModels;
}

function loadCacheStatsSync(): { sentences: number; bytes: number } {
  try {
    const raw = SubraTranslate.cacheStats();
    const parsed = JSON.parse(raw) as { sentences: number; bytes: number };
    if (parsed && typeof parsed.sentences === "number") return parsed;
  } catch {
    // Fallback
  }
  return { sentences: 0, bytes: 0 };
}

function loadInitialSettings(): SubraSettings {
  const realModels = loadDownloadedModelsSync();
  const realCache = loadCacheStatsSync();

  let base: SubraSettings = {
    ...DEFAULT_SETTINGS,
    libraryPath: SubraConfig.defaultLibraryPath() || DEFAULT_SETTINGS.libraryPath,
  };

  try {
    const raw = SubraConfig.loadSettings();
    if (raw && raw.trim().length > 0) {
      const parsed = JSON.parse(raw) as Partial<SubraSettings>;
      base = {
        ...base,
        ...parsed,
        providers:
          Array.isArray(parsed.providers) && parsed.providers.length > 0
            ? parsed.providers
            : DEFAULT_PROVIDERS,
      };
    }
  } catch {
    // Fall back to defaults on malformed config
  }

  return {
    ...base,
    downloadedWhisperModels: realModels,
    selectedWhisperModel: realModels.includes(base.selectedWhisperModel)
      ? base.selectedWhisperModel
      : (realModels[0] ?? base.selectedWhisperModel),
    cachedSentences: realCache.sentences,
    cachedBytes: realCache.bytes,
  };
}

function loadDetectedComponents(): ComponentStatus[] {
  try {
    const raw = SubraSystem.detectComponents();
    const parsed = JSON.parse(raw) as ComponentStatus[];
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
  } catch {
    // Fallback
  }
  return [
    { id: "yt-dlp", name: "yt-dlp", description: "Downloads videos and subtitles from YouTube & X", version: "Not installed", source: "Missing", installed: false, required: true },
    { id: "ffmpeg", name: "FFmpeg", description: "Extracts covers, media metadata, and 16kHz audio", version: "Not installed", source: "Missing", installed: false, required: true },
    { id: "whisper-cli", name: "whisper-cli", description: "Runs local speech recognition", version: "Not installed", source: "Missing", installed: false, required: true },
    { id: "whisper-model", name: "Whisper Model", description: "Local GGML speech recognition model", version: "Not downloaded", source: "Missing", installed: false, required: true },
  ];
}

function scanLibrarySync(libraryPath: string): VideoItem[] {
  try {
    const raw = SubraLibrary.scanLibrary(libraryPath);
    const parsed = JSON.parse(raw) as VideoItem[];
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // Ignore scan failure
  }
  return [];
}

const initialSettings = loadInitialSettings();
const initialVideos = scanLibrarySync(initialSettings.libraryPath);

export const activeRoute = signal<NavRoute>("all-videos");
export const settings = signal<SubraSettings>({
  ...initialSettings,
  videoCount: initialVideos.length,
});
export const videos = signal<VideoItem[]>(initialVideos);
export const activeVideoId = signal<string | null>(null);
export const activeSubtitles = signal<SubtitleCue[]>([]);
export const activeSummary = signal<string>("");
export const importingVideos = signal<boolean>(false);
export const summarizingVideoId = signal<string | null>(null);
export interface TranscribeProgressState {
  active: boolean;
  videoId: string;
  stage: string;
  percent: number;
  segments: number;
  latestLine: string;
  liveCues?: SubtitleCue[];
}

export const downloadingModelId = signal<string | null>(null);
export const transcribingVideoId = signal<string | null>(null);
export const transcribeProgress = signal<TranscribeProgressState | null>(null);
export const translatingProgress = signal<{ done: number; total: number } | null>(null);
export const downloadingUrl = signal<string | null>(null);
export const installingComponentId = signal<string | null>(null);
export const dismissedSetupBanner = signal<boolean>(false);
export const components = signal<ComponentStatus[]>(loadDetectedComponents());
export const statusToast = signal<string>("");

export function missingComponents(): ComponentStatus[] {
  return components().filter((c) => c.required !== false && !c.installed);
}

let toastTimer: ReturnType<typeof setTimeout> | null = null;

export function showToast(message: string) {
  statusToast.set(message);
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    statusToast.set("");
  }, 3200);
}

export function updateSettings(patch: Partial<SubraSettings>) {
  const next: SubraSettings = { ...settings(), ...patch };
  settings.set(next);
  try {
    SubraConfig.saveSettings(JSON.stringify(next, null, 2));
  } catch {
    // Ignore write failures in headless test environments
  }
}

export function updateProvider(providerId: string, patch: Partial<AiProviderConfig>) {
  const current = settings();
  const nextProviders = current.providers.map((p) =>
    p.id === providerId ? { ...p, ...patch } : p,
  );
  updateSettings({ providers: nextProviders });
}

export function refreshLibrary(silent = false) {
  const list = scanLibrarySync(settings().libraryPath);
  videos.set(list);
  settings.set({ ...settings(), videoCount: list.length });
  if (!silent) {
    showToast(`Library synced (${list.length} ${list.length === 1 ? "video" : "videos"})`);
  }
}

export async function importLocalVideos(): Promise<VideoItem[]> {
  if (importingVideos()) return [];
  importingVideos.set(true);
  try {
    const raw = await SubraLibrary.pickAndImportVideos(settings().libraryPath);
    const parsed = JSON.parse(raw) as { imported: VideoItem[]; errors: string[] };
    const imported = Array.isArray(parsed.imported) ? parsed.imported : [];
    const errors = Array.isArray(parsed.errors) ? parsed.errors : [];
    refreshLibrary(true);
    if (imported.length > 0) {
      showToast(
        `Imported ${imported.length} ${imported.length === 1 ? "video" : "videos"}`,
      );
    } else if (errors.length > 0) {
      showToast(`Import error: ${errors[0]}`);
    }
    return imported;
  } catch (err) {
    showToast(`Import failed: ${String(err)}`);
    return [];
  } finally {
    importingVideos.set(false);
  }
}

export function reloadActiveSubtitles(videoId: string) {
  try {
    const raw = SubraLibrary.loadSubtitles(settings().libraryPath, videoId);
    const cues = JSON.parse(raw) as SubtitleCue[];
    activeSubtitles.set(Array.isArray(cues) ? cues : []);
  } catch {
    activeSubtitles.set([]);
  }
}

export function openVideo(videoId: string) {
  activeVideoId.set(videoId);
  reloadActiveSubtitles(videoId);
  try {
    const savedSummary = SubraTranslate.loadSummary(
      settings().libraryPath,
      videoId,
    );
    activeSummary.set(savedSummary || "");
  } catch {
    activeSummary.set("");
  }
}

export function closeVideo() {
  activeVideoId.set(null);
  activeSubtitles.set([]);
  activeSummary.set("");
}

export function savePlaybackPosition(videoId: string, positionSecs: number) {
  try {
    SubraLibrary.updatePlaybackPosition(
      settings().libraryPath,
      videoId,
      positionSecs,
    );
    videos.set(
      videos().map((v) =>
        v.id === videoId ? { ...v, lastPositionSecs: positionSecs } : v,
      ),
    );
  } catch {
    // Ignore
  }
}

export async function deleteVideoItem(videoId: string) {
  const ok = await SubraLibrary.deleteVideo(settings().libraryPath, videoId);
  if (ok) {
    if (activeVideoId() === videoId) {
      closeVideo();
    }
    refreshLibrary(true);
    showToast("Video moved to Trash");
  } else {
    showToast("Could not delete video");
  }
}

export async function revealVideoFolder(videoId: string) {
  const ok = await SubraLibrary.revealVideoFolder(settings().libraryPath, videoId);
  if (!ok) {
    showToast("Could not open video folder in Finder");
  }
}

export async function downloadWhisperModel(modelId: string, name: string) {
  if (downloadingModelId()) {
    showToast("Another Whisper model is currently downloading");
    return;
  }
  downloadingModelId.set(modelId);
  showToast(`Downloading ${name}...`);
  try {
    const raw = await SubraSpeech.downloadModel(modelId, settings().networkProxy);
    const res = JSON.parse(raw || '{"ok":false,"error":"Unknown error"}') as {
      ok: boolean;
      error: string;
    };
    const updatedModels = loadDownloadedModelsSync();
    if (res.ok) {
      updateSettings({
        downloadedWhisperModels: updatedModels,
        selectedWhisperModel: modelId,
      });
      showToast(`Downloaded & activated ${name}`);
    } else {
      showToast(`Download failed: ${res.error}`);
    }
  } catch (err) {
    showToast(`Download error: ${String(err)}`);
  } finally {
    downloadingModelId.set(null);
  }
}

export function deleteWhisperModel(modelId: string, name: string) {
  const ok = SubraSpeech.deleteModel(modelId);
  const updatedModels = loadDownloadedModelsSync();
  const nextSelected =
    settings().selectedWhisperModel === modelId
      ? (updatedModels[0] ?? "")
      : settings().selectedWhisperModel;
  updateSettings({
    downloadedWhisperModels: updatedModels,
    selectedWhisperModel: nextSelected,
  });
  showToast(ok ? `Removed ${name}` : `Model ${name} was not on disk`);
}

export async function transcribeVideo(videoId: string) {
  if (transcribingVideoId()) {
    showToast("A transcription job is already running");
    return;
  }
  const modelId = settings().selectedWhisperModel;
  if (!modelId) {
    showToast("Select or download a Whisper model in Speech Recognition first");
    return;
  }
  transcribingVideoId.set(videoId);
  if (activeVideoId() === videoId) {
    activeSubtitles.set([]);
  }
  transcribeProgress.set({
    active: true,
    videoId,
    stage: "Starting Whisper...",
    percent: 2,
    segments: 0,
    latestLine: "",
  });

  const pollTimer = setInterval(() => {
    try {
      const raw = SubraSpeech.getTranscribeProgress();
      const parsed = JSON.parse(raw || "{}") as Partial<TranscribeProgressState>;
      if (parsed && typeof parsed.percent === "number") {
        transcribeProgress.set({
          active: Boolean(parsed.active),
          videoId: parsed.videoId ?? videoId,
          stage: parsed.stage || "Transcribing...",
          percent: parsed.percent,
          segments: parsed.segments ?? 0,
          latestLine: parsed.latestLine ?? "",
          liveCues: parsed.liveCues,
        });
        if (
          activeVideoId() === videoId &&
          Array.isArray(parsed.liveCues) &&
          parsed.liveCues.length > activeSubtitles().length
        ) {
          activeSubtitles.set(parsed.liveCues);
        }
      }
    } catch {
      // Ignore transient parse errors
    }
  }, 250);

  showToast(`Transcribing with Whisper (${modelId})...`);
  try {
    const raw = await SubraSpeech.transcribeVideo(
      settings().libraryPath,
      videoId,
      modelId,
    );
    const res = JSON.parse(raw || '{"ok":false,"error":"Unknown error","cueCount":0}') as {
      ok: boolean;
      error: string;
      cueCount: number;
    };
    if (res.ok) {
      refreshLibrary(true);
      if (activeVideoId() === videoId) {
        reloadActiveSubtitles(videoId);
      }
      showToast(`Transcribed ${res.cueCount} subtitle segments`);
    } else {
      showToast(`Transcription failed: ${res.error}`);
    }
  } catch (err) {
    showToast(`Transcription error: ${String(err)}`);
  } finally {
    clearInterval(pollTimer);
    transcribingVideoId.set(null);
    transcribeProgress.set(null);
  }
}

export async function translateVideoSubtitles(
  videoId: string,
  videoTitle: string,
) {
  if (translatingProgress()) {
    showToast("Translation is already in progress");
    return;
  }
  const cues = activeSubtitles();
  if (cues.length === 0) {
    showToast("Transcribe the video first before translating");
    return;
  }

  translatingProgress.set({ done: 0, total: cues.length });
  try {
    const { cues: translatedCues, cacheStats, cachedHits } =
      await translateSubtitles({
        libraryPath: settings().libraryPath,
        videoId,
        videoTitle,
        cues,
        settings: settings(),
        onProgress: (done, total, updatedCues) => {
          translatingProgress.set({ done, total });
          if (activeVideoId() === videoId) {
            activeSubtitles.set(updatedCues);
          }
        },
      });

    if (activeVideoId() === videoId) {
      activeSubtitles.set(translatedCues);
    }
    updateSettings({
      cachedSentences: cacheStats.sentences,
      cachedBytes: cacheStats.bytes,
    });
    showToast(
      `Translated ${translatedCues.length} lines (${cachedHits} from cache)`,
    );
  } catch (err) {
    showToast(`Translation failed: ${String(err)}`);
  } finally {
    translatingProgress.set(null);
  }
}

export function clearTranslationCache() {
  SubraTranslate.clearCache();
  updateSettings({ cachedSentences: 0, cachedBytes: 0 });
  showToast("Translation cache cleared");
}

export async function summarizeActiveVideo(
  videoId: string,
  videoTitle: string,
) {
  if (summarizingVideoId()) {
    showToast("AI summary is already generating");
    return;
  }
  const cues = activeSubtitles();
  if (cues.length === 0) {
    showToast("Transcribe the video first before generating a summary");
    return;
  }
  summarizingVideoId.set(videoId);
  showToast("Generating AI video summary...");
  try {
    const text = await summarizeVideoSubtitles({
      libraryPath: settings().libraryPath,
      videoId,
      videoTitle,
      cues,
      settings: settings(),
    });
    if (activeVideoId() === videoId) {
      activeSummary.set(text);
    }
    showToast("AI summary saved to summary.md");
  } catch (err) {
    showToast(`Summary failed: ${String(err)}`);
  } finally {
    summarizingVideoId.set(null);
  }
}

export async function exportVideoSubtitles(
  videoTitle: string,
  format: "srt" | "vtt" | "txt",
  mode: "bilingual" | "original" | "translation",
) {
  const cues = activeSubtitles();
  if (cues.length === 0) {
    showToast("No subtitles to export");
    return;
  }
  try {
    const raw = await SubraTranslate.exportSubtitles(
      JSON.stringify(cues),
      videoTitle,
      format,
      mode,
    );
    const res = JSON.parse(raw || '{"ok":false,"cancelled":false,"path":"","error":"Unknown"}') as {
      ok: boolean;
      cancelled: boolean;
      path: string;
      error: string;
    };
    if (res.cancelled) return;
    if (res.ok) {
      showToast(`Exported ${format.toUpperCase()} successfully`);
    } else {
      showToast(`Export failed: ${res.error}`);
    }
  } catch (err) {
    showToast(`Export error: ${String(err)}`);
  }
}

export interface VideoPreviewInfo {
  ok: boolean;
  error: string;
  id: string;
  title: string;
  uploader: string;
  durationSecs: number;
  thumbnailUrl: string;
  webpageUrl: string;
  source: string;
}

export async function fetchRemoteVideoInfo(
  url: string,
): Promise<VideoPreviewInfo> {
  const raw = await SubraDownloader.fetchVideoInfo(url, settings().networkProxy);
  return JSON.parse(
    raw || '{"ok":false,"error":"Empty response from yt-dlp"}',
  ) as VideoPreviewInfo;
}

export async function downloadRemoteVideo(params: {
  url: string;
  source: "youtube" | "x";
  quality: string;
  downloadSubs: boolean;
}): Promise<VideoItem | null> {
  if (downloadingUrl()) {
    showToast("A download is already in progress");
    return null;
  }
  downloadingUrl.set(params.url);
  showToast("Downloading with yt-dlp...");
  try {
    const raw = await SubraDownloader.downloadVideo(
      params.url,
      settings().libraryPath,
      params.source,
      params.quality,
      params.downloadSubs,
      settings().networkProxy,
    );
    const res = JSON.parse(raw || '{"ok":false,"error":"Unknown error"}') as {
      ok: boolean;
      error: string;
      item?: VideoItem | null;
    };
    if (res.ok && res.item) {
      refreshLibrary(true);
      showToast(`Downloaded "${res.item.title}"`);
      return res.item;
    }
    showToast(`Download failed: ${res.error}`);
    return null;
  } catch (err) {
    showToast(`Download error: ${String(err)}`);
    return null;
  } finally {
    downloadingUrl.set(null);
  }
}

export function redetectComponents(silent = false) {
  components.set(loadDetectedComponents());
  if (!silent) {
    const missing = missingComponents().length;
    showToast(
      missing === 0
        ? "All required components are ready"
        : `Component check complete (${missing} missing)`,
    );
  }
}

export async function installComponent(
  componentId: string,
  name: string,
): Promise<boolean> {
  if (installingComponentId()) {
    showToast("Another component installation is in progress");
    return false;
  }

  if (componentId === "whisper-model") {
    installingComponentId.set(componentId);
    try {
      await downloadWhisperModel(
        "large-v3-turbo-compressed",
        "Large v3 Turbo (Compressed)",
      );
      redetectComponents(true);
      return components().some((c) => c.id === "whisper-model" && c.installed);
    } finally {
      installingComponentId.set(null);
    }
  }

  installingComponentId.set(componentId);
  showToast(`Installing ${name}...`);
  try {
    const raw = await SubraSystem.installComponent(
      componentId,
      settings().networkProxy,
    );
    const res = JSON.parse(raw || '{"ok":false,"error":"Unknown error"}') as {
      ok: boolean;
      error: string;
    };
    redetectComponents(true);
    if (res.ok) {
      showToast(`Installed ${name}`);
      return true;
    }
    showToast(`Install failed: ${res.error}`);
    return false;
  } catch (err) {
    showToast(`Install error: ${String(err)}`);
    return false;
  } finally {
    installingComponentId.set(null);
  }
}

export async function installAllMissingComponents() {
  const missing = missingComponents();
  for (const comp of missing) {
    const ok = await installComponent(comp.id, comp.name);
    if (!ok) break;
  }
  redetectComponents(false);
}

export async function switchLibraryFolder() {
  try {
    const chosen = await SubraSystem.pickLibraryFolder();
    if (chosen && chosen.length > 0) {
      updateSettings({ libraryPath: chosen });
      closeVideo();
      refreshLibrary(true);
      showToast(`Switched library to ${chosen}`);
    }
  } catch {
    showToast("Folder picker is only available on desktop");
  }
}

export async function revealLibraryFolder() {
  const ok = await SubraSystem.revealFolder(settings().libraryPath);
  if (!ok) {
    showToast("Could not open folder in Finder");
  }
}

export function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatDuration(secs: number): string {
  if (!Number.isFinite(secs) || secs <= 0) return "00:00";
  const total = Math.floor(secs);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
