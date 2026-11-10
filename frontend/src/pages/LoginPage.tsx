import { useState, FormEvent } from 'react';
import { Lock, Mail, Info, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export interface LoginPageProps {
  onBack: () => void;
  onNavigateSignup: () => void;
  onSuccess?: () => void;
}

export function LoginPage({ onBack, onNavigateSignup, onSuccess }: LoginPageProps) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      await login({ email, password });
      if (onSuccess) {
        onSuccess();
      } else {
        onBack();
      }
    } catch (err: unknown) {
      let msg = 'Authentication failed. Please check your credentials.';
      if (err instanceof Error && err.message && !err.message.includes('[object Object]')) {
        msg = err.message;
      }
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
    }
  };


  return (
    <main className="flex-1 flex items-center justify-center p-4 sm:p-8 bg-mesh-agri">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        {/* Back / Return Link */}
        <div className="mb-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Return to Previous Page</span>
          </button>
        </div>

        {/* Header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
            <Lock size={22} strokeWidth={2.2} />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
            Sign In to AgriNexa AI
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-500">
            Authentication is optional. All diagnostic and advisory tools remain fully open.
          </p>
        </div>

        {/* Status Notice */}
        <div
          role="status"
          className="mb-5 flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3.5 text-xs text-emerald-800"
        >
          <Info size={16} className="shrink-0 text-emerald-600 mt-0.5" aria-hidden="true" />
          <p className="leading-relaxed">
            Authentication is optional. Guest users can freely use plant diagnosis and crop recommendations without registering.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-left">
          <div>
            <label
              htmlFor="login-email"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Email Address
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail size={16} />
              </div>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="farmer@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="login-password"
              className="block text-xs font-semibold text-slate-700 mb-1"
            >
              Password
            </label>
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock size={16} />
              </div>
              <input
                id="login-password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
              />
            </div>
          </div>

          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-900 leading-relaxed"
            >
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            aria-label="Submit Sign In"
            className="w-full py-2.5 text-sm font-semibold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs justify-center flex items-center gap-2 cursor-pointer transition-colors disabled:opacity-50"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            <span>Sign In</span>
          </button>
        </form>

        {/* Switch to Signup */}
        <div className="mt-4 text-center text-xs text-slate-600">
          Don't have an account?{' '}
          <button
            type="button"
            onClick={onNavigateSignup}
            className="font-semibold text-emerald-600 hover:text-emerald-700 cursor-pointer underline"
          >
            Sign Up
          </button>
        </div>

        {/* Continue as Guest */}
        <div className="mt-5 border-t border-slate-100 pt-4 text-center">
          <button
            type="button"
            onClick={onBack}
            className="w-full py-2 text-xs font-semibold text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 rounded-xl transition-colors cursor-pointer"
          >
            Continue as Guest
          </button>
        </div>
      </div>
    </main>
  );
}
