import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import {
  Download,
  FlipHorizontal,
  FlipVertical,
  ImagePlus,
  Loader2,
  RotateCcw,
  RotateCw,
  Send,
  Sparkles,
  Upload,
  X,
} from 'lucide-react';
import type { ImageAttachment, PhotoEditPlan } from '../types/chat';
import {
  DEFAULT_EDITOR_STATE,
  drawEditedCanvas,
  mergeEditPlan,
  type EditorState,
} from '../utils/imageEditor';

interface PhotoEditorModalProps {
  isOpen: boolean;
  initialImage?: ImageAttachment | null;
  onClose: () => void;
  onAttachToChat: (attachment: ImageAttachment) => void;
}

const FILTER_PRESETS: Array<{ name: string; patch: Partial<EditorState> }> = [
  {
    name: 'Original',
    patch: {
      brightness: 100,
      contrast: 100,
      saturation: 100,
      warmth: 0,
      blur: 0,
      grayscale: 0,
      backgroundMode: 'none',
    },
  },
  {
    name: 'Crisp',
    patch: {
      brightness: 104,
      contrast: 116,
      saturation: 112,
      warmth: -4,
      blur: 0,
      grayscale: 0,
    },
  },
  {
    name: 'Warm Film',
    patch: {
      brightness: 103,
      contrast: 108,
      saturation: 95,
      warmth: 24,
      blur: 0,
      grayscale: 0,
    },
  },
  {
    name: 'B&W Editorial',
    patch: {
      brightness: 102,
      contrast: 122,
      saturation: 0,
      warmth: 0,
      blur: 0,
      grayscale: 100,
    },
  },
];

