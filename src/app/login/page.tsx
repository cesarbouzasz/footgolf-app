'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');
  const router = useRouter();
  const { signIn } = useAuth();
  const { t } = useLanguage();
  const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!turnstileSiteKey) return;
    (window as any).onTurnstileSuccess = (token: string) => {
      setTurnstileToken(token || '');
    };
    (window as any).onTurnstileExpired = () => {
      setTurnstileToken('');
    };
    return () => {
      delete (window as any).onTurnstileSuccess;
      delete (window as any).onTurnstileExpired;
    };
  }, [turnstileSiteKey]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError(t('login.fillFields'));
      return;
    }
    if (!password.trim()) {
      setError(t('login.fillFields'));
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(email, password);
    if (signInError) {
      setError(signInError.message || t('common.error'));
      setLoading(false);
    } else {
      router.push('/dashboard');
    }
  };

  const handleGuestLogin = async () => {
    setLoading(true);
    setError('');
    try {
      if (turnstileSiteKey) {
        if (!turnstileToken) {
          setError(t('login.captchaRequired'));
          return;
        }

        const verifyRes = await fetch('/api/verify-turnstile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: turnstileToken }),
        });
        const verifyJson = await verifyRes.json().catch(() => null);
        if (!verifyRes.ok || !verifyJson?.ok) {
          setError(t('login.captchaFailed'));
          setTurnstileToken('');
          (window as any).turnstile?.reset?.();
          return;
        }
      }

      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) {
        setError(error.message || t('login.guestLoginFailed'));
        return;
      }

      if (!data?.session) {
        setError(t('login.guestLoginFailed'));
        return;
      }

      window.location.assign('/dashboard');

      setTimeout(() => {
        if (window.location.pathname !== '/dashboard') {
          setError(t('login.guestLoginCreated'));
          setLoading(false);
        }
      }, 1500);
    } catch (err: any) {
      setError(t('login.unexpectedError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/aereo.jpg')" }}
    >
      {turnstileSiteKey ? (
        <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      ) : null}
      <div className="min-h-screen bg-gradient-to-b from-black/55 via-black/30 to-black/65">
        <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col items-stretch justify-start px-6 pb-8 pt-2 text-white">
          <div className="mb-6 flex flex-col items-center text-center">
            <img
              src="/icono-sinfondo.png"
              alt="FootGolf Total"
              className="h-56 w-56 drop-shadow-[0_12px_30px_rgba(0,0,0,0.5)] sm:h-64 sm:w-64"
            />
            <h1 className="title-gold-outline mt-3 text-4xl font-black tracking-wide sm:text-5xl">
              <span className="block">FOOTGOLF</span>
              <span className="block">TOTAL</span>
            </h1>
            <p className="mt-2 text-sm text-white/80">{t('login.subtitle')}</p>
          </div>

          <div className="w-full space-y-5">
            {error && (
              <div className="rounded-xl border border-red-300/40 bg-red-500/20 px-4 py-3 text-sm text-red-100">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4 text-left">
              <div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-b border-white/45 bg-transparent px-1 py-2.5 text-white placeholder-white/65 outline-none transition focus:border-amber-300"
                  placeholder={t('login.emailPlaceholder')}
                  disabled={loading}
                />
              </div>

              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-b border-white/45 bg-transparent px-1 py-2.5 pr-10 text-white placeholder-white/65 outline-none transition focus:border-amber-300"
                  placeholder={t('login.passwordPlaceholder')}
                  disabled={loading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 text-white/70 hover:text-white"
                  aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>

              <div className="flex items-center justify-between text-xs text-white/75">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-white/50 bg-white/10 text-amber-400"
                  />
                  {t('login.remember')}
                </label>
                <span>{t('login.forgotPassword')}</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-lime-300 to-amber-300 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_16px_35px_rgba(163,230,53,0.35)] transition hover:from-lime-200 hover:to-amber-200 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {loading ? t('common.loading') : t('login.loginButton')}
              </button>
            </form>

            {turnstileSiteKey ? (
              <div className="flex justify-center">
                <div
                  className="cf-turnstile"
                  data-sitekey={turnstileSiteKey}
                  data-theme="dark"
                  data-callback="onTurnstileSuccess"
                  data-expired-callback="onTurnstileExpired"
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-sm font-semibold text-slate-900 shadow-[0_12px_28px_rgba(56,189,248,0.35)] transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? t('common.loading') : t('login.guestButton')}
            </button>

            <div className="mt-6 text-center text-sm text-white/75">
              {t('login.newUser')}{' '}
              <Link href="/signup" className="font-semibold text-amber-200 hover:text-amber-100">
                {t('login.newRegister')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
