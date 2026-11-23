export type NavRoute =
  | "all-videos"
  | "browse"
  | "youtube"
  | "x"
  | "local-import"
  | "settings-general"
  | "settings-speech"
  | "settings-ai"
  | "settings-translation";

export interface VideoItem {
  id: string;
  title: string;
  source: "local" | "youtube" | "x" | string;
  videoFile: string;
  coverFile?: string | null;
  subtitleFile?: string | null;
  durationSecs: number;
  width: number;
  height: number;
  fileSizeBytes: number;
  createdAtMs: number;
  lastPositionSecs: number;
  videoUrl: string;
  coverUrl: string;
}

export interface SubtitleCue {
  index: number;
  startSecs: number;
  endSecs: number;
  text: string;
  translation: string;
}

export interface ComponentStatus {
  id: string;
  name: string;
  description?: string;
  version: string;
  source: string;
  installed: boolean;
  required?: boolean;
  updateAvailable?: boolean;
}

export interface WhisperModelSpec {
  id: string;
  name: string;
  description: string;
  speed: number; // 1..5
  accuracy: number; // 1..5
  sizeLabel: string;
  recommended?: boolean;
}

export type ProviderGroup = "Cloud" | "This Mac" | "Other";

export interface CustomHeader {
  key: string;
  value: string;
}

export interface AiProviderConfig {
  id: string;
  name: string;
  subtitle: string;
  group: ProviderGroup;
  badgeText: string;
  badgeColor: string;
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  model: string;
  availableModels: string[];
  reasoningEffort: "Off" | "Low" | "Medium" | "High";
  maxConcurrency: number;
  customHeaders: CustomHeader[];
}

export interface SubraSettings {
  libraryPath: string;
  videoCount: number;
  appLanguage: string;
  autoCheckUpdates: boolean;
  appVersion: string;
  fullscreenOnOpen: boolean;
  networkProxy: string;

  // Speech Recognition
  selectedWhisperModel: string;
  downloadedWhisperModels: string[];

  // AI Providers
  selectedProviderId: string;
  providers: AiProviderConfig[];

  // Translation
  targetLanguage: string;
  smartTranslation: boolean;
  translationPrompt: string;
  cachedSentences: number;
  cachedBytes: number;
}

export const DEFAULT_TRANSLATION_PROMPT = `You are a professional subtitle translator. Translate every subtitle line into {{language}}.
- Keep each translation natural, concise and suitable for on-screen subtitles.
- Lines may be sentence fragments that continue in the next line; translate them so they read naturally in order.`;

export const WHISPER_MODELS: WhisperModelSpec[] = [
  {
    id: "tiny",
    name: "Tiny",
    description: "For a quick test. More typos; best for clearly pronounced English.",
    speed: 5,
    accuracy: 1,
    sizeLabel: "77.7 MB",
  },
  {
    id: "base",
    name: "Base",
    description: "Clear English lectures and podcasts. Almost instant.",
    speed: 5,
    accuracy: 2,
    sizeLabel: "148 MB",
  },
  {
    id: "small",
    name: "Small",
    description: "Good enough for everyday videos. Chinese and other languages are also fairly reliable.",
    speed: 4,
    accuracy: 3,
    sizeLabel: "487.6 MB",
  },
  {
    id: "medium",
    name: "Medium",
    description: "More accurate with heavy accents and fast speech, but noticeably slower.",
    speed: 3,
    accuracy: 4,
    sizeLabel: "1.53 GB",
  },
  {
    id: "large-v3-turbo-compressed",
    name: "Large v3 Turbo (Compressed)",
    description: "Best for most cases: near-top accuracy, small size, and fast.",
    speed: 4,
    accuracy: 4,
    sizeLabel: "574 MB",
    recommended: true,
  },
  {
    id: "large-v3-turbo",
    name: "Large v3 Turbo",
    description: "Nearly the same quality as the compressed version, but about 3x the size.",
    speed: 4,
    accuracy: 4,
    sizeLabel: "1.62 GB",
  },
  {
    id: "large-v3",
    name: "Large v3",
    description: "Most accurate but slowest. Best for noisy settings, multi-speaker dialogue, or films in less common languages.",
    speed: 2,
    accuracy: 5,
    sizeLabel: "3.1 GB",
  },
];

function makeProvider(
  id: string,
  name: string,
  group: ProviderGroup,
  badgeText: string,
  badgeColor: string,
  baseUrl: string,
  model: string,
  availableModels: string[],
  subtitle?: string,
  enabled = false,
): AiProviderConfig {
  return {
    id,
    name,
    subtitle: subtitle ?? `${name} Chat Completions API`,
    group,
    badgeText,
    badgeColor,
    enabled,
    baseUrl,
    apiKey: "",
    model,
    availableModels,
    reasoningEffort: "Off",
    maxConcurrency: 5,
    customHeaders: [],
  };
}

