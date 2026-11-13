import type { ChatSettings, Conversation, ThinkingDepth, ThemeMode } from '../types/chat';

const CONVERSATIONS_KEY = 'cadence_conversations_v1';
const ACTIVE_ID_KEY = 'cadence_active_conversation_v1';
const SETTINGS_KEY = 'cadence_settings_v1';
const THEME_KEY = 'cadence_theme_v1';

const VALID_GEMINI_MODELS = new Set(['gemini-3.1-flash-lite']);
const VALID_THINKING_LEVELS = new Set<ThinkingDepth>(['LOW', 'MEDIUM', 'HIGH', 'XHIGH']);

export const DEFAULT_SETTINGS: ChatSettings = {
  defaultModel: 'gemini-3.1-flash-lite',
  thinkingLevel: 'HIGH',
  systemPrompt:
    'You are Taya, a thoughtful, accurate, and conversational AI assistant. Answer clearly like ChatGPT with helpful structure, headings or lists when useful, and fenced code blocks with language identifiers.',
  webSearchEnabled: true,
};

function normalizeModelId(modelId: unknown): string {
  if (typeof modelId === 'string' && VALID_GEMINI_MODELS.has(modelId)) {
    return modelId;
  }
  return DEFAULT_SETTINGS.defaultModel;
}

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((conv) => ({
      ...conv,
      model: normalizeModelId(conv?.model),
    }));
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function loadActiveConversationId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_ID_KEY);
  } catch {
    return null;
  }
}

export function saveActiveConversationId(id: string | null): void {
  try {
    if (id) {
      localStorage.setItem(ACTIVE_ID_KEY, id);
    } else {
      localStorage.removeItem(ACTIVE_ID_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export function loadSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<ChatSettings>;
    return {
      defaultModel: normalizeModelId(parsed.defaultModel),
      thinkingLevel:
        parsed.thinkingLevel && VALID_THINKING_LEVELS.has(parsed.thinkingLevel)
          ? parsed.thinkingLevel
          : DEFAULT_SETTINGS.thinkingLevel,
      systemPrompt:
        typeof parsed.systemPrompt === 'string' &&
        !parsed.systemPrompt.startsWith('You are a thoughtful, accurate, and clear AI assistant.')
          ? parsed.systemPrompt
          : DEFAULT_SETTINGS.systemPrompt,
      webSearchEnabled:
        typeof parsed.webSearchEnabled === 'boolean'
          ? parsed.webSearchEnabled
          : DEFAULT_SETTINGS.webSearchEnabled,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: ChatSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore storage errors
  }
}

export function loadTheme(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
    return 'light';
  } catch {
    return 'light';
  }
}

export function saveTheme(theme: ThemeMode): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage errors
  }
}
