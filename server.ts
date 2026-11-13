import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import {
  GoogleGenAI,
  Modality,
  ThinkingLevel,
  Type,
  type LiveServerMessage,
} from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

interface ImageAttachmentPayload {
  mimeType: string;
  data: string; // base64 without data: prefix
}

interface IncomingMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  images?: ImageAttachmentPayload[];
}

type ThinkingDepth = 'LOW' | 'MEDIUM' | 'HIGH' | 'XHIGH';

interface ChatRequestBody {
  messages?: IncomingMessage[];
  model?: string;
  thinkingLevel?: ThinkingDepth;
  systemPrompt?: string;
  enableWebSearch?: boolean;
}

interface TitleRequestBody {
  userMessage?: string;
  assistantMessage?: string;
}

interface PhotoAnalyzeRequestBody {
  image?: ImageAttachmentPayload;
}

interface ImageEditRequestBody {
  image?: ImageAttachmentPayload;
  prompt?: string;
}

interface GroundingSource {
  title: string;
  uri: string;
}

interface SmartEditPlan {
  brightness: number;
  contrast: number;
  saturation: number;
  warmth: number;
  grayscale: number;
  blur: number;
  backgroundMode: 'none' | 'blur' | 'color' | 'gradient';
  backgroundBlur: number;
  backgroundColor: string;
  backgroundColor2: string;
  subjectBox: {
    ymin: number;
    xmin: number;
    ymax: number;
    xmax: number;
  };
  summary: string;
}

const ALLOWED_MODELS = new Set(['gemini-3.1-flash-lite']);
const ALLOWED_VOICES = new Set(['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir']);

const TAYA_CORE_PERSONA = [
  'IDENTITY: Your name is Taya (তায়া). You are Taya, a warm, intelligent, and helpful AI assistant on this website.',
  'CRITICAL IDENTITY RULE: NEVER say "I do not have a specific name", "আমার কোনো নির্দিষ্ট নাম নেই", "I am an AI assistant created by Google", or "আমি গুগলের তৈরি একটি এআই অ্যাসিস্ট্যান্ট". Whenever anyone asks your name or who you are in any language, always answer clearly that your name is Taya — for example in Bengali: "আমার নাম তায়া (Taya)। আমি আপনার এআই অ্যাসিস্ট্যান্ট — আপনাকে কীভাবে সাহায্য করতে পারি?" and in English: "My name is Taya! How can I help you today?"',
  'ANSWER STYLE (ChatGPT-like): Respond like a polished ChatGPT-style conversational assistant. Match the user’s language (Bengali, Banglish, English, etc.). Give direct, well-structured, easy-to-read answers using clean Markdown headings, bullet lists, numbered steps when helpful, and fenced code blocks with language identifiers.',
  'PHOTO EDITING CAPABILITY: Taya includes a built-in Photo Studio and automatic in-chat photo editing and background replacement tools. NEVER say that you cannot edit photos or change backgrounds. If the user asks to edit a photo or change a background without attaching an image, warmly invite them (in their language) to upload/attach the photo right here in chat or open Photo Studio.',
].join('\n\n');

function getGeminiClient(apiVersion?: string, noRetry = false): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      ...(apiVersion ? { apiVersion } : {}),
      ...(noRetry ? { retryOptions: { attempts: 1 } } : {}),
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function resolveThinkingLevel(_model: string, requested?: string): ThinkingLevel {
  switch (requested) {
    case 'LOW':
      return ThinkingLevel.LOW;
    case 'MEDIUM':
      return ThinkingLevel.MEDIUM;
    case 'XHIGH':
    case 'HIGH':
    default:
      return ThinkingLevel.HIGH;
  }
}

function extractRawErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (typeof err === 'string') {
    return err;
  }
  if (err && typeof err === 'object') {
    const obj = err as {
      message?: unknown;
      reason?: unknown;
      error?: { message?: unknown } | unknown;
    };
    if (obj.error && typeof obj.error === 'object' && 'message' in obj.error) {
      const nestedMsg = (obj.error as { message?: unknown }).message;
      if (typeof nestedMsg === 'string' && nestedMsg.trim()) return nestedMsg;
    }
    if (typeof obj.message === 'string' && obj.message.trim()) {
      return obj.message;
    }
    if (typeof obj.reason === 'string' && obj.reason.trim()) {
      return obj.reason;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return 'An unexpected error occurred with Gemini.';
}

function formatGeminiError(err: unknown): string {
  const raw = extractRawErrorMessage(err);
  if (raw.includes('PERMISSION_DENIED') || raw.includes('API_KEY_INVALID')) {
    return 'The Gemini API key could not be verified. Please check your key in the Settings > Secrets panel.';
  }
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429')) {
    return 'Rate limit or quota reached for this Gemini feature. If using a free-tier key, generative image editing may require a billing-enabled key in Settings > Secrets.';
  }
  return raw || 'An unexpected error occurred with Gemini.';
}

function isQuotaError(err: unknown): boolean {
  const raw = extractRawErrorMessage(err);
  return raw.includes('RESOURCE_EXHAUSTED') || raw.includes('429');
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .trim();
}

async function fetchLiveWebContext(query: string): Promise<{
  contextText: string;
  sources: GroundingSource[];
}> {
  const cleanQuery = query.trim().slice(0, 200);
  const sources: GroundingSource[] = [];
  const lines: string[] = [
    `Current real-time date and time (UTC): ${new Date().toUTCString()}`,
  ];

  if (!cleanQuery) {
    return { contextText: lines.join('\n'), sources };
  }

  const newsUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanQuery)}&hl=en-US&gl=US&ceid=US:en`;
  const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanQuery)}&format=json&srlimit=3`;

  const [newsRes, wikiRes] = await Promise.allSettled([
    fetch(newsUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(4500),
    }),
    fetch(wikiUrl, {
      headers: { 'User-Agent': 'TayaBot/1.0' },
      signal: AbortSignal.timeout(4500),
    }),
  ]);

  if (newsRes.status === 'fulfilled' && newsRes.value.ok) {
    try {
      const xml = await newsRes.value.text();
      const itemRegex = /<item>([\s\S]*?)<\/item>/g;
      let match: RegExpExecArray | null;
      let count = 0;
      const newsSnippets: string[] = [];

      while ((match = itemRegex.exec(xml)) !== null && count < 5) {
        const block = match[1];
        const titleMatch = /<title>([\s\S]*?)<\/title>/.exec(block);
        const linkMatch = /<link>([\s\S]*?)<\/link>/.exec(block);
        const pubDateMatch = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(block);
        const title = titleMatch ? decodeXmlEntities(titleMatch[1]) : '';
        const link = linkMatch ? decodeXmlEntities(linkMatch[1]) : '';
        const pubDate = pubDateMatch ? decodeXmlEntities(pubDateMatch[1]) : '';

        if (title && link) {
          count++;
          sources.push({ title, uri: link });
          newsSnippets.push(`- ${title}${pubDate ? ` (${pubDate})` : ''} — ${link}`);
        }
      }

      if (newsSnippets.length > 0) {
        lines.push('\nRecent Web & News Results:\n' + newsSnippets.join('\n'));
      }
    } catch {
      // Ignore XML parse failure
    }
  }

  if (wikiRes.status === 'fulfilled' && wikiRes.value.ok) {
    try {
      const json = (await wikiRes.value.json()) as {
        query?: {
          search?: Array<{ title: string; snippet: string; pageid: number }>;
        };
      };
      const results = json.query?.search ?? [];
      if (results.length > 0) {
        const wikiLines: string[] = [];
        for (const item of results.slice(0, 3)) {
          const uri = `https://en.wikipedia.org/wiki/${encodeURIComponent(
            item.title.replace(/ /g, '_')
          )}`;
          const snippet = decodeXmlEntities(item.snippet);
          sources.push({ title: `${item.title} — Wikipedia`, uri });
          wikiLines.push(`- ${item.title}: ${snippet} (${uri})`);
        }
        lines.push('\nReference Encyclopedia Context:\n' + wikiLines.join('\n'));
      }
    } catch {
      // Ignore JSON parse failure
    }
  }

  return {
    contextText: lines.join('\n'),
    sources,
  };
}

