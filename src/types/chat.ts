export type ChatRole = 'user' | 'assistant';

export type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface ImageAttachment {
  id: string;
  name: string;
  mimeType: string;
  data: string; // base64 without prefix
  previewUrl: string;
}

export type BackgroundMode = 'none' | 'blur' | 'color' | 'gradient';

export interface SubjectBox {
  ymin: number; // 0..1000
  xmin: number; // 0..1000
  ymax: number; // 0..1000
  xmax: number; // 0..1000
}

export interface PhotoEditPlan {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  grayscale: number;
  blur: number;
  backgroundMode: BackgroundMode;
  backgroundBlur: number;
  backgroundColor: string;
  backgroundColor2: string;
  subjectBox?: SubjectBox;
  summary?: string;
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  createdAt: number;
  model?: string;
  usage?: TokenUsage;
  sources?: GroundingSource[];
  images?: ImageAttachment[];
  generatedImage?: ImageAttachment;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
}

export interface ModelOption {
  id: string;
  name: string;
  summary: string;
  contextWindow: string;
  supportsXHigh?: boolean;
}

export interface ChatSettings {
  defaultModel: string;
  thinkingLevel: ThinkingDepth;
  systemPrompt: string;
  webSearchEnabled: boolean;
}

export type ThemeMode = 'light' | 'dark';
