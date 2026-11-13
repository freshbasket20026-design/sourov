import { useCallback, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import { AuthModal, type AuthMode } from './components/AuthModal';
import { ChatHeader } from './components/ChatHeader';
import { Composer } from './components/Composer';
import { LiveVoiceModal } from './components/LiveVoiceModal';
import { MessageList } from './components/MessageList';
import { PhotoEditorModal } from './components/PhotoEditorModal';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar } from './components/Sidebar';
import { auth } from './firebase';
import {
  clearCloudConversations,
  deleteCloudConversation,
  ensureConversationDoc,
  getUserDisplayName,
  loadConversationMessages,
  saveMessageDoc,
  subscribeUserConversations,
  syncUserProfile,
} from './services/firestoreChat';
import type {
  ChatMessage,
  ChatSettings,
  Conversation,
  GroundingSource,
  ImageAttachment,
  PhotoEditPlan,
  ThemeMode,
  TokenUsage,
} from './types/chat';
import { renderEditPlanToDataUrl } from './utils/imageEditor';
import {
  loadActiveConversationId,
  loadConversations,
  loadSettings,
  loadTheme,
  saveActiveConversationId,
  saveConversations,
  saveSettings,
  saveTheme,
} from './utils/storage';

function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

interface StreamChunkPayload {
  delta?: string;
  sources?: GroundingSource[];
  usage?: TokenUsage;
  generatedImageUrl?: string;
  editPlan?: PhotoEditPlan;
  done?: boolean;
  error?: string;
}

