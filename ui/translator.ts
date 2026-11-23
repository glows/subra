import { SubraTranslate } from "subra/native";
import type { AiProviderConfig, SubtitleCue, SubraSettings } from "./types";

const TARGET_LANG_LABELS: Record<string, string> = {
  "zh-CN": "Simplified Chinese (简体中文)",
  "zh-TW": "Traditional Chinese (繁體中文)",
  en: "English",
  ja: "Japanese (日本語)",
  ko: "Korean (한국어)",
  es: "Spanish (Español)",
  fr: "French (Français)",
};

function simpleHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function makeCacheKey(
  model: string,
  targetLang: string,
  promptHash: string,
  text: string,
): string {
  return `${model}|${targetLang}|${promptHash}|${text.trim()}`;
}

export function resolveActiveProvider(
  cfg: SubraSettings,
): AiProviderConfig | null {
  const selected = cfg.providers.find(
    (p) => p.id === cfg.selectedProviderId && p.enabled,
  );
  if (selected) return selected;
  return cfg.providers.find((p) => p.enabled) ?? null;
}

function parseTranslatedLines(raw: string, expectedCount: number): string[] {
  const trimmed = raw.trim();
  // Strip optional markdown code fences
  const cleaned = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Try JSON array first
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
      return parsed.map((item) =>
        typeof item === "string" ? item.trim() : String(item ?? "").trim(),
      );
    }
    if (parsed && Array.isArray(parsed.translations)) {
      return parsed.translations.map((item: unknown) =>
        typeof item === "string" ? item.trim() : String(item ?? "").trim(),
      );
    }
  } catch {
    // Fall back to line-based parsing
  }

  const lines = cleaned
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => l.replace(/^\d+[\.\)\]:]\s*/, "").trim());

  if (lines.length === expectedCount) {
    return lines;
  }
  return lines.slice(0, expectedCount);
}