export function PhotoEditorModal({
  isOpen,
  initialImage,
  onClose,
  onAttachToChat,
}: PhotoEditorModalProps) {
  const [sourceUrl, setSourceUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('edited-photo.png');
  const [editorState, setEditorState] = useState<EditorState>(DEFAULT_EDITOR_STATE);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAiEditing, setIsAiEditing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageElementRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (initialImage?.previewUrl) {
      setSourceUrl(initialImage.previewUrl);
      setFileName(initialImage.name || 'edited-photo.png');
      setEditorState(DEFAULT_EDITOR_STATE);
      setAiNote(null);
      setAiError(null);
    }
  }, [isOpen, initialImage]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const renderPreview = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageElementRef.current;
    if (!canvas || !img) return;
    drawEditedCanvas(canvas, img, editorState, 1200);
  }, [editorState]);

  useEffect(() => {
    if (!sourceUrl) {
      imageElementRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageElementRef.current = img;
      renderPreview();
    };
    img.src = sourceUrl;
  }, [sourceUrl, renderPreview]);

  useEffect(() => {
    renderPreview();
  }, [renderPreview]);

  if (!isOpen) return null;

  const loadFile = (file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSourceUrl(reader.result);
        setFileName(file.name);
        setEditorState(DEFAULT_EDITOR_STATE);
        setAiNote(null);
        setAiError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) loadFile(file);
  };

  const exportFullResolutionDataUrl = (): { dataUrl: string; base64: string } | null => {
    const img = imageElementRef.current;
    if (!img) return null;
    const offscreen = document.createElement('canvas');
    drawEditedCanvas(offscreen, img, editorState);
    const dataUrl = offscreen.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] || '';
    return { dataUrl, base64 };
  };

  const handleDownload = () => {
    const exported = exportFullResolutionDataUrl();
    if (!exported) return;
    const link = document.createElement('a');
    const baseName = fileName.replace(/\.[^.]+$/, '');
    link.download = `${baseName}-edited.png`;
    link.href = exported.dataUrl;
    link.click();
  };

  const handleAttach = () => {
    const exported = exportFullResolutionDataUrl();
    if (!exported) return;
    const baseName = fileName.replace(/\.[^.]+$/, '');
    onAttachToChat({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${baseName}-edited.png`,
      mimeType: 'image/png',
      data: exported.base64,
      previewUrl: exported.dataUrl,
    });
    onClose();
  };

  const handleAiAutoEnhance = async () => {
    const exported = exportFullResolutionDataUrl();
    if (!exported || isAnalyzing) return;
    setIsAnalyzing(true);
    setAiError(null);
    setAiNote(null);

    try {
      const res = await fetch('/api/photo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: {
            mimeType: 'image/png',
            data: exported.base64,
          },
        }),
      });
      const data = (await res.json()) as {
        brightness?: number;
        contrast?: number;
        saturation?: number;
        warmth?: number;
        note?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to analyze image.');
      }
      setEditorState((prev) => ({
        ...prev,
        brightness: data.brightness ?? prev.brightness,
        contrast: data.contrast ?? prev.contrast,
        saturation: data.saturation ?? prev.saturation,
        warmth: data.warmth ?? prev.warmth,
      }));
      if (data.note) setAiNote(data.note);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to analyze photo.');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAiGenerativeEdit = async () => {
    const prompt = aiPrompt.trim();
    if (!prompt || isAiEditing) return;

    const exported = exportFullResolutionDataUrl();
    setIsAiEditing(true);
    setAiError(null);
    setAiNote(null);

    try {
      const res = await fetch('/api/image-edit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          ...(exported
            ? {
                image: {
                  mimeType: 'image/png',
                  data: exported.base64,
                },
              }
            : {}),
        }),
      });
      const data = (await res.json()) as {
        imageUrl?: string;
        editPlan?: PhotoEditPlan;
        note?: string;
        error?: string;
      };
      if (!res.ok || (!data.imageUrl && !data.editPlan)) {
        throw new Error(data.error || 'Failed to apply AI edit.');
      }
      if (data.imageUrl) {
        setSourceUrl(data.imageUrl);
        setEditorState(DEFAULT_EDITOR_STATE);
      } else if (data.editPlan) {
        setEditorState((prev) => mergeEditPlan(prev, data.editPlan!));
      }
      setAiPrompt('');
      if (data.note) setAiNote(data.note);
    } catch (err: unknown) {
      setAiError(err instanceof Error ? err.message : 'Unable to run AI image edit.');
    } finally {
      setIsAiEditing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 sm:p-6 backdrop-blur-[1px]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="photo-editor-title"
    >
      <div
        className="flex max-h-[92dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-3.5 dark:border-slate-800">
          <div className="min-w-0">
            <h2
              id="photo-editor-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-white"
            >
              Photo Studio
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              Adjust lighting, background blur or backdrop color, crop, or edit with Gemini.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 whitespace-nowrap shrink-0"
            >
              <Upload className="h-3.5 w-3.5" />
              <span>{sourceUrl ? 'Replace photo' : 'Upload photo'}</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close photo studio"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Canvas Viewport */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative flex min-h-[280px] flex-1 items-center justify-center bg-slate-100/80 p-4 sm:p-6 dark:bg-slate-950/70 ${
              isDragging ? 'ring-2 ring-inset ring-teal-600' : ''
            }`}
          >
            {sourceUrl ? (
              <canvas
                ref={canvasRef}
                className="max-h-[55vh] lg:max-h-[70vh] max-w-full rounded-lg border border-slate-200/80 object-contain shadow-sm dark:border-slate-800"
              />
            ) : (
              <div className="flex max-w-sm flex-col items-center text-center">
                <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl border border-slate-200 bg-white text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-teal-400">
                  <ImagePlus className="h-5 w-5" />
                </div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Drop a photo here or upload one
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Edit lighting, color, background blur/backdrop, rotation, and crop with Gemini.
                </p>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl bg-teal-700 px-4 text-xs font-medium text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>Choose photo</span>
                </button>
              </div>
            )}
          </div>

          {/* Controls Panel */}
          <div className="w-full shrink-0 space-y-5 overflow-y-auto border-t border-slate-200 p-5 lg:w-80 lg:border-t-0 lg:border-l dark:border-slate-800">
            {/* AI Auto-Enhance */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  AI Enhancement
                </span>
                <button
                  type="button"
                  onClick={() => setEditorState(DEFAULT_EDITOR_STATE)}
                  disabled={!sourceUrl}
                  className="text-xs font-medium text-slate-500 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:text-white"
                >
                  Reset all
                </button>
              </div>
              <button
                type="button"
                disabled={!sourceUrl || isAnalyzing}
                onClick={handleAiAutoEnhance}
                className="mt-2 inline-flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-teal-700/30 bg-teal-50/70 px-3 text-xs font-semibold text-teal-800 transition-colors hover:bg-teal-100/70 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-500/30 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/70"
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Analyzing lighting...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Auto-enhance with Gemini</span>
                  </>
                )}
              </button>

              {aiNote && (
                <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                  {aiNote}
                </p>
              )}
              {aiError && (
                <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs leading-relaxed text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                  {aiError}
                </p>
              )}
            </div>

            {/* Prompt-Based AI Edit */}
            <div>
              <label
                htmlFor="ai-photo-edit-input"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                Prompt-Based Edit
              </label>
              <div className="mt-2 flex gap-1.5">
                <input
                  id="ai-photo-edit-input"
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleAiGenerativeEdit();
                    }
                  }}
                  placeholder="Blur background, sunset backdrop..."
                  className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                />
                <button
                  type="button"
                  disabled={!aiPrompt.trim() || isAiEditing}
                  onClick={() => void handleAiGenerativeEdit()}
                  className="inline-flex h-9 items-center justify-center rounded-lg bg-slate-900 px-3 text-xs font-medium text-white transition-colors hover:bg-slate-800 disabled:opacity-40 dark:bg-slate-100 dark:text-slate-950 dark:hover:bg-slate-200 whitespace-nowrap shrink-0"
                >
                  {isAiEditing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Apply'}
                </button>
              </div>
            </div>

            {/* Background Mode */}
            <div>
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Background
              </span>
              <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                {(
                  [
                    { id: 'none', label: 'None' },
                    { id: 'blur', label: 'Blur' },
                    { id: 'color', label: 'Solid' },
                    { id: 'gradient', label: 'Gradient' },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    disabled={!sourceUrl}
                    onClick={() =>
                      setEditorState((prev) => ({ ...prev, backgroundMode: mode.id }))
                    }
                    className={`rounded-md py-1 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                      editorState.backgroundMode === mode.id
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {editorState.backgroundMode === 'blur' && (
                <div className="mt-2.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">
                      Background Blur
                    </span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {editorState.backgroundBlur}px
                    </span>
                  </div>
                  <input
                    type="range"
                    min={4}
                    max={24}
                    value={editorState.backgroundBlur}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        backgroundBlur: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-teal-700 dark:accent-teal-500"
                  />
                </div>
              )}

              {(editorState.backgroundMode === 'color' ||
                editorState.backgroundMode === 'gradient') && (
                <div className="mt-2.5 flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                    <span>Color 1</span>
                    <input
                      type="color"
                      value={editorState.backgroundColor}
                      onChange={(e) =>
                        setEditorState((prev) => ({
                          ...prev,
                          backgroundColor: e.target.value,
                        }))
                      }
                      className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
                    />
                  </label>
                  {editorState.backgroundMode === 'gradient' && (
                    <label className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <span>Color 2</span>
                      <input
                        type="color"
                        value={editorState.backgroundColor2}
                        onChange={(e) =>
                          setEditorState((prev) => ({
                            ...prev,
                            backgroundColor2: e.target.value,
                          }))
                        }
                        className="h-7 w-9 cursor-pointer rounded border border-slate-200 bg-transparent p-0.5 dark:border-slate-700"
                      />
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Presets */}
            <div>
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Presets
              </span>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {FILTER_PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    disabled={!sourceUrl}
                    onClick={() =>
                      setEditorState((prev) => ({ ...prev, ...preset.patch }))
                    }
                    className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Manual Sliders */}
            <div className="space-y-3">
              {[
                { key: 'brightness' as const, label: 'Brightness', min: 50, max: 150, suffix: '%' },
                { key: 'contrast' as const, label: 'Contrast', min: 50, max: 150, suffix: '%' },
                { key: 'saturation' as const, label: 'Saturation', min: 0, max: 180, suffix: '%' },
                { key: 'warmth' as const, label: 'Warmth', min: -40, max: 40, suffix: '' },
                { key: 'blur' as const, label: 'Blur', min: 0, max: 8, suffix: 'px' },
              ].map((slider) => (
                <div key={slider.key}>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">{slider.label}</span>
                    <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                      {editorState[slider.key]}
                      {slider.suffix}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    disabled={!sourceUrl}
                    value={editorState[slider.key]}
                    onChange={(e) =>
                      setEditorState((prev) => ({
                        ...prev,
                        [slider.key]: Number(e.target.value),
                      }))
                    }
                    className="mt-1 w-full accent-teal-700 disabled:opacity-40 dark:accent-teal-500"
                  />
                </div>
              ))}
            </div>

            {/* Transform & Aspect */}
            <div>
              <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                Crop &amp; Transform
              </span>
              <div className="mt-2 flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={!sourceUrl}
                  onClick={() =>
                    setEditorState((prev) => ({
                      ...prev,
                      rotation: (prev.rotation + 270) % 360,
                    }))
                  }
                  aria-label="Rotate left 90 degrees"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!sourceUrl}
                  onClick={() =>
                    setEditorState((prev) => ({
                      ...prev,
                      rotation: (prev.rotation + 90) % 360,
                    }))
                  }
                  aria-label="Rotate right 90 degrees"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!sourceUrl}
                  onClick={() =>
                    setEditorState((prev) => ({ ...prev, flipH: !prev.flipH }))
                  }
                  aria-label="Flip horizontally"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FlipHorizontal className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!sourceUrl}
                  onClick={() =>
                    setEditorState((prev) => ({ ...prev, flipV: !prev.flipV }))
                  }
                  aria-label="Flip vertically"
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-800 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <FlipVertical className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
                {(['original', '1:1', '4:3', '16:9'] as const).map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    disabled={!sourceUrl}
                    onClick={() => setEditorState((prev) => ({ ...prev, aspect: ratio }))}
                    className={`rounded-md py-1 text-[11px] font-medium capitalize transition-colors disabled:opacity-40 ${
                      editorState.aspect === ratio
                        ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                        : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Export / Send Actions */}
            <div className="flex gap-2 border-t border-slate-200 pt-4 dark:border-slate-800">
              <button
                type="button"
                disabled={!sourceUrl}
                onClick={handleDownload}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Save PNG</span>
              </button>
              <button
                type="button"
                disabled={!sourceUrl}
                onClick={handleAttach}
                className="inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-medium text-white transition-colors hover:bg-teal-800 disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500 whitespace-nowrap"
              >
                <Send className="h-3.5 w-3.5" />
                <span>Use in chat</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
