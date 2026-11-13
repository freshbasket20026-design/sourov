import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  Check,
  Copy,
  Download,
  ExternalLink,
  Pencil,
  RotateCcw,
} from 'lucide-react';
import type { ChatMessage, ImageAttachment } from '../types/chat';
import { GEMINI_MODELS, STARTER_PROMPTS } from '../data/models';
import { MarkdownRenderer } from './MarkdownRenderer';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSelectStarter: (prompt: string) => void;
  onEditImageInStudio: (image: ImageAttachment) => void;
  onRegenerate: () => void;
  onRetryError: () => void;
}

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(timestamp);
}

function getHostname(uri: string): string {
  try {
    return new URL(uri).hostname.replace(/^www\./, '');
  } catch {
    return uri;
  }
}

function TayaMark() {
  return (
    <div
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-teal-400"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-4 w-4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v18" />
        <path d="M6 7v10" />
        <path d="M18 7v10" />
      </svg>
    </div>
  );
}

export function MessageList({
  messages,
  isStreaming,
  onSelectStarter,
  onEditImageInStudio,
  onRegenerate,
  onRetryError,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const [userScrolledUp, setUserScrolledUp] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setUserScrolledUp(distanceFromBottom > 120);
  };

  useEffect(() => {
    if (!userScrolledUp) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: isStreaming ? 'auto' : 'smooth' });
    }
  }, [messages, isStreaming, userScrolledUp]);

  const scrollToBottom = () => {
    setUserScrolledUp(false);
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Ignore clipboard failure
    }
  };

  const handleDownloadImage = (img: ImageAttachment) => {
    const link = document.createElement('a');
    link.href = img.previewUrl;
    link.download = img.name || 'edited-photo.png';
    link.click();
  };

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center overflow-y-auto px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-teal-400">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                className="h-5 w-5"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 3v18" />
                <path d="M6 7v10" />
                <path d="M18 7v10" />
              </svg>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-white [text-wrap:balance]">
              What would you like to work through?
            </h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Real-time Taya AI streaming with live web search, Photo Studio, and Live Voice.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {STARTER_PROMPTS.map((item) => (
              <button
                key={item.title}
                type="button"
                onClick={() => onSelectStarter(item.prompt)}
                className="group flex flex-col items-start rounded-xl border border-slate-200/90 bg-white/85 p-4 text-left backdrop-blur-[2px] transition-colors hover:border-slate-300 hover:bg-white/95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900/80 dark:hover:border-slate-700 dark:hover:bg-slate-900/95"
              >
                <span className="text-sm font-semibold text-slate-900 group-hover:text-teal-700 dark:text-slate-100 dark:group-hover:text-teal-400">
                  {item.title}
                </span>
                <span className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.description}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const lastAssistantIndex = [...messages]
    .reverse()
    .findIndex((m) => m.role === 'assistant');
  const lastAssistantMsgId =
    lastAssistantIndex >= 0
      ? messages[messages.length - 1 - lastAssistantIndex].id
      : null;

  return (
    <div className="relative flex-1 overflow-hidden">
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto px-4 py-6 sm:px-6"
      >
        <div className="mx-auto max-w-3xl space-y-8 pb-6">
          {messages.map((message) => {
            const isUser = message.role === 'user';
            const isLastAssistant = message.id === lastAssistantMsgId;
            const activelyStreamingThis = isStreaming && isLastAssistant && !isUser;

            if (isUser) {
              return (
                <div key={message.id} className="group flex flex-col items-end">
                  {message.images && message.images.length > 0 && (
                    <div className="mb-2 flex max-w-[85%] flex-wrap justify-end gap-2">
                      {message.images.map((img) => (
                        <img
                          key={img.id}
                          src={img.previewUrl}
                          alt={img.name}
                          referrerPolicy="no-referrer"
                          className="max-h-56 rounded-xl border border-slate-200 object-contain dark:border-slate-800"
                        />
                      ))}
                    </div>
                  )}
                  {message.content.trim().length > 0 && (
                    <div className="max-w-[85%] sm:max-w-[78%] rounded-2xl bg-slate-100 px-4 py-3 text-[15px] leading-relaxed text-slate-900 dark:bg-slate-800/90 dark:text-slate-100">
                      <p className="whitespace-pre-wrap break-words">{message.content}</p>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 tabular-nums">
                      {formatTime(message.createdAt)}
                    </span>
                    {message.content.trim().length > 0 && (
                      <button
                        type="button"
                        onClick={() => handleCopyMessage(message.id, message.content)}
                        aria-label="Copy message"
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                      >
                        {copiedId === message.id ? (
                          <>
                            <Check className="h-3 w-3 text-teal-600 dark:text-teal-400" />
                            <span>Copied</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>Copy</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <div key={message.id} className="group flex items-start gap-3.5 sm:gap-4">
                <TayaMark />
                <div className="min-w-0 flex-1">
                  {message.error ? (
                    <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 text-sm text-rose-900 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                      <div className="flex items-start gap-2.5">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Unable to complete response</p>
                          <p className="mt-1 text-xs leading-relaxed text-rose-700 dark:text-rose-300">
                            {message.error}
                          </p>
                          <button
                            type="button"
                            onClick={onRetryError}
                            disabled={isStreaming}
                            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200 dark:hover:bg-rose-900/50"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Retry request</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {message.generatedImage && (
                        <div className="mb-3 inline-block max-w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
                          <img
                            src={message.generatedImage.previewUrl}
                            alt={message.generatedImage.name || 'Edited photo'}
                            referrerPolicy="no-referrer"
                            className="max-h-80 max-w-full object-contain"
                          />
                          <div className="flex items-center gap-2 border-t border-slate-200 px-3 py-2 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => handleDownloadImage(message.generatedImage!)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Download className="h-3.5 w-3.5" />
                              <span>Save PNG</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => onEditImageInStudio(message.generatedImage!)}
                              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              <span>Fine-tune in Photo Studio</span>
                            </button>
                          </div>
                        </div>
                      )}

                      {message.content.length === 0 && activelyStreamingThis ? (
                        <div className="flex items-center gap-2 py-1 text-sm text-slate-500 dark:text-slate-400">
                          <span>Generating response</span>
                          <span
                            className="streaming-caret bg-teal-600 dark:bg-teal-400"
                            aria-hidden="true"
                          />
                        </div>
                      ) : message.content.length > 0 ? (
                        <MarkdownRenderer
                          content={message.content}
                          isStreaming={activelyStreamingThis}
                        />
                      ) : null}
                    </>
                  )}

                  {/* Real-time Google Search Grounding Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 border-t border-slate-200/80 pt-3 dark:border-slate-800/80">
                      <div className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                        Web Sources
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {message.sources.slice(0, 6).map((source) => (
                          <a
                            key={source.uri}
                            href={source.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-xs transition-colors hover:border-slate-300 hover:bg-slate-100/80 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                          >
                            <div className="min-w-0">
                              <div className="truncate font-medium text-slate-800 dark:text-slate-200">
                                {source.title}
                              </div>
                              <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                {getHostname(source.uri)}
                              </div>
                            </div>
                            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {!activelyStreamingThis && !message.error && (message.content.length > 0 || message.generatedImage) && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 tabular-nums">
                        {message.model && (
                          <span>
                            {GEMINI_MODELS.find((m) => m.id === message.model)?.name || 'Taya'}
                          </span>
                        )}
                        {message.usage?.totalTokens ? (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{message.usage.totalTokens} tokens</span>
                          </>
                        ) : null}
                        <span aria-hidden="true">·</span>
                        <span>{formatTime(message.createdAt)}</span>
                      </div>

                      <div className="flex items-center gap-1">
                        {message.content.length > 0 && (
                          <button
                            type="button"
                            onClick={() => handleCopyMessage(message.id, message.content)}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            {copiedId === message.id ? (
                              <>
                                <Check className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        )}

                        {isLastAssistant && (
                          <button
                            type="button"
                            onClick={onRegenerate}
                            disabled={isStreaming}
                            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span>Regenerate</span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomAnchorRef} />
        </div>
      </div>

      {userScrolledUp && (
        <button
          type="button"
          onClick={scrollToBottom}
          aria-label="Scroll to latest message"
          className="absolute bottom-4 left-1/2 -translate-x-1/2 inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-md transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <ArrowDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