export const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  makeProvider("openai", "OpenAI", "Cloud", "OA", "#3D4145", "https://api.openai.com/v1", "gpt-4.1-mini", ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"]),
  makeProvider("anthropic", "Anthropic", "Cloud", "A", "#C46B43", "https://api.anthropic.com/v1", "claude-sonnet-4-5", ["claude-sonnet-4-5", "claude-haiku-4-5"]),
  makeProvider("gemini", "Google Gemini", "Cloud", "G", "#4285F4", "https://generativelanguage.googleapis.com/v1beta/openai", "gemini-3-flash", ["gemini-3-flash", "gemini-2.5-flash", "gemini-2.5-pro"]),
  makeProvider("deepseek", "DeepSeek", "Cloud", "DS", "#3B6CE7", "https://api.deepseek.com/v1", "deepseek-chat", ["deepseek-chat", "deepseek-reasoner"]),
  makeProvider("openrouter", "OpenRouter", "Cloud", "OR", "#4F545C", "https://openrouter.ai/api/v1", "google/gemini-3-flash", ["google/gemini-3-flash", "openai/gpt-4.1-mini"]),
  makeProvider("xai", "xAI Grok", "Cloud", "X", "#36383B", "https://api.x.ai/v1", "grok-3-mini", ["grok-3-mini", "grok-3"]),
  makeProvider("mistral", "Mistral", "Cloud", "M", "#E07A2E", "https://api.mistral.ai/v1", "mistral-small-latest", ["mistral-small-latest", "mistral-large-latest"]),
  makeProvider("groq", "Groq", "Cloud", "GQ", "#D95F3B", "https://api.groq.com/openai/v1", "llama-3.3-70b-versatile", ["llama-3.3-70b-versatile", "qwen-qwq-32b"]),
  makeProvider("qwen", "Qwen", "Cloud", "QW", "#6B5CE7", "https://dashscope.aliyuncs.com/compatible-mode/v1", "qwen-plus", ["qwen-plus", "qwen-turbo", "qwen-max"]),
  makeProvider("kimi", "Kimi", "Cloud", "KM", "#34373C", "https://api.moonshot.cn/v1", "moonshot-v1-8k", ["moonshot-v1-8k", "kimi-k2"]),
  makeProvider("zhipu", "Zhipu GLM", "Cloud", "Z", "#3D7BF5", "https://open.bigmodel.cn/api/paas/v4", "glm-4-flash", ["glm-4-flash", "glm-4-plus"]),
  makeProvider("zai", "Z.ai", "Cloud", "Za", "#2D3138", "https://api.z.ai/v1", "glm-4.5-flash", ["glm-4.5-flash", "glm-4.5"]),
  makeProvider("volcengine", "Volcengine Ark", "Cloud", "VA", "#2C82E0", "https://ark.cn-beijing.volces.com/api/v3", "doubao-1-5-lite-32k", ["doubao-1-5-lite-32k", "doubao-1-5-pro-32k"]),
  makeProvider("siliconflow", "SiliconFlow", "Cloud", "SF", "#7356E8", "https://api.siliconflow.cn/v1", "Qwen/Qwen2.5-7B-Instruct", ["Qwen/Qwen2.5-7B-Instruct", "deepseek-ai/DeepSeek-V3"]),
  makeProvider("minimax", "MiniMax", "Cloud", "MM", "#D9466E", "https://api.minimax.chat/v1", "MiniMax-Text-01", ["MiniMax-Text-01"]),
  makeProvider("mimo", "Xiaomi MiMo", "Cloud", "MI", "#EA6A2C", "https://api.xiaomimimo.com/v1", "mimo-v2-flash", ["mimo-v2-flash"]),

  // This Mac
  makeProvider("ollama", "Ollama", "This Mac", "OL", "#3C3F44", "http://127.0.0.1:11434/v1", "qwen2.5:7b", ["qwen2.5:7b", "llama3.2:latest"], "Local Ollama server on this Mac"),
  makeProvider("lmstudio", "LM Studio", "This Mac", "LM", "#4C457A", "http://127.0.0.1:1234/v1", "local-model", ["local-model"], "Local LM Studio OpenAI server"),

  // Other
  makeProvider(
    "openai-compatible",
    "OpenAI Compatible",
    "Other",
    "OC",
    "#3B3F3B",
    "http://127.0.0.1:3425/v1",
    "supergpt/deepseek-v4.1-flash",
    ["supergpt/deepseek-v4.1-flash", "gpt-4.1-mini", "deepseek-chat"],
    "Any OpenAI-compatible API",
    true,
  ),
];

export const DEFAULT_SETTINGS: SubraSettings = {
  libraryPath: "~/Movies/Subra Library.subra",
  videoCount: 13,
  appLanguage: "system",
  autoCheckUpdates: true,
  appVersion: "1.8.3 (106)",
  fullscreenOnOpen: false,
  networkProxy: "",

  selectedWhisperModel: "large-v3-turbo-compressed",
  downloadedWhisperModels: ["large-v3-turbo-compressed"],

  selectedProviderId: "openai-compatible",
  providers: DEFAULT_PROVIDERS,

  targetLanguage: "zh-CN",
  smartTranslation: true,
  translationPrompt: DEFAULT_TRANSLATION_PROMPT,
  cachedSentences: 6145,
  cachedBytes: 884736, // 864 KB
};