async function detectPhotoEditIntent(
  ai: GoogleGenAI,
  userText: string,
  hasAttachedImage: boolean
): Promise<boolean> {
  if (!hasAttachedImage || !userText.trim()) return false;

  const lower = userText.toLowerCase();
  const hasExplicitEditKeyword =
    /\b(edit|background|backdrop|blur|bokeh|filter|bright|brighten|contrast|saturat|warm|grayscale|black and white|b&w|monochrome|enhance|retouch|colorize|tint|glow|sharpen|darken|lighten|remove bg)\b/i.test(
      lower
    ) ||
    userText.includes('এডিট') ||
    userText.includes('ব্যাকগ্রাউন্ড') ||
    userText.includes('পরিবর্তন') ||
    userText.includes('বদল') ||
    userText.includes('ব্লার') ||
    userText.includes('উজ্জ্বল') ||
    userText.includes('ফিল্টার') ||
    userText.includes('সাদা-কালো') ||
    userText.includes('সাদাকালো');

  if (hasExplicitEditKeyword) {
    return true;
  }

  try {
    const res = await ai.models.generateContent({
      model: 'gemini-3.1-flash-lite',
      contents: `User message with an attached photo: "${userText.slice(0, 400)}"`,
      config: {
        systemInstruction:
          'Classify whether the user is asking to edit, modify, enhance, filter, blur, or change the background of the attached photo. Return JSON with boolean isPhotoEdit.',
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            isPhotoEdit: { type: Type.BOOLEAN },
          },
          required: ['isPhotoEdit'],
        },
        thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
      },
    });
    const parsed = JSON.parse((res.text ?? '{}').trim()) as { isPhotoEdit?: boolean };
    return Boolean(parsed.isPhotoEdit);
  } catch {
    return false;
  }
}

