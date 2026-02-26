'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, Loader2 } from 'lucide-react';
import LanguageSelector from '@/components/LanguageSelector';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const router = useRouter();
  const { signIn } = useAuth();

  const handleGuestLogin = async () => {
    setLoading(true);
    setError('');
    try {
      const { error: err } = await supabase.auth.signInAnonymously();
      if (err) {
        setError(`Error: ${err.message}`);
        setLoading(false);
        return;
      }
      router.push('/dashboard');
    } catch (err: any) {
      setError('Error inesperado');
      setLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errors: string[] = [];

    if (!email.trim()) errors.push('Email requerido');
    else if (!email.includes('@')) errors.push('Email inválido');
    if (!password.trim()) errors.push('Contraseña requerida');

    if (errors.length > 0) {
      setError(errors.join(', '));
      return;
    }

    setLoading(true);
    const { error: signInError } = await signIn(email, password);

    if (signInError) {
      setError(signInError.message === 'Invalid login credentials' ? 'Email o contraseña incorrectos' : signInError.message);
      setLoading(false);
      return;
    }

    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <div
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage: 'url(/aereo.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
        }}
      />

      <div className="pointer-events-none fixed inset-0 bg-black/40 backdrop-blur-sm z-0" />

      {/* Header con Selector de Idioma */}
      <div className="absolute top-4 sm:top-6 right-4 sm:right-6 z-20">
        <LanguageSelector />
      </div>

      {/* Contenedor principal */}
      <div className="relative z-10 w-full min-h-screen flex items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
        <div className="w-full max-w-md">
          
          {/* Logo Premium */}
          <div className="flex justify-center mb-6 sm:mb-8 animate-slide-down">
            <div className="relative group">
              <img
                src="/icono-sinfondo.png"
                alt="FOOTGOLF Logo"
                className="w-20 sm:w-24 h-auto drop-shadow-2xl group-hover:drop-shadow-[0_0_30px_rgba(212,175,55,0.6)] transition-all duration-500 transform group-hover:scale-110"
              />
            </div>
          </div>

          {/* Título Premium */}
          <div className="text-center mb-8 sm:mb-10 animate-slide-down" style={{ animationDelay: '0.1s' }}>
            <h1 
              className="font-display text-4xl sm:text-5xl lg:text-6xl font-black text-black leading-tight mb-2"
              style={{
                textShadow: `
                  3px 3px 0px #d4af37,
                  -2px 3px 0px #d4af37,
                  3px -2px 0px #d4af37,
                  -2px -2px 0px #d4af37,
                  6px 6px 12px rgba(0,0,0,0.3)
                `,
              }}
            >
              FOOTGOLF<br className="hidden sm:block" />TOTAL
            </h1>
            <p className="text-white/70 text-xs sm:text-sm font-medium tracking-widest uppercase mt-3">
              Experiencia Premium
            </p>
          </div>

          {/* Formulario */}
          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-5 animate-slide-up" style={{ animationDelay: '0.2s' }}>
            
            {/* Email Input Premium */}
            <div>
              <label className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-2 pl-1">
                Usuario / Email
              </label>
              <div className={`flex items-center gap-3 rounded-lg sm:rounded-xl border-2 px-3 sm:px-4 py-2.5 sm:py-3 transition-all duration-300 ${
                focusedField === 'email'
                  ? 'border-gold-600 bg-white/5 shadow-gold-glow'
                  : 'border-gold-600/50 bg-transparent hover:border-gold-600/75 hover:shadow-gold-glow'
              }`}>
                <Mail
                  size={16}
                  className={`flex-shrink-0 transition-colors duration-300 ${
                    focusedField === 'email' ? 'text-gold-400' : 'text-gold-600'
                  }`}
                  strokeWidth={3}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="tu@email.com"
                  disabled={loading}
                  className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none font-medium text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Password Input Premium */}
            <div>
              <label className="block text-xs font-bold text-white/80 uppercase tracking-wider mb-2 pl-1">
                Contraseña
              </label>
              <div className={`flex items-center gap-3 rounded-lg sm:rounded-xl border-2 px-3 sm:px-4 py-2.5 sm:py-3 transition-all duration-300 ${
                focusedField === 'password'
                  ? 'border-gold-600 bg-white/5 shadow-gold-glow'
                  : 'border-gold-600/50 bg-transparent hover:border-gold-600/75 hover:shadow-gold-glow'
              }`}>
                <Lock
                  size={16}
                  className={`flex-shrink-0 transition-colors duration-300 ${
                    focusedField === 'password' ? 'text-gold-400' : 'text-gold-600'
                  }`}
                  strokeWidth={3}
                />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={() => setFocusedField('password')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Tu contraseña"
                  disabled={loading}
                  className="flex-1 bg-transparent text-white placeholder:text-white/40 outline-none font-medium text-sm sm:text-base"
                />
              </div>
            </div>

            {/* Recordar Contraseña Premium */}
            <label className="flex items-center gap-3 cursor-pointer group/checkbox py-1">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="w-5 h-5 appearance-none border-2 border-gold-600/50 rounded-lg bg-transparent checked:bg-gold-600 cursor-pointer transition-all duration-300"
              />
              <span className="text-xs sm:text-sm text-white/80 font-medium group-hover/checkbox:text-white transition-colors">
                Recordar contraseña
              </span>
            </label>

            {/* Error Message Premium */}
            {error && (
              <div className="relative overflow-hidden rounded-lg border-2 border-red-500/60 bg-red-500/10 px-4 py-3 animate-slide-up">
                <p className="text-xs sm:text-sm font-bold text-red-200">{error}</p>
                <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-red-400 to-red-600"></div>
              </div>
            )}

            {/* Botón Entrar Premium */}
            <button
              type="submit"
              disabled={loading}
              className="w-full relative group rounded-lg sm:rounded-xl bg-gradient-to-r from-gold-500 to-gold-600 px-6 py-3 sm:py-3.5 font-bold text-black text-xs sm:text-sm uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:disabled:shadow-none"
              style={{
                boxShadow: '0 10px 30px rgba(212, 175, 55, 0.3)',
              }}
              onMouseEnter={(e) => {
                if (!loading) {
                  e.currentTarget.style.boxShadow = '0 15px 40px rgba(212, 175, 55, 0.6)';
                  e.currentTarget.style.transform = 'translateY(-3px)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(212, 175, 55, 0.3)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span className="hidden sm:inline">Entrando...</span>
                  </>
                ) : (
                  <>
                    ✓ <span className="hidden sm:inline">Entrar</span>
                  </>
                )}
              </span>
            </button>

            {/* Divider Premium */}
            <div className="relative flex items-center gap-3 py-3">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
              <span className="text-xs font-bold text-white/50 uppercase tracking-wider">O</span>
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            </div>

            {/* Botón Invitado Premium */}
            <button
              type="button"
              onClick={handleGuestLogin}
              disabled={loading}
              className="w-full relative group rounded-lg sm:rounded-xl border-2 border-blue-400/60 bg-transparent px-6 py-2.5 sm:py-3 font-bold text-white text-xs sm:text-sm uppercase tracking-wider transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-blue-400 hover:shadow-[0_0_20px_rgba(96,165,250,0.3)]"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                <User size={16} strokeWidth={2.5} />
                <span className="hidden sm:inline">Invitado Demo</span>
                <span className="sm:hidden">Demo</span>
              </span>
              <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-blue-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </button>

            {/* Botón Darse de Alta Premium */}
            <Link
              href="/signup"
              className="block w-full relative group rounded-lg sm:rounded-xl border-2 border-green-400/60 bg-transparent px-6 py-2.5 sm:py-3 font-bold text-white text-xs sm:text-sm uppercase tracking-wider text-center transition-all duration-300 hover:border-green-400 hover:shadow-[0_0_20px_rgba(74,222,128,0.3)]"
            >
              <span className="relative z-10">📝 <span className="hidden sm:inline">Darse de Alta</span><span className="sm:hidden">Registrarse</span></span>
              <div className="absolute inset-0 rounded-lg sm:rounded-xl bg-green-400/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </Link>

            {/* Link Recuperar Premium */}
            <div className="text-center pt-2">
              <Link
                href="/reset-password"
                className="text-xs font-bold text-gold-400 uppercase tracking-wider hover:text-gold-300 transition-colors duration-300 inline-block group"
              >
                ¿Olvidaste tu contraseña?
                <div className="w-0 h-0.5 bg-gold-400 group-hover:w-full transition-all duration-300"></div>
              </Link>
            </div>
          </form>

          {/* Footer Premium */}
          <div className="mt-8 text-center text-xs text-white/40 font-medium tracking-widest uppercase">
            Acceso Seguro • Encriptado
          </div>
        </div>
      </div>

      <style jsx>{`
        @keyframes slide-up {
          from {
            opacity: 0;
            transform: translateY(30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-30px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-slide-up {
          animation: slide-up 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .animate-slide-down {
          animation: slide-down 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        input::placeholder {
          color: rgba(255, 255, 255, 0.4);
        }

        input:-webkit-autofill {
          -webkit-box-shadow: 0 0 0 30px transparent inset !important;
          -webkit-text-fill-color: white !important;
        }
      `}</style>
    </div>
  );
}