export default function App() {
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    loadConversations()
  );
  const [activeId, setActiveId] = useState<string | null>(() =>
    loadActiveConversationId()
  );
  const [settings, setSettings] = useState<ChatSettings>(() => loadSettings());
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme());
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [editingAttachment, setEditingAttachment] = useState<ImageAttachment | null>(
    null
  );
  const [editingFromMessage, setEditingFromMessage] = useState(false);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);

  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState<string>('');
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');

  const [composerValue, setComposerValue] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [draftModel, setDraftModel] = useState<string>(
    () => loadSettings().defaultModel
  );

  const abortControllerRef = useRef<AbortController | null>(null);
  const userRef = useRef<User | null>(null);
  const loadedCloudConvIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const activeConversation =
    conversations.find((c) => c.id === activeId) || null;
  const activeModel = activeConversation?.model || draftModel;

  // Firebase Auth listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      loadedCloudConvIdsRef.current.clear();

      if (nextUser) {
        setUserDisplayName(
          nextUser.displayName?.trim() ||
            nextUser.email?.split('@')[0] ||
            'Taya User'
        );
        void syncUserProfile(nextUser)
          .then(() => getUserDisplayName(nextUser.uid))
          .then((name) => {
            if (name) setUserDisplayName(name);
          })
          .catch(() => {});
      } else {
        setUserDisplayName('');
      }
    });
    return () => unsubscribe();
  }, []);

  // Sync user's Firestore conversations when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const unsubscribe = subscribeUserConversations(
      user.uid,
      (cloudConvs) => {
        setConversations((prev) => {
          const prevMap = new Map(prev.map((c) => [c.id, c]));
          const cloudIds = new Set(cloudConvs.map((c) => c.id));
          const merged = cloudConvs.map((c) => {
            const existing = prevMap.get(c.id);
            return existing ? { ...c, messages: existing.messages } : c;
          });
          // Keep any brand-new unsaved conversation still streaming locally
          for (const localConv of prev) {
            if (!cloudIds.has(localConv.id) && localConv.messages.length > 0) {
              merged.unshift(localConv);
            }
          }
          return merged;
        });
      },
      () => {
        // Error already logged in structured JSON by handleFirestoreError
      }
    );

    return () => unsubscribe();
  }, [authReady, user]);

  // Lazy-load messages for the selected cloud conversation
  useEffect(() => {
    if (!authReady || !user || !activeId) return;
    if (loadedCloudConvIdsRef.current.has(activeId)) return;

    const current = conversations.find((c) => c.id === activeId);
    if (!current || current.messages.length > 0) {
      loadedCloudConvIdsRef.current.add(activeId);
      return;
    }

    loadedCloudConvIdsRef.current.add(activeId);
    void loadConversationMessages(user.uid, activeId)
      .then((msgs) => {
        if (msgs.length === 0) return;
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeId && c.messages.length === 0
              ? { ...c, messages: msgs }
              : c
          )
        );
      })
      .catch(() => {});
  }, [authReady, user, activeId, conversations]);

  // Sync theme to document root
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    saveTheme(theme);
  }, [theme]);

  // Persist local conversations when signed out
  useEffect(() => {
    if (!user) {
      saveConversations(conversations);
    }
  }, [conversations, user]);

  // Persist active conversation id
  useEffect(() => {
    saveActiveConversationId(activeId);
  }, [activeId]);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (!isStreaming) {
          setActiveId(null);
          setDraftModel(settings.defaultModel);
        }
      } else if (e.key === 'Escape' && isStreaming) {
        abortControllerRef.current?.abort();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isStreaming, settings.defaultModel]);

  const stopStreaming = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setIsStreaming(false);
  }, []);

  const handleNewChat = useCallback(() => {
    if (isStreaming) {
      stopStreaming();
    }
    setActiveId(null);
    setDraftModel(settings.defaultModel);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, [isStreaming, settings.defaultModel, stopStreaming]);

  const handleSelectConversation = useCallback(
    (id: string) => {
      if (isStreaming) {
        stopStreaming();
      }
      setActiveId(id);
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setSidebarOpen(false);
      }
    },
    [isStreaming, stopStreaming]
  );

  const handleSelectModel = useCallback(
    (modelId: string) => {
      if (activeConversation) {
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConversation.id ? { ...c, model: modelId } : c
          )
        );
      } else {
        setDraftModel(modelId);
      }
    },
    [activeConversation]
  );

  const autoGenerateTitle = useCallback(
    async (
      convId: string,
      userMessage: string,
      assistantMessage: string,
      modelUsed: string
    ) => {
      try {
        const res = await fetch('/api/title', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userMessage, assistantMessage }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { title?: string };
        if (data.title) {
          setConversations((prev) =>
            prev.map((c) => (c.id === convId ? { ...c, title: data.title! } : c))
          );
          if (userRef.current) {
            void ensureConversationDoc(userRef.current.uid, {
              id: convId,
              title: data.title,
              model: modelUsed,
            }).catch(() => {});
          }
        }
      } catch {
        // Keep initial fallback title
      }
    },
    []
  );

  const streamCompletion = useCallback(
    async (
      convId: string,
      historyForApi: ChatMessage[],
      assistantMsgId: string,
      model: string,
      isFirstExchange: boolean
    ) => {
      const controller = new AbortController();
      abortControllerRef.current = controller;
      setIsStreaming(true);

      let accumulatedContent = '';
      let finalUsage: TokenUsage | undefined;
      let streamErrorOccurred = false;

      const lastImageFromHistory = [...historyForApi]
        .reverse()
        .find((m) => Array.isArray(m.images) && m.images.length > 0)
        ?.images?.slice(-1)[0];

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            model,
            thinkingLevel: settings.thinkingLevel,
            systemPrompt: settings.systemPrompt,
            enableWebSearch: settings.webSearchEnabled,
            messages: historyForApi.map((m) => ({
              role: m.role,
              content: m.content,
              images: m.images?.map((img) => ({
                mimeType: img.mimeType,
                data: img.data,
              })),
            })),
          }),
        });

        if (!response.ok) {
          let errorText = `Request failed (${response.status})`;
          try {
            const errJson = (await response.json()) as { error?: string };
            if (errJson.error) errorText = errJson.error;
          } catch {
            // Keep default HTTP status message
          }
          throw new Error(errorText);
        }

        if (!response.body) {
          throw new Error('Streaming response body is unavailable.');
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const rawEvent of events) {
            const lines = rawEvent.split('\n');
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr) continue;

              let payload: StreamChunkPayload;
              try {
                payload = JSON.parse(jsonStr) as StreamChunkPayload;
              } catch {
                continue;
              }

              if (payload.error) {
                throw new Error(payload.error);
              }

              if (payload.generatedImageUrl) {
                const url = payload.generatedImageUrl;
                const base64 = url.split(',')[1] || '';
                const genAttachment: ImageAttachment = {
                  id: createId(),
                  name: 'edited-photo.png',
                  mimeType: 'image/png',
                  data: base64,
                  previewUrl: url,
                };
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      updatedAt: Date.now(),
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId
                          ? { ...m, generatedImage: genAttachment }
                          : m
                      ),
                    };
                  })
                );
              }

              const sourceDataUrl =
                lastImageFromHistory?.previewUrl ||
                (lastImageFromHistory?.data && lastImageFromHistory?.mimeType
                  ? `data:${lastImageFromHistory.mimeType};base64,${lastImageFromHistory.data}`
                  : '');
              if (payload.editPlan && lastImageFromHistory && sourceDataUrl) {
                try {
                  const rendered = await renderEditPlanToDataUrl(
                    sourceDataUrl,
                    payload.editPlan
                  );
                  const baseName = lastImageFromHistory.name.replace(/\.[^.]+$/, '');
                  const genAttachment: ImageAttachment = {
                    id: createId(),
                    name: `${baseName}-edited.png`,
                    mimeType: 'image/png',
                    data: rendered.base64,
                    previewUrl: rendered.dataUrl,
                  };
                  setConversations((prev) =>
                    prev.map((c) => {
                      if (c.id !== convId) return c;
                      return {
                        ...c,
                        updatedAt: Date.now(),
                        messages: c.messages.map((m) =>
                          m.id === assistantMsgId
                            ? { ...m, generatedImage: genAttachment }
                            : m
                        ),
                      };
                    })
                  );
                } catch {
                  // Ignore canvas fallback render error
                }
              }

              if (payload.delta) {
                accumulatedContent += payload.delta;
                const currentText = accumulatedContent;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      updatedAt: Date.now(),
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, content: currentText } : m
                      ),
                    };
                  })
                );
              }

              if (payload.sources && payload.sources.length > 0) {
                const sourcesData = payload.sources;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, sources: sourcesData } : m
                      ),
                    };
                  })
                );
              }

              if (payload.usage) {
                const usageData = payload.usage;
                finalUsage = usageData;
                setConversations((prev) =>
                  prev.map((c) => {
                    if (c.id !== convId) return c;
                    return {
                      ...c,
                      messages: c.messages.map((m) =>
                        m.id === assistantMsgId ? { ...m, usage: usageData } : m
                      ),
                    };
                  })
                );
              }
            }
          }
        }

        if (isFirstExchange && accumulatedContent.trim().length > 0) {
          const firstUserText = historyForApi[0]?.content || 'Image analysis';
          void autoGenerateTitle(convId, firstUserText, accumulatedContent, model);
        }
      } catch (err: unknown) {
        const isAbort =
          err instanceof Error &&
          (err.name === 'AbortError' || err.message.toLowerCase().includes('aborted'));

        if (!isAbort) {
          streamErrorOccurred = true;
          const message =
            err instanceof Error ? err.message : 'Unable to reach Gemini API.';
          setConversations((prev) =>
            prev.map((c) => {
              if (c.id !== convId) return c;
              return {
                ...c,
                updatedAt: Date.now(),
                messages: c.messages.map((m) =>
                  m.id === assistantMsgId ? { ...m, error: message } : m
                ),
              };
            })
          );
        }
      } finally {
        abortControllerRef.current = null;
        setIsStreaming(false);
        if (!streamErrorOccurred && userRef.current && accumulatedContent.trim().length > 0) {
          void saveMessageDoc(userRef.current.uid, convId, {
            id: assistantMsgId,
            role: 'assistant',
            content: accumulatedContent,
            createdAt: Date.now(),
            model,
            ...(finalUsage ? { usage: finalUsage } : {}),
          }).catch(() => {});
        }
      }
    },
    [
      autoGenerateTitle,
      settings.systemPrompt,
      settings.thinkingLevel,
      settings.webSearchEnabled,
    ]
  );

  const sendMessage = useCallback(
    async (textOverride?: string) => {
      const content = (textOverride ?? composerValue).trim();
      const outgoingImages = textOverride ? [] : attachments;
      if ((!content && outgoingImages.length === 0) || isStreaming) return;

      if (!textOverride) {
        setComposerValue('');
        setAttachments([]);
      }

      const now = Date.now();
      const userMsg: ChatMessage = {
        id: createId(),
        role: 'user',
        content,
        createdAt: now,
        ...(outgoingImages.length > 0 ? { images: outgoingImages } : {}),
      };
      const assistantMsg: ChatMessage = {
        id: createId(),
        role: 'assistant',
        content: '',
        createdAt: now + 1,
        model: activeModel,
      };

      if (!activeConversation) {
        const convId = createId();
        const fallbackLabel = content || outgoingImages[0]?.name || 'Photo chat';
        const initialTitle =
          fallbackLabel.length > 42
            ? `${fallbackLabel.slice(0, 42).trim()}...`
            : fallbackLabel;
        const newConv: Conversation = {
          id: convId,
          title: initialTitle,
          model: activeModel,
          messages: [userMsg, assistantMsg],
          createdAt: now,
          updatedAt: now,
        };
        setConversations((prev) => [newConv, ...prev]);
        loadedCloudConvIdsRef.current.add(convId);
        setActiveId(convId);

        if (userRef.current) {
          const uid = userRef.current.uid;
          void ensureConversationDoc(uid, {
            id: convId,
            title: initialTitle,
            model: activeModel,
          })
            .then(() => saveMessageDoc(uid, convId, userMsg))
            .catch(() => {});
        }

        await streamCompletion(convId, [userMsg], assistantMsg.id, activeModel, true);
      } else {
        const convId = activeConversation.id;
        const historyForApi = [
          ...activeConversation.messages.filter((m) => !m.error),
          userMsg,
        ];
        const isFirstExchange = activeConversation.messages.length === 0;

        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== convId) return c;
            return {
              ...c,
              updatedAt: now,
              messages: [...c.messages, userMsg, assistantMsg],
            };
          })
        );

        if (userRef.current) {
          const uid = userRef.current.uid;
          void ensureConversationDoc(uid, {
            id: convId,
            title: activeConversation.title,
            model: activeConversation.model,
          })
            .then(() => saveMessageDoc(uid, convId, userMsg))
            .catch(() => {});
        }

        await streamCompletion(
          convId,
          historyForApi,
          assistantMsg.id,
          activeConversation.model,
          isFirstExchange
        );
      }
    },
    [
      activeConversation,
      activeModel,
      attachments,
      composerValue,
      isStreaming,
      streamCompletion,
    ]
  );

  const handleRegenerate = useCallback(async () => {
    if (!activeConversation || isStreaming) return;
    const msgs = activeConversation.messages;
    if (msgs.length === 0) return;

    const lastUserIdx = [...msgs].reverse().findIndex((m) => m.role === 'user');
    if (lastUserIdx < 0) return;

    const cutIndex = msgs.length - 1 - lastUserIdx;
    const historyUpToLastUser = msgs
      .slice(0, cutIndex + 1)
      .filter((m) => !m.error);
    const now = Date.now();
    const freshAssistantMsg: ChatMessage = {
      id: createId(),
      role: 'assistant',
      content: '',
      createdAt: now,
      model: activeConversation.model,
    };

    setConversations((prev) =>
      prev.map((c) => {
        if (c.id !== activeConversation.id) return c;
        return {
          ...c,
          updatedAt: now,
          messages: [...msgs.slice(0, cutIndex + 1), freshAssistantMsg],
        };
      })
    );

    await streamCompletion(
      activeConversation.id,
      historyUpToLastUser,
      freshAssistantMsg.id,
      activeConversation.model,
      false
    );
  }, [activeConversation, isStreaming, streamCompletion]);

  const handleRenameConversation = useCallback((id: string, title: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, title } : c))
    );
    if (userRef.current) {
      const target = conversations.find((c) => c.id === id);
      void ensureConversationDoc(userRef.current.uid, {
        id,
        title,
        model: target?.model || 'gemini-3.1-flash-lite',
      }).catch(() => {});
    }
  }, [conversations]);

  const handleDeleteConversation = useCallback(
    (id: string) => {
      if (id === activeId && isStreaming) {
        stopStreaming();
      }
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (activeId === id) {
        setActiveId(null);
      }
      if (userRef.current) {
        void deleteCloudConversation(userRef.current.uid, id).catch(() => {});
      }
    },
    [activeId, isStreaming, stopStreaming]
  );

  const handleClearAllConversations = useCallback(() => {
    if (isStreaming) stopStreaming();
    const idsToDelete = conversations.map((c) => c.id);
    setConversations([]);
    setActiveId(null);
    if (userRef.current && idsToDelete.length > 0) {
      void clearCloudConversations(userRef.current.uid, idsToDelete).catch(() => {});
    }
  }, [conversations, isStreaming, stopStreaming]);

  const handleOpenAuth = useCallback((mode: AuthMode) => {
    setAuthMode(mode);
    setAuthModalOpen(true);
  }, []);

  const handleSignOut = useCallback(async () => {
    if (isStreaming) stopStreaming();
    loadedCloudConvIdsRef.current.clear();
    setConversations([]);
    setActiveId(null);
    saveConversations([]);
    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out errors
    }
  }, [isStreaming, stopStreaming]);

  return (
    <div className="flex h-dvh w-full overflow-hidden bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        isOpen={sidebarOpen}
        theme={theme}
        user={user}
        userDisplayName={userDisplayName}
        authReady={authReady}
        onCloseMobile={() => setSidebarOpen(false)}
        onSelectConversation={handleSelectConversation}
        onNewChat={handleNewChat}
        onRenameConversation={handleRenameConversation}
        onDeleteConversation={handleDeleteConversation}
        onToggleTheme={() =>
          setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
        }
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenAuth={handleOpenAuth}
        onSignOut={() => void handleSignOut()}
      />

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden bg-white dark:bg-slate-950">
        {/* Subtle custom background photo */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-0 overflow-hidden select-none"
        >
          <img
            src="/assets/aistudio/Screenshot_2026-11-12_181559_2770e94e.png"
            alt=""
            className="h-full w-full object-cover object-top opacity-[0.15] dark:opacity-[0.13]"
          />
        </div>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col">
          <ChatHeader
            selectedModel={activeModel}
            isSidebarOpen={sidebarOpen}
            isStreaming={isStreaming}
            user={user}
            userDisplayName={userDisplayName}
            authReady={authReady}
            onSelectModel={handleSelectModel}
            onToggleSidebar={() => setSidebarOpen((prev) => !prev)}
            onNewChat={handleNewChat}
            onOpenPhotoEditor={() => {
              setEditingAttachment(null);
              setEditingFromMessage(false);
              setPhotoEditorOpen(true);
            }}
            onOpenLiveVoice={() => setLiveVoiceOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenAuth={handleOpenAuth}
            onSignOut={() => void handleSignOut()}
          />

          <MessageList
            messages={activeConversation?.messages || []}
            isStreaming={isStreaming}
            onSelectStarter={(prompt) => void sendMessage(prompt)}
            onEditImageInStudio={(img) => {
              setEditingAttachment(img);
              setEditingFromMessage(true);
              setPhotoEditorOpen(true);
            }}
            onRegenerate={() => void handleRegenerate()}
            onRetryError={() => void handleRegenerate()}
          />

          <Composer
            value={composerValue}
            attachments={attachments}
            webSearchEnabled={settings.webSearchEnabled}
            isStreaming={isStreaming}
            onChange={setComposerValue}
            onAddAttachment={(att) => setAttachments((prev) => [...prev, att])}
            onEditAttachment={(att) => {
              setEditingAttachment(att);
              setEditingFromMessage(false);
              setPhotoEditorOpen(true);
            }}
            onRemoveAttachment={(id) =>
              setAttachments((prev) => prev.filter((a) => a.id !== id))
            }
            onToggleWebSearch={() =>
              setSettings((prev) => ({
                ...prev,
                webSearchEnabled: !prev.webSearchEnabled,
              }))
            }
            onOpenLiveVoice={() => setLiveVoiceOpen(true)}
            onSubmit={() => void sendMessage()}
            onStop={stopStreaming}
          />
        </div>
      </main>

      <SettingsModal
        isOpen={settingsOpen}
        settings={settings}
        conversationCount={conversations.length}
        onClose={() => setSettingsOpen(false)}
        onUpdateSettings={(next) => {
          setSettings(next);
          if (!activeConversation) {
            setDraftModel(next.defaultModel);
          }
        }}
        onClearAllConversations={handleClearAllConversations}
      />

      <PhotoEditorModal
        isOpen={photoEditorOpen}
        initialImage={editingAttachment}
        onClose={() => {
          setPhotoEditorOpen(false);
          setEditingAttachment(null);
          setEditingFromMessage(false);
        }}
        onAttachToChat={(editedAttachment) => {
          if (editingAttachment && !editingFromMessage) {
            setAttachments((prev) =>
              prev.map((a) => (a.id === editingAttachment.id ? editedAttachment : a))
            );
          } else {
            setAttachments((prev) => [...prev, editedAttachment]);
          }
        }}
      />

      <LiveVoiceModal
        isOpen={liveVoiceOpen}
        systemPrompt={settings.systemPrompt}
        onClose={() => setLiveVoiceOpen(false)}
      />

      <AuthModal
        isOpen={authModalOpen}
        initialMode={authMode}
        onClose={() => setAuthModalOpen(false)}
        onAuthenticated={(_authedUser, customName) => {
          if (customName) {
            setUserDisplayName(customName);
          }
        }}
      />
    </div>
  );
}
