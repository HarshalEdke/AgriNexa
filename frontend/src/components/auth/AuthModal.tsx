import { useState, useEffect, FormEvent } from 'react';
import { X, Lock, Mail, Info, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../Button';
import { useAuth } from '../../context/AuthContext';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}

export function AuthModal({ isOpen, onClose, initialMode = 'login' }: AuthModalProps) {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [infoNotice, setInfoNotice] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setInfoNotice(null);
    setIsSubmitting(true);

    try {
      if (mode === 'login') {
        await login({ email, password });
      } else {
        await register({ email, password });
      }
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Authentication failed. Please check your credentials.';
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModeChange = (newMode: 'login' | 'signup') => {
    setMode(newMode);
    setInfoNotice(null);
    setErrorMessage(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Account Authentication"
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xl"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close authentication modal"
          className="absolute right-5 top-5 rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
        >
          <X size={18} />
        </button>

        {/* Modal Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Lock size={22} strokeWidth={2.2} />
          </div>
          <h2
            id="auth-modal-title"
            className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl"
          >
            {mode === 'login' ? 'Sign In to AgriNexa AI' : 'Create an Account'}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Authentication is optional. All diagnostic and advisory tools remain fully open.
          </p>
        </div>

        {/* Status Notice for Contract Boundary */}
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs text-emerald-800"
        >
          <Info size={16} className="shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            Authentication integration will be connected when the backend contract is finalized.
            Guest users can freely use plant diagnosis and crop recommendations without registering.
          </p>
        </div>

        {/* Tab Switcher */}
        <div
          role="tablist"
          aria-label="Authentication Options"
          className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-xs font-semibold text-slate-600"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'login'}
            onClick={() => handleModeChange('login')}
            className={`rounded-lg py-2 transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'hover:text-slate-900'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'signup'}
            onClick={() => handleModeChange('signup')}
            className={`rounded-lg py-2 transition-colors cursor-pointer ${
              mode === 'signup'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'hover:text-slate-900'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label
              htmlFor="auth-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail size={16} />
              </div>
              <input
                id="auth-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="farmer@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="auth-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock size={16} />
              </div>
              <input
                id="auth-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {infoNotice && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 leading-relaxed"
            >
              {infoNotice}
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isSubmitting}
            aria-label={mode === 'login' ? 'Submit Sign In' : 'Submit Sign Up'}
            className="w-full py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs justify-center flex items-center gap-2"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            <span>{mode === 'login' ? 'Sign In' : 'Sign Up'}</span>
          </Button>
        </form>

        {/* Footer Actions: Continue as Guest & Return to App */}
        <div className="mt-5 space-y-2 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={onClose}
            className="w-full py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
          >
            Continue as Guest
          </button>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center gap-1 text-xs text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>Return to App</span>
          </button>
        </div>
      </div>
    </div>
  );
}