async function translateBatch(
  provider: AiProviderConfig,
  systemPrompt: string,
  lines: string[],
  contextSummary: string,
): Promise<string[]> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${provider.apiKey.trim()}`;
  }
  for (const h of provider.customHeaders) {
    if (h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }

  const userPayload = [
    contextSummary ? `Video context:\n${contextSummary}\n` : "",
    `Translate the following ${lines.length} subtitle lines in order.`,
    `Return ONLY a valid JSON array of exactly ${lines.length} translated strings, with no extra text or markdown.`,
    JSON.stringify(lines),
  ]
    .filter(Boolean)
    .join("\n");

  const body: Record<string, unknown> = {
    model: provider.model,
    temperature: 0.2,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPayload },
    ],
  };

  if (provider.reasoningEffort && provider.reasoningEffort !== "Off") {
    body["reasoning_effort"] = provider.reasoningEffort.toLowerCase();
  }

  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status}: ${errText.slice(0, 140) || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (!content.trim()) {
    throw new Error("Empty response from AI provider");
  }
  return parseTranslatedLines(content, lines.length);
}

export async function translateSubtitles(params: {
  libraryPath: string;
  videoId: string;
  videoTitle: string;
  cues: SubtitleCue[];
  settings: SubraSettings;
  onProgress: (done: number, total: number, updatedCues: SubtitleCue[]) => void;
}): Promise<{
  cues: SubtitleCue[];
  cacheStats: { sentences: number; bytes: number };
  cachedHits: number;
}> {
  const provider = resolveActiveProvider(params.settings);
  if (!provider) {
    throw new Error(
      "No enabled AI Provider. Enable one in Settings → AI Providers.",
    );
  }
  if (!provider.baseUrl.trim()) {
    throw new Error(`Provider "${provider.name}" is missing a Base URL.`);
  }

  const langLabel =
    TARGET_LANG_LABELS[params.settings.targetLanguage] ??
    params.settings.targetLanguage;
  const systemPrompt = params.settings.translationPrompt.replace(
    /\{\{language\}\}/g,
    langLabel,
  );
  const promptHash = simpleHash(systemPrompt);

  // 1. Lookup cache
  const keys = params.cues.map((c) =>
    makeCacheKey(
      provider.model,
      params.settings.targetLanguage,
      promptHash,
      c.text,
    ),
  );
  const hitsRaw = SubraTranslate.lookupCache(JSON.stringify(keys));
  const hits: Record<string, string> = JSON.parse(hitsRaw || "{}");

  const workingCues: SubtitleCue[] = params.cues.map((c, idx) => ({
    ...c,
    translation: hits[keys[idx]] ?? c.translation ?? "",
  }));

  const pendingIndices: number[] = [];
  let cachedHits = 0;
  for (let i = 0; i < workingCues.length; i++) {
    if (hits[keys[i]]) {
      cachedHits++;
    } else if (workingCues[i].text.trim().length > 0) {
      pendingIndices.push(i);
    }
  }

  const total = workingCues.length;
  let completed = total - pendingIndices.length;
  params.onProgress(completed, total, [...workingCues]);

  // 2. Build batches & run with provider.maxConcurrency
  const BATCH_SIZE = 12;
  const batches: number[][] = [];
  for (let i = 0; i < pendingIndices.length; i += BATCH_SIZE) {
    batches.push(pendingIndices.slice(i, i + BATCH_SIZE));
  }

  const contextSummary = params.settings.smartTranslation
    ? `Title: ${params.videoTitle}\nSample lines: ${params.cues
        .slice(0, 6)
        .map((c) => c.text)
        .join(" / ")}`
    : "";

  const newCacheEntries: Record<string, string> = {};
  const concurrency = Math.max(1, Math.min(16, provider.maxConcurrency || 5));
  let cursor = 0;

  async function worker() {
    while (cursor < batches.length) {
      const batchIdx = cursor++;
      const indices = batches[batchIdx];
      const sourceLines = indices.map((i) => workingCues[i].text);
      const translated = await translateBatch(
        provider!,
        systemPrompt,
        sourceLines,
        contextSummary,
      );
      for (let j = 0; j < indices.length; j++) {
        const cueIdx = indices[j];
        const tr = translated[j] ?? "";
        if (tr) {
          workingCues[cueIdx] = { ...workingCues[cueIdx], translation: tr };
          newCacheEntries[keys[cueIdx]] = tr;
        }
      }
      completed += indices.length;
      params.onProgress(completed, total, [...workingCues]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, batches.length)) }, () =>
      worker(),
    ),
  );

  // 3. Persist cache & bilingual SRT
  const statsRaw = SubraTranslate.saveCacheEntries(
    JSON.stringify(newCacheEntries),
  );
  const cacheStats = JSON.parse(statsRaw || '{"sentences":0,"bytes":0}') as {
    sentences: number;
    bytes: number;
  };

  SubraTranslate.saveBilingualSubtitles(
    params.libraryPath,
    params.videoId,
    JSON.stringify(workingCues),
  );

  return { cues: workingCues, cacheStats, cachedHits };
}

function fmtTimestamp(secs: number): string {
  const total = Math.max(0, Math.floor(secs));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
}

export async function summarizeVideoSubtitles(params: {
  libraryPath: string;
  videoId: string;
  videoTitle: string;
  cues: SubtitleCue[];
  settings: SubraSettings;
}): Promise<string> {
  const provider = resolveActiveProvider(params.settings);
  if (!provider) {
    throw new Error(
      "No enabled AI Provider. Enable one in Settings → AI Providers.",
    );
  }
  if (!provider.baseUrl.trim()) {
    throw new Error(`Provider "${provider.name}" is missing a Base URL.`);
  }

  const langLabel =
    TARGET_LANG_LABELS[params.settings.targetLanguage] ??
    params.settings.targetLanguage;

  // Cap transcript length cleanly for context safety while preserving full timeline coverage
  const lines = params.cues
    .filter((c) => c.text.trim().length > 0)
    .map((c) => `[${fmtTimestamp(c.startSecs)}] ${c.text.trim()}`);
  const transcript = lines.join("\n").slice(0, 28000);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (provider.apiKey.trim()) {
    headers["Authorization"] = `Bearer ${provider.apiKey.trim()}`;
  }
  for (const h of provider.customHeaders) {
    if (h.key.trim()) {
      headers[h.key.trim()] = h.value;
    }
  }

  const systemPrompt = `You are a concise, insightful video analyst. Summarize the video transcript in ${langLabel}.
Format your answer clearly in plain readable sections:
1. TL;DR (1-2 sentences)
2. Key Takeaways (3-6 concise bullet points)
3. Timeline Highlights (key moments with [MM:SS] timestamps)`;

  const userPrompt = `Video title: ${params.videoTitle}\n\nTranscript:\n${transcript}`;

  const body: Record<string, unknown> = {
    model: provider.model,
    temperature: 0.3,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  };
  if (provider.reasoningEffort && provider.reasoningEffort !== "Off") {
    body["reasoning_effort"] = provider.reasoningEffort.toLowerCase();
  }

  const url = `${provider.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status}: ${errText.slice(0, 140) || res.statusText}`,
    );
  }

  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const summary = (data?.choices?.[0]?.message?.content ?? "").trim();
  if (!summary) {
    throw new Error("Empty summary returned by AI provider");
  }

  SubraTranslate.saveSummary(params.libraryPath, params.videoId, summary);
  return summary;
}
