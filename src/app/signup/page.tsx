'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Lock, User, AlertCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { t } = useLanguage();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://footgolf-app.vercel.app';

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const errors: string[] = [];

    // Validaciones
    if (!firstName.trim()) errors.push(t('signup.validation.firstNameRequired'));
    if (!lastName.trim()) errors.push(t('signup.validation.lastNameRequired'));

    if (!email.trim()) {
      errors.push(t('signup.validation.emailRequired'));
    } else if (!email.includes('@')) {
      errors.push(t('signup.validation.emailInvalid'));
    }

    if (!password.trim()) {
      errors.push(t('signup.validation.passwordRequired'));
    } else if (password.length < 6) {
      errors.push(t('signup.validation.passwordLength'));
    }

    if (password !== confirmPassword) {
      errors.push(t('signup.validation.passwordMismatch'));
    }

    if (errors.length > 0) {
      setError(errors.join(', '));
      return;
    }

    setLoading(true);

    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${siteUrl}/login`,
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        setLoading(false);
        return;
      }

      if (data?.user?.id) {
        const profilePayload = {
          id: data.user.id,
          first_name: firstName.trim() || null,
          last_name: lastName.trim() || null,
          phone: phone.trim() || null,
          birth_year: birthYear ? Number(birthYear) : null,
          category: category || null,
          country: country.trim() || null,
          region: region.trim() || null,
          province: province.trim() || null,
        };

        await supabase.from('profiles').upsert(profilePayload, { onConflict: 'id' });
      }

      // Mostrar mensaje de confirmación
      setError('');
      alert(t('signup.successMessage'));
      router.push('/login');
    } catch (err: any) {
      setError(t('signup.unexpectedError'));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-black relative overflow-hidden">
      {/* FONDO NEGRO SOLO */}
      <div className="absolute inset-0 bg-black"></div>

      {/* BOTÓN VOLVER */}
      <Link href="/login" className="absolute top-6 left-6 z-50 text-white hover:text-[#bef264] transition-colors">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
      </Link>

      {/* NOTE: Language selector removed for simplified build */}

      {/* CONTENIDO */}
      <div className="relative z-20 min-h-screen w-full flex flex-col items-center justify-center px-4 py-8 overflow-y-auto">
        <div className="w-full max-w-sm">
        <div className="bg-white/5 border border-white/10 rounded-3xl p-4 sm:p-5 shadow-[0_24px_80px_rgba(15,23,42,0.6)]">
        <main className="w-full px-0 py-0 flex flex-col items-center">
        
        {/* LOGO */}
        <div className="mb-3 drop-shadow-[0_0_20px_rgba(190,242,100,0.4)]">
          <Image 
            src="/icono-sinfondo.png" 
            alt="Logo" 
            width={130} 
            height={130} 
            className="object-contain animate-pulse-slow w-28 h-28"
            priority
          />
        </div>

        {/* TÍTULO */}
        <div className="text-center mb-5 w-full">
          <h1 
            className="text-2xl font-[900] uppercase italic tracking-tighter leading-[0.85] text-white drop-shadow-[0_0_30px_rgba(255,255,255,0.8)]"
            style={{
              WebkitTextStroke: '1.5px #fbbf24',
              paintOrder: 'stroke fill',
            }}
          >
            {t('signup.titleLine1')} <br /> {t('signup.titleLine2')}
          </h1>
          <p className="text-[7px] font-black text-[#bef264] uppercase tracking-[0.2em] mt-2">
            {t('signup.subtitle')}
          </p>
        </div>

        {/* MENSAJES DE ERROR */}
        {error && (
          <div className="w-full mb-3 bg-red-500/20 border-2 border-red-500/60 rounded-lg p-2 flex items-start gap-2">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-[10px] font-bold text-red-400 uppercase">{error}</p>
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSignup} className="w-full space-y-2.5">
          <div className="relative group">
            <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="text" 
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('signup.fields.firstName')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="text" 
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder={t('signup.fields.lastName')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <Mail className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="email" 
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('signup.fields.email')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="text" 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t('signup.fields.phone')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <User className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="number" 
              value={birthYear}
              onChange={(e) => setBirthYear(e.target.value)}
              placeholder={t('signup.fields.birthYear')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-3 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            >
              <option value="">{t('signup.fields.category')}</option>
              <option value="Masculino">{t('categories.male')}</option>
              <option value="Femenino">{t('categories.female')}</option>
              <option value="Senior">{t('categories.senior')}</option>
              <option value="Senior+">{t('categories.seniorPlus')}</option>
              <option value="Junior">{t('categories.junior')}</option>
            </select>
          </div>

          <div className="relative group">
            <input 
              type="text" 
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder={t('signup.fields.country')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-3 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <input 
              type="text" 
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder={t('signup.fields.region')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-3 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <input 
              type="text" 
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              placeholder={t('signup.fields.province')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-3 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <Lock className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="password" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('signup.fields.password')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          <div className="relative group">
            <Lock className="absolute left-2 top-1/2 -translate-y-1/2 text-[#bef264]/60 group-focus-within:text-[#bef264] transition-colors" size={14} />
            <input 
              type="password" 
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder={t('signup.fields.confirmPassword')}
              disabled={loading}
              className="w-full bg-black/50 backdrop-blur-xl border border-[#bef264]/30 hover:border-[#bef264]/50 focus:border-[#bef264] py-2 pl-9 pr-2 text-white outline-none transition-all duration-300 font-bold italic text-xs placeholder:text-white/40 rounded-lg shadow-[0_4px_16px_rgba(0,0,0,0.5)] disabled:opacity-50"
            />
          </div>

          {/* BOTÓN PRINCIPAL */}
          <button 
            type="submit"
            disabled={loading}
            className="w-full bg-[#bef264] disabled:opacity-50 text-black font-[900] uppercase italic py-2 px-2 rounded-lg flex items-center justify-center gap-1.5 transition-all active:scale-95 shadow-[0_4px_16px_rgba(190,242,100,0.3)] mt-3 hover:shadow-[0_6px_24px_rgba(190,242,100,0.4)] text-xs font-bold">
            {loading ? t('signup.loading') : t('signup.submit')} <ArrowRight size={14} />
          </button>
        </form>

        {/* ENLACE A LOGIN */}
        <p className="text-center mt-2 text-white/60 text-[9px]">
          {t('signup.loginPrompt')}{' '}
          <Link href="/login" className="text-[#bef264] hover:text-[#bef264]/80 font-bold transition-colors">
            {t('signup.loginLink')}
          </Link>
        </p>
        </main>
        </div>
        </div>
      </div>

      <style jsx global>{`
        @keyframes pulse-slow {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.8; transform: scale(0.95); }
        }
        .animate-pulse-slow {
          animation: pulse-slow 4s infinite ease-in-out;
        }
      `}</style>
    </div>
  );
}