async function generateSmartEditPlan(
  ai: GoogleGenAI,
  image: ImageAttachmentPayload,
  prompt: string
): Promise<SmartEditPlan> {
  const response = await ai.models.generateContent({
    model: 'gemini-3.1-flash-lite',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType: image.mimeType,
            data: image.data,
          },
        },
        {
          text: `The user wants to edit this photo with the instruction: "${prompt}".
Locate the primary foreground subject (bounding box ymin, xmin, ymax, xmax from 0 to 1000) and generate the best canvas photo-editing parameters:
- brightness (50-160, 100 neutral)
- contrast (50-160, 100 neutral)
- saturation (0-180, 100 neutral)
- warmth (-50 to +50, 0 neutral)
- grayscale (0-100, 0 neutral; 100 for black and white)
- blur (0-10, 0 sharp)
- backgroundMode: "blur" (if user wants portrait/blurred background), "color" (if user wants a solid background color), "gradient" (if user wants a stylized/scenic color gradient backdrop like sunset/studio/neon/sky), or "none" (only lighting/color edits)
- backgroundBlur (4-24, used when backgroundMode is "blur")
- backgroundColor (hex color e.g. "#1e293b")
- backgroundColor2 (hex color e.g. "#f97316" for gradient)
- summary: A helpful 1-2 sentence reply in the SAME LANGUAGE as the user's prompt explaining the edits applied, and noting they can fine-tune further in Photo Studio.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          brightness: { type: Type.INTEGER },
          contrast: { type: Type.INTEGER },
          saturation: { type: Type.INTEGER },
          warmth: { type: Type.INTEGER },
          grayscale: { type: Type.INTEGER },
          blur: { type: Type.INTEGER },
          backgroundMode: { type: Type.STRING },
          backgroundBlur: { type: Type.INTEGER },
          backgroundColor: { type: Type.STRING },
          backgroundColor2: { type: Type.STRING },
          subjectBox: {
            type: Type.OBJECT,
            properties: {
              ymin: { type: Type.INTEGER },
              xmin: { type: Type.INTEGER },
              ymax: { type: Type.INTEGER },
              xmax: { type: Type.INTEGER },
            },
            required: ['ymin', 'xmin', 'ymax', 'xmax'],
          },
          summary: { type: Type.STRING },
        },
        required: [
          'brightness',
          'contrast',
          'saturation',
          'warmth',
          'grayscale',
          'blur',
          'backgroundMode',
          'backgroundBlur',
          'backgroundColor',
          'backgroundColor2',
          'subjectBox',
          'summary',
        ],
      },
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as Partial<SmartEditPlan>;
  const mode =
    parsed.backgroundMode === 'blur' ||
    parsed.backgroundMode === 'color' ||
    parsed.backgroundMode === 'gradient'
      ? parsed.backgroundMode
      : 'none';

  return {
    brightness: Math.min(160, Math.max(50, Math.round(parsed.brightness ?? 104))),
    contrast: Math.min(160, Math.max(50, Math.round(parsed.contrast ?? 108))),
    saturation: Math.min(180, Math.max(0, Math.round(parsed.saturation ?? 105))),
    warmth: Math.min(50, Math.max(-50, Math.round(parsed.warmth ?? 0))),
    grayscale: Math.min(100, Math.max(0, Math.round(parsed.grayscale ?? 0))),
    blur: Math.min(10, Math.max(0, Math.round(parsed.blur ?? 0))),
    backgroundMode: mode,
    backgroundBlur: Math.min(24, Math.max(4, Math.round(parsed.backgroundBlur ?? 14))),
    backgroundColor:
      typeof parsed.backgroundColor === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(parsed.backgroundColor)
        ? parsed.backgroundColor
        : '#0f172a',
    backgroundColor2:
      typeof parsed.backgroundColor2 === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(parsed.backgroundColor2)
        ? parsed.backgroundColor2
        : '#0f766e',
    subjectBox: {
      ymin: Math.min(950, Math.max(0, Math.round(parsed.subjectBox?.ymin ?? 120))),
      xmin: Math.min(950, Math.max(0, Math.round(parsed.subjectBox?.xmin ?? 180))),
      ymax: Math.min(1000, Math.max(100, Math.round(parsed.subjectBox?.ymax ?? 920))),
      xmax: Math.min(1000, Math.max(100, Math.round(parsed.subjectBox?.xmax ?? 820))),
    },
    summary:
      parsed.summary ||
      'Applied your requested photo adjustments. You can fine-tune them further in Photo Studio.',
  };
}

async function tryGenerativeImageEdit(
  image: ImageAttachmentPayload | undefined,
  prompt: string
): Promise<{ imageUrl: string | null; note: string }> {
  const imageAi = getGeminiClient('v1beta', true);
  if (!imageAi) {
    throw new Error('GEMINI_API_KEY is not configured in the runtime environment.');
  }

  const parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }> = [];
  if (image?.data && image?.mimeType) {
    parts.push({
      inlineData: {
        data: image.data,
        mimeType: image.mimeType,
      },
    });
  }
  parts.push({ text: prompt });

  const response = await imageAi.models.generateContent({
    model: 'gemini-3.1-flash-lite-image',
    contents: { parts },
  });

  let imageUrl: string | null = null;
  let note = '';

  for (const part of response.candidates?.[0]?.content?.parts ?? []) {
    if (part.inlineData?.data) {
      const mime = part.inlineData.mimeType ?? 'image/png';
      imageUrl = `data:${mime};base64,${part.inlineData.data}`;
    } else if (part.text) {
      note += part.text;
    }
  }

  return { imageUrl, note };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  const httpServer = createServer(app);

  // Live Voice WebSocket bridge at /api/live
  const wss = new WebSocketServer({ server: httpServer, path: '/api/live' });

  wss.on('connection', async (clientWs: WebSocket, req) => {
    const ai = getGeminiClient('v1beta');
    if (!ai) {
      clientWs.send(
        JSON.stringify({
          error:
            'GEMINI_API_KEY is not configured in the runtime environment. Check Settings > Secrets.',
        })
      );
      clientWs.close();
      return;
    }

    const reqUrl = new URL(req.url || '/api/live', `http://${req.headers.host || 'localhost'}`);
    const requestedVoice = reqUrl.searchParams.get('voice') || 'Zephyr';
    const voiceName = ALLOWED_VOICES.has(requestedVoice) ? requestedVoice : 'Zephyr';
    const customLivePrompt = reqUrl.searchParams.get('systemPrompt')?.trim();
    const systemInstruction = [
      TAYA_CORE_PERSONA,
      customLivePrompt ||
        'Keep spoken responses concise, warm, and natural in live voice conversation.',
    ]
      .filter(Boolean)
      .join('\n\n');

    let closed = false;
    let activeSession: Awaited<ReturnType<typeof ai.live.connect>> | null = null;

    const sessionPromise = ai.live.connect({
      model: 'gemini-3.8-live',
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        systemInstruction,
      },
      callbacks: {
        onmessage: (message: LiveServerMessage) => {
          if (closed || clientWs.readyState !== clientWs.OPEN) return;

          const content = message.serverContent;
          if (!content) return;

          if (content.inputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ inputTranscript: content.inputTranscription.text })
            );
          }

          if (content.outputTranscription?.text) {
            clientWs.send(
              JSON.stringify({ outputTranscript: content.outputTranscription.text })
            );
          }

          for (const part of content.modelTurn?.parts ?? []) {
            if (part.inlineData?.data) {
              clientWs.send(JSON.stringify({ audio: part.inlineData.data }));
            }
          }

          if (content.interrupted) {
            clientWs.send(JSON.stringify({ interrupted: true }));
          }

          if (content.turnComplete) {
            clientWs.send(JSON.stringify({ turnComplete: true }));
          }
        },
        onerror: (err: unknown) => {
          if (!closed && clientWs.readyState === clientWs.OPEN) {
            clientWs.send(
              JSON.stringify({
                error: formatGeminiError(err),
              })
            );
          }
        },
        onclose: (event: { reason?: string; code?: number }) => {
          if (!closed && clientWs.readyState === clientWs.OPEN) {
            if (event?.reason && event.code !== 1000) {
              clientWs.send(JSON.stringify({ error: event.reason }));
            }
            clientWs.close();
          }
        },
      },
    });

    clientWs.on('message', (rawData) => {
      if (closed) return;
      let parsed: { audio?: string; text?: string };
      try {
        parsed = JSON.parse(rawData.toString()) as {
          audio?: string;
          text?: string;
        };
      } catch {
        return;
      }

      void sessionPromise
        .then((session) => {
          if (closed) return;
          if (typeof parsed.audio === 'string' && parsed.audio.length > 0) {
            session.sendRealtimeInput({
              audio: { data: parsed.audio, mimeType: 'audio/pcm;rate=16000' },
            });
          } else if (typeof parsed.text === 'string' && parsed.text.trim().length > 0) {
            session.sendClientContent({
              turns: [{ role: 'user', parts: [{ text: parsed.text.trim() }] }],
              turnComplete: true,
            });
          }
        })
        .catch(() => {});
    });

    clientWs.on('close', () => {
      closed = true;
      if (activeSession) {
        try {
          activeSession.close();
        } catch {
          // Ignore close errors
        }
        activeSession = null;
      } else {
        void sessionPromise
          .then((s) => {
            try {
              s.close();
            } catch {
              // Ignore
            }
          })
          .catch(() => {});
      }
    });

    try {
      activeSession = await sessionPromise;
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ ready: true }));
      }
    } catch (err: unknown) {
      if (!closed && clientWs.readyState === clientWs.OPEN) {
        clientWs.send(JSON.stringify({ error: formatGeminiError(err) }));
        clientWs.close();
      }
    }
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    const client = getGeminiClient();
    res.json({
      ok: true,
      configured: Boolean(client),
    });
  });

  app.post('/api/chat', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error:
          'GEMINI_API_KEY is not available in the runtime environment. Please check the Settings > Secrets panel.',
      });
      return;
    }

    const body = req.body as ChatRequestBody;
    const rawMessages = Array.isArray(body.messages) ? body.messages : [];
    const model =
      typeof body.model === 'string' && ALLOWED_MODELS.has(body.model)
        ? body.model
        : 'gemini-3.1-flash-lite';

    const validMessages = rawMessages.filter(
      (msg): msg is IncomingMessage =>
        Boolean(msg) &&
        (msg.role === 'user' || msg.role === 'assistant' || msg.role === 'system') &&
        ((typeof msg.content === 'string' && msg.content.trim().length > 0) ||
          (Array.isArray(msg.images) && msg.images.length > 0))
    );

    if (validMessages.length === 0) {
      res.status(400).json({ error: 'At least one message or image is required.' });
      return;
    }

    const systemPromptParts: string[] = [TAYA_CORE_PERSONA];
    if (typeof body.systemPrompt === 'string' && body.systemPrompt.trim()) {
      systemPromptParts.push(body.systemPrompt.trim());
    }

    type ContentPart =
      | { text: string }
      | { inlineData: { mimeType: string; data: string } };

    const contents: Array<{ role: 'user' | 'model'; parts: ContentPart[] }> = [];
    for (const msg of validMessages) {
      if (msg.role === 'system') {
        if (msg.content.trim()) systemPromptParts.push(msg.content);
        continue;
      }

      const parts: ContentPart[] = [];
      if (Array.isArray(msg.images)) {
        for (const img of msg.images) {
          if (img?.data && img?.mimeType) {
            parts.push({
              inlineData: {
                mimeType: img.mimeType,
                data: img.data,
              },
            });
          }
        }
      }
      if (msg.content.trim()) {
        parts.push({ text: msg.content });
      }
      if (parts.length > 0) {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts,
        });
      }
    }

    if (contents.length === 0) {
      res.status(400).json({ error: 'At least one user message is required.' });
      return;
    }

    const thinkingLevel = resolveThinkingLevel(model, body.thinkingLevel);
    const enableWebSearch = body.enableWebSearch !== false;

    const abortController = new AbortController();
    let streamClosedByClient = false;

    res.on('close', () => {
      if (!res.writableEnded) {
        streamClosedByClient = true;
        abortController.abort();
      }
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    // Check if the latest user turn is asking to edit an attached photo
    const lastUserMessage = [...validMessages].reverse().find((m) => m.role === 'user');
    const msgWithImage = [...validMessages]
      .reverse()
      .find((m) => Array.isArray(m.images) && m.images.length > 0);
    const latestImage =
      lastUserMessage?.images?.[lastUserMessage.images.length - 1] ||
      msgWithImage?.images?.[msgWithImage.images.length - 1];

    if (latestImage && lastUserMessage?.content?.trim()) {
      const wantsPhotoEdit = await detectPhotoEditIntent(
        ai,
        lastUserMessage.content,
        true
      );

      if (wantsPhotoEdit && !streamClosedByClient) {
        try {
          const gen = await tryGenerativeImageEdit(
            latestImage,
            lastUserMessage.content.trim()
          );
          if (gen.imageUrl && !streamClosedByClient) {
            res.write(
              `data: ${JSON.stringify({
                generatedImageUrl: gen.imageUrl,
                delta: gen.note || 'Here is your edited image.',
              })}\n\n`
            );
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
          }
        } catch (imgErr: unknown) {
          if (!isQuotaError(imgErr)) {
            res.write(
              `data: ${JSON.stringify({ error: formatGeminiError(imgErr) })}\n\n`
            );
            res.end();
            return;
          }
        }

        // Free-tier fallback: use Gemini 4 Hydrogen Smart Edit Plan + Canvas composite
        if (!streamClosedByClient) {
          try {
            const editPlan = await generateSmartEditPlan(
              ai,
              latestImage,
              lastUserMessage.content.trim()
            );
            res.write(
              `data: ${JSON.stringify({
                editPlan,
                delta: editPlan.summary,
              })}\n\n`
            );
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
            res.end();
            return;
          } catch (planErr: unknown) {
            res.write(
              `data: ${JSON.stringify({ error: formatGeminiError(planErr) })}\n\n`
            );
            res.end();
            return;
          }
        }
      }
    }

    const collectedSources = new Map<string, GroundingSource>();

    const runStream = async (
      useGoogleSearchTool: boolean,
      extraSystemContext?: string
    ): Promise<void> => {
      const combinedSystem = [
        ...systemPromptParts,
        enableWebSearch ? `Current UTC timestamp: ${new Date().toUTCString()}` : '',
        extraSystemContext || '',
      ]
        .filter(Boolean)
        .join('\n\n')
        .trim();

      const streamClient = useGoogleSearchTool ? getGeminiClient(undefined, true) ?? ai : ai;
      const stream = await streamClient.models.generateContentStream({
        model,
        contents,
        config: {
          ...(combinedSystem ? { systemInstruction: combinedSystem } : {}),
          thinkingConfig: { thinkingLevel },
          ...(useGoogleSearchTool ? { tools: [{ googleSearch: {} }] } : {}),
          abortSignal: abortController.signal,
        },
      });

      for await (const chunk of stream) {
        if (streamClosedByClient) break;

        const delta = chunk.text;
        if (typeof delta === 'string' && delta.length > 0) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }

        const groundingChunks =
          chunk.candidates?.[0]?.groundingMetadata?.groundingChunks;
        if (Array.isArray(groundingChunks) && groundingChunks.length > 0) {
          let addedNew = false;
          for (const gChunk of groundingChunks) {
            const uri = gChunk.web?.uri;
            const title = gChunk.web?.title || uri;
            if (uri && title && !collectedSources.has(uri)) {
              collectedSources.set(uri, { title, uri });
              addedNew = true;
            }
          }
          if (addedNew) {
            res.write(
              `data: ${JSON.stringify({
                sources: Array.from(collectedSources.values()),
              })}\n\n`
            );
          }
        }

        if (chunk.usageMetadata?.totalTokenCount) {
          res.write(
            `data: ${JSON.stringify({
              usage: {
                promptTokens: chunk.usageMetadata.promptTokenCount ?? 0,
                completionTokens: chunk.usageMetadata.candidatesTokenCount ?? 0,
                totalTokens: chunk.usageMetadata.totalTokenCount ?? 0,
              },
            })}\n\n`
          );
        }
      }
    };

    try {
      try {
        await runStream(enableWebSearch);
      } catch (primaryErr: unknown) {
        if (enableWebSearch && isQuotaError(primaryErr) && !streamClosedByClient) {
          const lastUserMsg = [...validMessages]
            .reverse()
            .find((m) => m.role === 'user')?.content;
          const liveWeb = await fetchLiveWebContext(lastUserMsg || '');

          if (liveWeb.sources.length > 0 && !streamClosedByClient) {
            res.write(
              `data: ${JSON.stringify({ sources: liveWeb.sources })}\n\n`
            );
          }

          await runStream(
            false,
            `Use the following real-time web context when answering questions about current events or recent information:\n\n${liveWeb.contextText}`
          );
        } else {
          throw primaryErr;
        }
      }

      if (!streamClosedByClient) {
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
      }
    } catch (err: unknown) {
      const isAbort =
        err instanceof Error &&
        (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'));

      if (isAbort || streamClosedByClient) {
        if (!res.writableEnded) {
          res.end();
        }
        return;
      }

      const errorMessage = formatGeminiError(err);

      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
        res.end();
      }
    }
  });

  // Free-tier Gemini 4 Hydrogen photo analysis -> returns tailored canvas adjustment values
  app.post('/api/photo-analyze', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in the runtime environment.',
      });
      return;
    }

    const body = req.body as PhotoAnalyzeRequestBody;
    if (!body.image?.data || !body.image?.mimeType) {
      res.status(400).json({ error: 'An uploaded image is required.' });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType: body.image.mimeType,
                data: body.image.data,
              },
            },
            {
              text: 'Analyze the lighting, contrast, color balance, and saturation of this photo. Suggest balanced, natural photo enhancement adjustments so the image looks crisp and well-exposed. Percentages: 100 is neutral for brightness, contrast, and saturation (suggested range 75-135). Warmth is -40 to +40 (0 is neutral). Provide a brief 1-sentence photography critique in note.',
            },
          ],
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              brightness: { type: Type.INTEGER },
              contrast: { type: Type.INTEGER },
              saturation: { type: Type.INTEGER },
              warmth: { type: Type.INTEGER },
              note: { type: Type.STRING },
            },
            required: ['brightness', 'contrast', 'saturation', 'warmth', 'note'],
          },
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim()) as {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        warmth?: number;
        note?: string;
      };

      res.json({
        brightness: Math.min(160, Math.max(50, Math.round(parsed.brightness ?? 104))),
        contrast: Math.min(160, Math.max(50, Math.round(parsed.contrast ?? 108))),
        saturation: Math.min(160, Math.max(50, Math.round(parsed.saturation ?? 106))),
        warmth: Math.min(50, Math.max(-50, Math.round(parsed.warmth ?? 4))),
        note: parsed.note || 'Balanced exposure and color contrast applied.',
      });
    } catch (err: unknown) {
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  // Photo Edit via Gemini Image Editing model with free-tier Smart Edit Plan fallback
  app.post('/api/image-edit', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'GEMINI_API_KEY is not configured in the runtime environment.',
      });
      return;
    }

    const body = req.body as ImageEditRequestBody;
    const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt) {
      res.status(400).json({ error: 'An edit prompt is required.' });
      return;
    }

    try {
      const gen = await tryGenerativeImageEdit(body.image, prompt);
      if (gen.imageUrl) {
        res.json({ imageUrl: gen.imageUrl, note: gen.note });
        return;
      }
      if (!body.image?.data) {
        res.status(422).json({
          error:
            gen.note ||
            'No edited image was returned by the model. Try a more explicit visual edit prompt.',
        });
        return;
      }
    } catch (err: unknown) {
      if (!isQuotaError(err) || !body.image?.data) {
        res.status(500).json({ error: formatGeminiError(err) });
        return;
      }
    }

    // Free-tier fallback when an image is provided: use Gemini 4 Hydrogen Smart Edit Plan
    try {
      const editPlan = await generateSmartEditPlan(ai, body.image!, prompt);
      res.json({ editPlan, note: editPlan.summary });
    } catch (err: unknown) {
      res.status(500).json({ error: formatGeminiError(err) });
    }
  });

  app.post('/api/title', async (req: Request, res: Response) => {
    const ai = getGeminiClient();
    const body = req.body as TitleRequestBody;
    const userMessage = typeof body.userMessage === 'string' ? body.userMessage.trim() : '';
    const assistantMessage =
      typeof body.assistantMessage === 'string' ? body.assistantMessage.trim() : '';

    if (!userMessage) {
      res.json({ title: 'New Conversation' });
      return;
    }

    const fallbackTitle =
      userMessage.length > 42 ? `${userMessage.slice(0, 42).trim()}...` : userMessage;

    if (!ai) {
      res.json({ title: fallbackTitle });
      return;
    }

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: `User: ${userMessage.slice(0, 300)}\nAssistant: ${assistantMessage.slice(0, 300)}`,
        config: {
          systemInstruction:
            'Generate a concise 3 to 5 word title for this conversation. Return only the title text without quotes or trailing punctuation.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      const generated = response.text?.trim();
      res.json({
        title:
          generated && generated.length > 0
            ? generated.replace(/^["']|["']$/g, '')
            : fallbackTitle,
      });
    } catch {
      res.json({ title: fallbackTitle });
    }
  });

  if (!IS_PRODUCTION) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Taya server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
