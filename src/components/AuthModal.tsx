import { useEffect, useState } from 'react';
import { signInWithPopup, updateProfile, type User } from 'firebase/auth';
import { CheckCircle2, LogIn, ShieldCheck, UserPlus, X } from 'lucide-react';
import { auth, googleProvider } from '../firebase';
import { syncUserProfile } from '../services/firestoreChat';

export type AuthMode = 'login' | 'signup';

interface AuthModalProps {
  isOpen: boolean;
  initialMode: AuthMode;
  onClose: () => void;
  onAuthenticated: (user: User, displayName?: string) => void;
}

export function AuthModal({
  isOpen,
  initialMode,
  onClose,
  onAuthenticated,
}: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [displayName, setDisplayName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setMode(initialMode);
      setErrorMessage(null);
    }
  }, [isOpen, initialMode]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isSubmitting) {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const handleGoogleAuth = async () => {
    if (isSubmitting) return;
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const credential = await signInWithPopup(auth, googleProvider);
      const user = credential.user;
      const customName = mode === 'signup' ? displayName.trim().slice(0, 80) : '';

      if (customName && customName !== user.displayName) {
        try {
          await updateProfile(user, { displayName: customName });
        } catch {
          // Non-fatal if profile display update fails
        }
      }

      await syncUserProfile(user, customName || undefined);
      onAuthenticated(user, customName || undefined);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed.';
      if (msg.includes('popup-closed-by-user')) {
        setErrorMessage('Sign-in window was closed before completing.');
      } else if (msg.includes('popup-blocked')) {
        setErrorMessage('Pop-up was blocked by your browser. Please allow pop-ups and try again.');
      } else {
        setErrorMessage(msg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-[2px]"
      onClick={() => {
        if (!isSubmitting) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4 dark:border-slate-800">
          <div>
            <h2
              id="auth-modal-title"
              className="font-display text-lg font-semibold text-slate-900 dark:text-white"
            >
              {mode === 'login' ? 'Welcome back to Taya' : 'Create your Taya account'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {mode === 'login'
                ? 'Log in to access your saved chats and preferences.'
                : 'Sign up to sync conversations privately across devices.'}
            </p>
          </div>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
            aria-label="Close authentication modal"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-5">
          <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-950">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setMode('login');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <LogIn className="h-3.5 w-3.5" />
              <span>Log in</span>
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setMode('signup');
                setErrorMessage(null);
              }}
              className={`inline-flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-colors ${
                mode === 'signup'
                  ? 'bg-white text-slate-900 shadow-xs dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5" />
              <span>Sign up</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-6 py-5">
          {mode === 'signup' && (
            <div>
              <label
                htmlFor="signup-display-name"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                Display Name (optional)
              </label>
              <input
                id="signup-display-name"
                type="text"
                maxLength={80}
                disabled={isSubmitting}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How Taya should address you"
                className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-teal-600 focus:outline-none disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-teal-500"
              />
            </div>
          )}

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleGoogleAuth()}
            className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-slate-200 bg-slate-900 px-4 text-sm font-semibold text-white transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600 disabled:opacity-60 dark:border-slate-700 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            <span>
              {isSubmitting
                ? 'Connecting...'
                : mode === 'login'
                  ? 'Log in with Google'
                  : 'Sign up with Google'}
            </span>
          </button>

          {errorMessage && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2 rounded-xl border border-slate-200/80 bg-slate-50/80 p-3.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-400">
            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
              <ShieldCheck className="h-4 w-4 text-teal-600 dark:text-teal-400" />
              <span>Private cloud workspace</span>
            </div>
            <div className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-600 dark:text-teal-400" />
              <span>
                Your chat history and profile are securely stored and accessible only to your signed-in account.
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
