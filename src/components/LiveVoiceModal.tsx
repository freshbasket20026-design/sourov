import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioLines, Mic, MicOff, PhoneOff, Volume2, X } from 'lucide-react';

interface LiveVoiceModalProps {
  isOpen: boolean;
  systemPrompt: string;
  onClose: () => void;
}

interface TranscriptEntry {
  id: string;
  speaker: 'You' | 'Taya';
  text: string;
}

const VOICE_OPTIONS = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'] as const;

function pcmFloat32ToBase64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const clamped = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const view = new DataView(bytes.buffer);
  const float32 = new Float32Array(bytes.byteLength / 2);
  for (let i = 0; i < float32.length; i++) {
    float32[i] = view.getInt16(i * 2, true) / 0x8000;
  }
  return float32;
}

export function LiveVoiceModal({
  isOpen,
  systemPrompt,
  onClose,
}: LiveVoiceModalProps) {
  const [voice, setVoice] = useState<(typeof VOICE_OPTIONS)[number]>('Zephyr');
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const [isModelSpeaking, setIsModelSpeaking] = useState(false);
  const [transcripts, setTranscripts] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputCtxRef = useRef<AudioContext | null>(null);
  const outputCtxRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const isMutedRef = useRef(false);
  const nextStartTimeRef = useRef(0);
  const activeSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcripts]);

  const stopScheduledPlayback = useCallback(() => {
    for (const src of activeSourcesRef.current) {
      try {
        src.stop();
      } catch {
        // Ignore already-stopped source
      }
    }
    activeSourcesRef.current.clear();
    if (outputCtxRef.current) {
      nextStartTimeRef.current = outputCtxRef.current.currentTime;
    } else {
      nextStartTimeRef.current = 0;
    }
    setIsModelSpeaking(false);
  }, []);

  const cleanupSession = useCallback(() => {
    stopScheduledPlayback();

    try {
      processorRef.current?.disconnect();
    } catch {
      // Ignore disconnect errors
    }
    processorRef.current = null;

    if (mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
    }

    if (inputCtxRef.current) {
      void inputCtxRef.current.close().catch(() => {});
      inputCtxRef.current = null;
    }

    if (outputCtxRef.current) {
      void outputCtxRef.current.close().catch(() => {});
      outputCtxRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // Ignore close errors
      }
      wsRef.current = null;
    }

    setMicLevel(0);
    setIsModelSpeaking(false);
    setStatus('idle');
  }, [stopScheduledPlayback]);

  useEffect(() => {
    if (!isOpen) {
      cleanupSession();
      return;
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cleanupSession();
        onClose();
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
    };
  }, [isOpen, cleanupSession, onClose]);

  useEffect(() => {
    return () => {
      cleanupSession();
    };
  }, [cleanupSession]);

  const playPcmChunk = useCallback((base64Audio: string) => {
    const ctx = outputCtxRef.current;
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const float32 = base64Pcm16ToFloat32(base64Audio);
    if (float32.length === 0) return;

    const buffer = ctx.createBuffer(1, float32.length, 24000);
    buffer.getChannelData(0).set(float32);

    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const startAt = Math.max(now + 0.01, nextStartTimeRef.current);
    nextStartTimeRef.current = startAt + buffer.duration;

    activeSourcesRef.current.add(source);
    setIsModelSpeaking(true);

    source.onended = () => {
      activeSourcesRef.current.delete(source);
      if (activeSourcesRef.current.size === 0) {
        setIsModelSpeaking(false);
      }
    };

    source.start(startAt);
  }, []);

  const appendTranscript = useCallback((speaker: 'You' | 'Taya', deltaText: string) => {
    if (!deltaText) return;
    setTranscripts((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.speaker === speaker) {
        return [
          ...prev.slice(0, -1),
          { ...last, text: `${last.text}${deltaText}` },
        ];
      }
      return [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          speaker,
          text: deltaText,
        },
      ];
    });
  }, []);

  const startSession = async () => {
    if (status === 'connecting' || status === 'live') return;

    setErrorMsg(null);
    setStatus('connecting');
    setTranscripts([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      mediaStreamRef.current = stream;

      const inputCtx = new AudioContext({ sampleRate: 16000 });
      const outputCtx = new AudioContext({ sampleRate: 24000 });
      inputCtxRef.current = inputCtx;
      outputCtxRef.current = outputCtx;
      nextStartTimeRef.current = outputCtx.currentTime;

      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const params = new URLSearchParams({
        voice,
        systemPrompt,
      });
      const ws = new WebSocket(
        `${wsProtocol}//${window.location.host}/api/live?${params.toString()}`
      );
      wsRef.current = ws;

      ws.onopen = () => {
        const source = inputCtx.createMediaStreamSource(stream);
        const processor = inputCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        source.connect(processor);
        processor.connect(inputCtx.destination);

        processor.onaudioprocess = (event) => {
          const currentWs = wsRef.current;
          if (!currentWs || currentWs.readyState !== WebSocket.OPEN) return;

          const inputData = event.inputBuffer.getChannelData(0);
          if (isMutedRef.current) {
            setMicLevel(0);
            return;
          }

          let sumSq = 0;
          for (let i = 0; i < inputData.length; i++) {
            sumSq += inputData[i] * inputData[i];
          }
          const rms = Math.sqrt(sumSq / inputData.length);
          setMicLevel(Math.min(1, rms * 5));

          const base64 = pcmFloat32ToBase64(inputData);
          currentWs.send(JSON.stringify({ audio: base64 }));
        };
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as {
            ready?: boolean;
            audio?: string;
            inputTranscript?: string;
            outputTranscript?: string;
            interrupted?: boolean;
            error?: string;
          };

          if (msg.ready) {
            setStatus('live');
          }
          if (msg.error) {
            setErrorMsg(msg.error);
            setStatus('error');
          }
          if (msg.audio) {
            playPcmChunk(msg.audio);
          }
          if (msg.inputTranscript) {
            appendTranscript('You', msg.inputTranscript);
          }
          if (msg.outputTranscript) {
            appendTranscript('Taya', msg.outputTranscript);
          }
          if (msg.interrupted) {
            stopScheduledPlayback();
          }
        } catch {
          // Ignore malformed message
        }
      };

      ws.onerror = () => {
        setErrorMsg('Live voice WebSocket connection failed.');
        setStatus('error');
      };

      ws.onclose = () => {
        setStatus((prev) => (prev === 'error' ? 'error' : 'idle'));
      };
    } catch (err: unknown) {
      cleanupSession();
      setErrorMsg(
        err instanceof Error
          ? err.message
          : 'Microphone access is required for live voice conversation.'
      );
      setStatus('error');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px]"
      onClick={() => {
        cleanupSession();
        onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="live-voice-title"
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-800">
          <div>
            <h2
              id="live-voice-title"
              className="font-display text-base font-semibold text-slate-900 dark:text-white"
            >
              Live Voice Conversation
            </h2>
          </div>
          <button
            type="button"
            onClick={() => {
              cleanupSession();
              onClose();
            }}
            aria-label="Close live voice"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Voice Status & Controls */}
        <div className="flex flex-col items-center px-6 py-7 text-center">
          <div
            className={`relative flex h-24 w-24 items-center justify-center rounded-full border transition-transform duration-150 ${
              status === 'live'
                ? isModelSpeaking
                  ? 'border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-950/60 dark:text-teal-300'
                  : 'border-slate-300 bg-slate-50 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white'
                : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'
            }`}
            style={{
              transform:
                status === 'live'
                  ? `scale(${1 + Math.min(0.14, micLevel * 0.14)})`
                  : 'scale(1)',
            }}
          >
            {isModelSpeaking ? (
              <Volume2 className="h-9 w-9" />
            ) : (
              <AudioLines className="h-9 w-9" />
            )}
          </div>

          <div className="mt-4 text-sm font-medium text-slate-900 dark:text-white">
            {status === 'idle' && 'Ready to start voice session'}
            {status === 'connecting' && 'Connecting microphone and Taya voice...'}
            {status === 'live' &&
              (isModelSpeaking
                ? 'Taya is speaking...'
                : isMuted
                  ? 'Microphone muted'
                  : 'Listening — speak naturally')}
            {status === 'error' && 'Voice session interrupted'}
          </div>

          {errorMsg && (
            <p className="mt-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {errorMsg}
            </p>
          )}

          {/* Voice Selector */}
          <div className="mt-5 flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Voice:</span>
            <div className="flex flex-wrap justify-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-slate-950">
              {VOICE_OPTIONS.map((v) => (
                <button
                  key={v}
                  type="button"
                  disabled={status === 'live' || status === 'connecting'}
                  onClick={() => setVoice(v)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    voice === v
                      ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                      : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Action Row */}
          <div className="mt-6 flex items-center gap-3">
            {status === 'live' || status === 'connecting' ? (
              <>
                <button
                  type="button"
                  onClick={() => setIsMuted((prev) => !prev)}
                  className={`inline-flex h-11 items-center gap-2 rounded-xl border px-4 text-xs font-medium transition-colors ${
                    isMuted
                      ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {isMuted ? (
                    <>
                      <MicOff className="h-4 w-4" />
                      <span>Unmute</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-4 w-4" />
                      <span>Mute</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={cleanupSession}
                  className="inline-flex h-11 items-center gap-2 rounded-xl bg-rose-600 px-5 text-xs font-semibold text-white transition-colors hover:bg-rose-700"
                >
                  <PhoneOff className="h-4 w-4" />
                  <span>End session</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => void startSession()}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-teal-700 px-6 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
              >
                <Mic className="h-4 w-4" />
                <span>Start live voice</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Transcript Feed */}
        {transcripts.length > 0 && (
          <div className="max-h-48 overflow-y-auto border-t border-slate-200 bg-slate-50/80 px-5 py-3.5 text-left dark:border-slate-800 dark:bg-slate-950/60">
            <div className="space-y-2.5 text-xs">
              {transcripts.map((entry) => (
                <div key={entry.id} className="leading-relaxed">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {entry.speaker}:{' '}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{entry.text}</span>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
