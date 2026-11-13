import { useMemo, useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  LogIn,
  LogOut,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Search,
  SlidersHorizontal,
  Sun,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import type { Conversation, ThemeMode } from '../types/chat';
import type { AuthMode } from './AuthModal';

interface SidebarProps {
  conversations: Conversation[];
  activeId: string | null;
  isOpen: boolean;
  theme: ThemeMode;
  user: User | null;
  userDisplayName?: string;
  authReady: boolean;
  onCloseMobile: () => void;
  onSelectConversation: (id: string) => void;
  onNewChat: () => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onOpenAuth: (mode: AuthMode) => void;
  onSignOut: () => void;
}

interface GroupedConversations {
  label: string;
  items: Conversation[];
}

function groupConversationsByDate(conversations: Conversation[]): GroupedConversations[] {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000;
  const startOfSevenDays = startOfToday - 7 * 24 * 60 * 60 * 1000;

  const groups: Record<string, Conversation[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  };

  for (const conv of conversations) {
    if (conv.updatedAt >= startOfToday) {
      groups['Today'].push(conv);
    } else if (conv.updatedAt >= startOfYesterday) {
      groups['Yesterday'].push(conv);
    } else if (conv.updatedAt >= startOfSevenDays) {
      groups['Previous 7 days'].push(conv);
    } else {
      groups['Older'].push(conv);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export function Sidebar({
  conversations,
  activeId,
  isOpen,
  theme,
  user,
  userDisplayName,
  authReady,
  onCloseMobile,
  onSelectConversation,
  onNewChat,
  onRenameConversation,
  onDeleteConversation,
  onToggleTheme,
  onOpenSettings,
  onOpenAuth,
  onSignOut,
}: SidebarProps) {
  const resolvedName =
    userDisplayName?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'Taya User';
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState('');

  const filteredConversations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = [...conversations].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!query) return sorted;
    return sorted.filter(
      (conv) =>
        conv.title.toLowerCase().includes(query) ||
        conv.messages.some((m) => m.content.toLowerCase().includes(query))
    );
  }, [conversations, searchQuery]);

  const grouped = useMemo(
    () => groupConversationsByDate(filteredConversations),
    [filteredConversations]
  );

  const startEditing = (conv: Conversation) => {
    setEditingId(conv.id);
    setDraftTitle(conv.title);
  };

  const commitRename = (e: FormEvent, id: string) => {
    e.preventDefault();
    const trimmed = draftTitle.trim();
    if (trimmed) {
      onRenameConversation(id, trimmed);
    }
    setEditingId(null);
  };

  const sidebarContent = (
    <div className="flex h-full w-[268px] flex-col border-r border-slate-200 bg-slate-50/90 text-slate-900 dark:border-slate-800/90 dark:bg-slate-900/95 dark:text-slate-100">
      {/* Sidebar Top Brand & New Chat */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <span className="font-display text-base font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap shrink-0">
          Taya
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onNewChat}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-700/80 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700/80 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </button>
          <button
            type="button"
            onClick={onCloseMobile}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 md:hidden dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Search Filter */}
      <div className="px-3 py-2">
        <div className="relative flex items-center">
          <Search className="pointer-events-none absolute left-3 h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations"
            aria-label="Search conversations"
            className="h-9 w-full rounded-lg border border-slate-200/90 bg-white pr-8 pl-8 text-xs text-slate-800 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2 rounded p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Conversation List */}
      <nav aria-label="Chat history" className="flex-1 overflow-y-auto px-2.5 py-2">
        {grouped.length === 0 ? (
          <div className="px-2 py-8 text-center text-xs text-slate-500 dark:text-slate-400">
            {searchQuery ? 'No matching conversations found.' : 'No saved conversations yet.'}
          </div>
        ) : (
          <div className="space-y-5">
            {grouped.map((group) => (
              <div key={group.label}>
                <div className="px-2.5 pb-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {group.label}
                </div>
                <ul className="space-y-0.5">
                  {group.items.map((conv) => {
                    const isActive = conv.id === activeId;
                    const isEditing = editingId === conv.id;

                    return (
                      <li key={conv.id} className="group relative">
                        {isEditing ? (
                          <form
                            onSubmit={(e) => commitRename(e, conv.id)}
                            className="flex items-center px-1.5 py-1"
                          >
                            <input
                              type="text"
                              autoFocus
                              value={draftTitle}
                              onChange={(e) => setDraftTitle(e.target.value)}
                              onBlur={(e) => commitRename(e, conv.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Escape') setEditingId(null);
                              }}
                              className="h-8 w-full rounded-md border border-teal-600 bg-white px-2 text-xs text-slate-900 focus:outline-none dark:border-teal-500 dark:bg-slate-950 dark:text-white"
                            />
                          </form>
                        ) : (
                          <div
                            className={`flex items-center justify-between rounded-lg px-2.5 py-2 text-[13px] transition-colors ${
                              isActive
                                ? 'bg-slate-200/80 font-medium text-slate-950 dark:bg-slate-800 dark:text-white'
                                : 'text-slate-700 hover:bg-slate-200/50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => onSelectConversation(conv.id)}
                              className="flex min-w-0 flex-1 items-center gap-2 text-left focus-visible:outline-none"
                            >
                              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                              <span className="truncate">{conv.title}</span>
                            </button>
                            <div
                              className={`ml-1 flex items-center gap-0.5 shrink-0 transition-opacity ${
                                isActive
                                  ? 'opacity-100'
                                  : 'opacity-0 group-hover:opacity-100 focus-within:opacity-100'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startEditing(conv);
                                }}
                                aria-label={`Rename ${conv.title}`}
                                className="rounded p-1 text-slate-500 hover:bg-slate-300/60 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteConversation(conv.id);
                                }}
                                aria-label={`Delete ${conv.title}`}
                                className="rounded p-1 text-slate-500 hover:bg-rose-100 hover:text-rose-700 dark:text-slate-400 dark:hover:bg-rose-950/60 dark:hover:text-rose-400"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </nav>

      {/* Bottom Account & Controls */}
      <div className="border-t border-slate-200 p-2.5 space-y-2 dark:border-slate-800/90">
        {authReady && (
          user ? (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200/80 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-950/60">
              <div className="flex min-w-0 items-center gap-2.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={resolvedName}
                    referrerPolicy="no-referrer"
                    className="h-7 w-7 shrink-0 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                  />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-700 text-xs font-semibold text-white dark:bg-teal-600">
                    {resolvedName.slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <div className="truncate text-xs font-semibold text-slate-900 dark:text-white">
                    {resolvedName}
                  </div>
                  {user.email && (
                    <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {user.email}
                    </div>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200/80 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <p className="mb-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                Sign in to save &amp; sync your chats across sessions.
              </p>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onOpenAuth('login')}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-800 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
                >
                  <LogIn className="h-3 w-3" />
                  <span>Log in</span>
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAuth('signup')}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-teal-700 px-2 text-xs font-semibold text-white transition-colors hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500"
                >
                  <UserPlus className="h-3 w-3" />
                  <span>Sign up</span>
                </button>
              </div>
            </div>
          )
        )}

        <div className="flex items-center justify-between gap-1.5">
          <button
            type="button"
            onClick={onOpenSettings}
            className="flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-200/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
            <span>Model &amp; Prompt</span>
          </button>
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-200/70 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white shrink-0"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop collapsible sidebar */}
      <aside
        className={`hidden md:block shrink-0 transition-[width] duration-200 ease-out overflow-hidden ${
          isOpen ? 'w-[268px]' : 'w-0'
        }`}
        aria-hidden={!isOpen}
      >
        {sidebarContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {isOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="fixed inset-0 bg-slate-950/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-50 h-full">{sidebarContent}</aside>
        </div>
      )}
    </>
  );
}
