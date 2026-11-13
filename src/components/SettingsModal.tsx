import { useEffect, useState } from 'react';
import { Trash2, X } from 'lucide-react';
import type { ChatSettings } from '../types/chat';
import {
  GEMINI_MODELS,
  SYSTEM_PROMPT_PRESETS,
  THINKING_LEVEL_OPTIONS,
} from '../data/models';

interface SettingsModalProps {
  isOpen: boolean;
  settings: ChatSettings;
  conversationCount: number;
  onClose: () => void;
  onUpdateSettings: (next: ChatSettings) => void;
  onClearAllConversations: () => void;
}

export function SettingsModal({
  isOpen,
  settings,
  conversationCount,
  onClose,
  onUpdateSettings,
  onClearAllConversations,
}: SettingsModalProps) {
  const [confirmClear, setConfirmClear] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setConfirmClear(false);
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedModelMeta = GEMINI_MODELS.find((m) => m.id === settings.defaultModel);
  const supportsXHigh = Boolean(selectedModelMeta?.supportsXHigh);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-4 dark:border-slate-800">
          <div>
            <h2
              id="settings-modal-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-white"
            >
              Model &amp; Prompt Parameters
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Configure Taya assistant behavior, reasoning depth, and system instructions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close parameters"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {/* Default Model */}
          <div>
            <label
              htmlFor="default-model-select"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              Default Model
            </label>
            <select
              id="default-model-select"
              value={settings.defaultModel}
              onChange={(e) => {
                const nextModel = e.target.value;
                const nextSupportsXHigh = Boolean(
                  GEMINI_MODELS.find((m) => m.id === nextModel)?.supportsXHigh
                );
                onUpdateSettings({
                  ...settings,
                  defaultModel: nextModel,
                  thinkingLevel:
                    !nextSupportsXHigh && settings.thinkingLevel === 'XHIGH'
                      ? 'HIGH'
                      : settings.thinkingLevel,
                });
              }}
              className="mt-1.5 h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-teal-500"
            >
              {GEMINI_MODELS.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name} ({model.contextWindow})
                </option>
              ))}
            </select>
          </div>

          {/* Reasoning Depth (ThinkingLevel) */}
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Reasoning Depth
              </span>
              <span className="text-slate-500 dark:text-slate-400">
                {THINKING_LEVEL_OPTIONS.find((o) => o.value === settings.thinkingLevel)?.description}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {THINKING_LEVEL_OPTIONS.map((option) => {
                const disabled = option.value === 'XHIGH' && !supportsXHigh;
                const active = settings.thinkingLevel === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    disabled={disabled}
                    onClick={() =>
                      onUpdateSettings({ ...settings, thinkingLevel: option.value })
                    }
                    className={`rounded-md px-2.5 py-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* System Prompt Presets */}
          <div>
            <label
              htmlFor="system-prompt-textarea"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300"
            >
              System Instructions
            </label>
            <div className="mt-2 flex flex-wrap gap-1.5 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {SYSTEM_PROMPT_PRESETS.map((preset) => {
                const active = settings.systemPrompt.trim() === preset.prompt.trim();
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      onUpdateSettings({ ...settings, systemPrompt: preset.prompt })
                    }
                    className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <textarea
              id="system-prompt-textarea"
              rows={4}
              value={settings.systemPrompt}
              onChange={(e) =>
                onUpdateSettings({ ...settings, systemPrompt: e.target.value })
              }
              placeholder="Optional instructions applied to every message in your conversations..."
              className="mt-2.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500"
            />
          </div>

          {/* Clear History */}
          <div className="flex items-center justify-between border-t border-slate-200 pt-4 dark:border-slate-800">
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {conversationCount} saved {conversationCount === 1 ? 'conversation' : 'conversations'}
            </div>

            {confirmClear ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmClear(false)}
                  className="rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onClearAllConversations();
                    setConfirmClear(false);
                  }}
                  className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
                >
                  Confirm clear
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={conversationCount === 0}
                onClick={() => setConfirmClear(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-40 dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-950/40"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Clear history</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
