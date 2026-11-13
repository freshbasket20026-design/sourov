import type { User } from 'firebase/auth';
import {
  AudioLines,
  ImagePlus,
  LogIn,
  LogOut,
  PanelLeft,
  Plus,
  SlidersHorizontal,
  UserPlus,
} from 'lucide-react';
import type { AuthMode } from './AuthModal';

interface ChatHeaderProps {
  selectedModel?: string;
  isSidebarOpen: boolean;
  isStreaming?: boolean;
  user: User | null;
  userDisplayName?: string;
  authReady: boolean;
  onSelectModel?: (modelId: string) => void;
  onToggleSidebar: () => void;
  onNewChat: () => void;
  onOpenPhotoEditor: () => void;
  onOpenLiveVoice: () => void;
  onOpenSettings: () => void;
  onOpenAuth: (mode: AuthMode) => void;
  onSignOut: () => void;
}

export function ChatHeader({
  isSidebarOpen,
  user,
  userDisplayName,
  authReady,
  onToggleSidebar,
  onNewChat,
  onOpenPhotoEditor,
  onOpenLiveVoice,
  onOpenSettings,
  onOpenAuth,
  onSignOut,
}: ChatHeaderProps) {
  const displayLabel =
    userDisplayName?.trim() ||
    user?.displayName?.trim() ||
    user?.email?.split('@')[0] ||
    'Account';

  return (
    <header className="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-slate-200 bg-white/90 px-4 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-950/90">
      <div className="flex items-center gap-2 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white shrink-0"
        >
          <PanelLeft className="h-4 w-4" />
        </button>

        {!isSidebarOpen && (
          <button
            type="button"
            onClick={onNewChat}
            aria-label="Start new chat"
            className="hidden sm:inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New chat</span>
          </button>
        )}

        {/* Brand Title */}
        <div className="flex items-center gap-2 px-2">
          <span className="font-display text-sm font-semibold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            Taya
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpenPhotoEditor}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Photo Studio</span>
        </button>

        <button
          type="button"
          onClick={onOpenLiveVoice}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
        >
          <AudioLines className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Live Voice</span>
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Open model and prompt parameters"
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white whitespace-nowrap shrink-0"
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Parameters</span>
        </button>

        {authReady && !user && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onOpenAuth('login')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Log in</span>
            </button>
            <button
              type="button"
              onClick={() => onOpenAuth('signup')}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:bg-teal-600 dark:hover:bg-teal-500 whitespace-nowrap shrink-0"
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Sign up</span>
            </button>
          </div>
        )}

        {authReady && user && (
          <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium text-slate-800 dark:text-slate-200">
              {user.photoURL ? (
                <img
                  src={user.photoURL}
                  alt={displayLabel}
                  referrerPolicy="no-referrer"
                  className="h-6 w-6 rounded-full border border-slate-200 object-cover dark:border-slate-700"
                />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-teal-700 text-[11px] font-semibold text-white dark:bg-teal-600">
                  {displayLabel.slice(0, 1).toUpperCase()}
                </span>
              )}
              <span className="hidden lg:inline max-w-[120px] truncate">
                {displayLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sign out"
              title="Sign out"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white shrink-0"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
