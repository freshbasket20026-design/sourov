import { useEffect, useRef, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  ArrowUp,
  AudioLines,
  Globe,
  ImagePlus,
  Pencil,
  Square,
  X,
} from 'lucide-react';
import type { ImageAttachment } from '../types/chat';

interface ComposerProps {
  value: string;
  attachments: ImageAttachment[];
  webSearchEnabled: boolean;
  isStreaming: boolean;
  onChange: (value: string) => void;
  onAddAttachment: (attachment: ImageAttachment) => void;
  onEditAttachment: (attachment: ImageAttachment) => void;
  onRemoveAttachment: (id: string) => void;
  onToggleWebSearch: () => void;
  onOpenLiveVoice: () => void;
  onSubmit: () => void;
  onStop: () => void;
}

export function Composer({
  value,
  attachments,
  webSearchEnabled,
  isStreaming,
  onChange,
  onAddAttachment,
  onEditAttachment,
  onRemoveAttachment,
  onToggleWebSearch,
  onOpenLiveVoice,
  onSubmit,
  onStop,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isStreaming && (value.trim().length > 0 || attachments.length > 0)) {
        onSubmit();
      }
    }
  };

  const handleFilePick = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          const base64 = result.split(',')[1] || '';
          onAddAttachment({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            mimeType: file.type,
            data: base64,
            previewUrl: result,
          });
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const canSend =
    (value.trim().length > 0 || attachments.length > 0) && !isStreaming;

  return (
    <div className="shrink-0 bg-gradient-to-t from-white/90 via-white/75 to-transparent px-4 pt-2 pb-4 sm:px-6 dark:from-slate-950/90 dark:via-slate-950/75 dark:to-transparent">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-slate-200 bg-white/90 p-2.5 shadow-xs backdrop-blur-sm transition-colors focus-within:border-teal-600 dark:border-slate-800 dark:bg-slate-900/90 dark:focus-within:border-teal-500">
          {/* Attached Photos Preview */}
          {attachments.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-2 px-1.5 pt-1">
              {attachments.map((img) => (
                <div
                  key={img.id}
                  className="group relative h-20 w-20 overflow-hidden rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
                >
                  <img
                    src={img.previewUrl}
                    alt={img.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-slate-950/65 px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => onEditAttachment(img)}
                      aria-label={`Edit ${img.name}`}
                      className="rounded p-0.5 text-white hover:text-teal-300"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveAttachment(img.id)}
                      aria-label={`Remove ${img.name}`}
                      className="rounded p-0.5 text-white hover:text-rose-300"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message Taya or ask about current events..."
            aria-label="Message input"
            className="max-h-[200px] min-h-[40px] w-full resize-none bg-transparent px-2 py-2 text-[15px] leading-relaxed text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100 dark:placeholder:text-slate-500"
          />

          {/* Toolbar Row */}
          <div className="mt-1 flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFilePick}
                className="hidden"
              />
              <button
                type="button"
                disabled={isStreaming}
                onClick={() => fileInputRef.current?.click()}
                aria-label="Attach photo"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
              >
                <ImagePlus className="h-4 w-4" />
                <span className="hidden sm:inline">Photo</span>
              </button>

              <button
                type="button"
                disabled={isStreaming}
                onClick={onToggleWebSearch}
                aria-pressed={webSearchEnabled}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors disabled:opacity-40 whitespace-nowrap shrink-0 ${
                  webSearchEnabled
                    ? 'bg-teal-50 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/60 dark:text-teal-300 dark:hover:bg-teal-950'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
              >
                <Globe className="h-4 w-4" />
                <span>Web Search {webSearchEnabled ? 'On' : 'Off'}</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={isStreaming}
                onClick={onOpenLiveVoice}
                aria-label="Start live voice conversation"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <AudioLines className="h-4 w-4" />
              </button>

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  aria-label="Stop generating"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onSubmit}
                  disabled={!canSend}
                  aria-label="Send message"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-700 text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 dark:bg-teal-600 dark:hover:bg-teal-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-600"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-slate-400 dark:text-slate-500">
          <span>Enter to send · Shift+Enter for new line</span>
          <span>Live web grounding &amp; Taya AI</span>
        </div>
      </div>
    </div>
  );
}
