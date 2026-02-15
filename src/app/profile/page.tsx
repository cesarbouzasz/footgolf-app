'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { FaUser, FaEnvelope, FaIdCard, FaUsers, FaPhone, FaBirthdayCake, FaFlag, FaGlobe, FaMapMarkerAlt, FaCrown, FaArrowLeft, FaDoorOpen, FaCamera, FaSignOutAlt, FaComments } from 'react-icons/fa';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

const AVATAR_BUCKET = process.env.NEXT_PUBLIC_AVATAR_BUCKET || 'assets';

type StatusState = { type: 'idle' | 'saving' | 'error' | 'success'; message?: string };

const SPANISH_REGIONS = [
  'Andalucía',
  'Aragón',
  'Asturias',
  'Illes Balears',
  'Canarias',
  'Cantabria',
  'Castilla-La Mancha',
  'Castilla y León',
  'Cataluña',
  'Comunitat Valenciana',
  'Extremadura',
  'Galicia',
  'La Rioja',
  'Comunidad de Madrid',
  'Región de Murcia',
  'Comunidad Foral de Navarra',
  'País Vasco',
  'Ceuta',
  'Melilla',
];

const SPANISH_PROVINCES = [
  'Álava',
  'Albacete',
  'Alicante',
  'Almería',
  'Asturias',
  'Ávila',
  'Badajoz',
  'Illes Balears',
  'Barcelona',
  'Burgos',
  'Cáceres',
  'Cádiz',
  'Cantabria',
  'Castellón',
  'Ciudad Real',
  'Córdoba',
  'A Coruña',
  'Cuenca',
  'Girona',
  'Granada',
  'Guadalajara',
  'Gipuzkoa',
  'Huelva',
  'Huesca',
  'Jaén',
  'León',
  'Lleida',
  'Lugo',
  'Madrid',
  'Málaga',
  'Murcia',
  'Navarra',
  'Ourense',
  'Palencia',
  'Las Palmas',
  'Pontevedra',
  'La Rioja',
  'Salamanca',
  'Santa Cruz de Tenerife',
  'Segovia',
  'Sevilla',
  'Soria',
  'Tarragona',
  'Teruel',
  'Toledo',
  'Valencia',
  'Valladolid',
  'Bizkaia',
  'Zamora',
  'Zaragoza',
  'Ceuta',
  'Melilla',
];

const formatCountryLabel = (value: string) => (value === 'Espana' ? 'España' : value);
const normalizeCountryInput = (value: string) => (value === 'España' ? 'Espana' : value);

export default function ProfilePage() {
  const { user, profile, loading, signOut, isGuest, setCurrentAssociationId, refreshProfile } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getAuthHeaders = async () => {
    const sessionRes = await supabase.auth.getSession();
    const token = sessionRes?.data?.session?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const [showSupportModal, setShowSupportModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [supportLoading, setSupportLoading] = useState(false);
  const [supportError, setSupportError] = useState<string|null>(null);
  const [supportSuccess, setSupportSuccess] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string|null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [team, setTeam] = useState('');
  const [phone, setPhone] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [category, setCategory] = useState('');
  const [country, setCountry] = useState('');
  const [region, setRegion] = useState('');
  const [province, setProvince] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [status, setStatus] = useState<StatusState>({ type: 'idle' });
  const [associations, setAssociations] = useState<{ id: string; name: string }[]>([]);
  const [defaultAssociationId, setDefaultAssociationId] = useState<string>('GLOBAL');
  const [playerDisplayId, setPlayerDisplayId] = useState<number | null>(null);
  const [chatbotEnabled, setChatbotEnabled] = useState(true);

  const autosaveTimerRef = useRef<number | null>(null);
  const lastSavedRef = useRef<string>('');
  const lastSavedEmailRef = useRef<string>('');
  const hydrationDoneRef = useRef(false);
  const [hydrationDone, setHydrationDone] = useState(false);

  // Handler para enviar incidencia interna (a admin de asociación y creador)
  const handleSendSupportMessage = async (msg: string) => {
    if (!user) return;

    setSupportLoading(true);
    setSupportError(null);
    setSupportSuccess(false);
    try {
      const res = await fetch('/api/support/incidents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ message: msg }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Error enviando incidencia');
      setSupportSuccess(true);
    } catch (err: any) {
      setSupportError(err?.message || 'Error enviando incidencia');
    } finally {
      setSupportLoading(false);
    }
  };

  // Handler para eliminar cuenta
  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    setDeleteError(null);
    setDeleteSuccess(false);
    try {
      const res = await fetch('/api/profile/delete', { method: 'POST', headers: await getAuthHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || 'Error eliminando cuenta');
      setDeleteSuccess(true);
      // Cierra sesión y redirige
      await signOut();
      router.push('/login');
    } catch (err: any) {
      setDeleteError(err?.message || 'Error eliminando cuenta');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Marca el fondo premium
  useEffect(() => {
    document.body.classList.add('premium-profile-bg');
    return () => document.body.classList.remove('premium-profile-bg');
  }, []);

  useEffect(() => {
    setHydrationDone(false);
    setFirstName(profile?.first_name ?? '');
    setLastName(profile?.last_name ?? '');
    setEmail(user?.email ?? '');
    setTeam((profile as any)?.team ?? '');
    setPhone((profile as any)?.phone ?? '');
    setBirthYear((profile as any)?.birth_year?.toString() ?? '');
    setCategory((profile as any)?.category ?? '');
    setCountry((profile as any)?.country ?? '');
    setRegion((profile as any)?.region ?? '');
    setProvince((profile as any)?.province ?? '');
    const storedAvatar = (profile as any)?.avatar_url ?? null;
    if (storedAvatar && typeof storedAvatar === 'string' && !storedAvatar.startsWith('http')) {
      setAvatarPath(storedAvatar);
      const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(storedAvatar);
      setAvatarUrl(data.publicUrl);
    } else {
      setAvatarPath(storedAvatar);
      setAvatarUrl(storedAvatar);
    }
    setDefaultAssociationId(profile?.default_association_id ?? 'GLOBAL');
    setChatbotEnabled(isGuest ? false : Boolean((profile as any)?.chatbot_enabled ?? true));

    // Marcar baseline para autosave (evita guardar al inicializar)
    const baseline = JSON.stringify({
      first_name: profile?.first_name ?? null,
      last_name: profile?.last_name ?? null,
      team: (profile as any)?.team ?? null,
      chatbot_enabled: isGuest ? false : ((profile as any)?.chatbot_enabled ?? true),
      phone: (profile as any)?.phone ?? null,
      birth_year: (profile as any)?.birth_year ?? null,
      category: (profile as any)?.category ?? null,
      country: (profile as any)?.country ?? null,
      region: (profile as any)?.region ?? null,
      province: (profile as any)?.province ?? null,
      avatar_url: (profile as any)?.avatar_url ?? null,
      default_association_id: profile?.default_association_id ?? null,
    });
    lastSavedRef.current = baseline;
    lastSavedEmailRef.current = (user?.email ?? '').trim().toLowerCase();
    hydrationDoneRef.current = true;
    setHydrationDone(true);
  }, [profile, user?.email, isGuest]);

  const currentProfileSnapshot = useMemo(() => {
    return JSON.stringify({
      first_name: firstName.trim() || null,
      last_name: lastName.trim() || null,
      team: team.trim() || null,
      chatbot_enabled: isGuest ? false : Boolean(chatbotEnabled),
      phone: phone.trim() || null,
      birth_year: birthYear ? Number(birthYear) : null,
      category: category || null,
      country: country.trim() || null,
      region: region.trim() || null,
      province: province.trim() || null,
      avatar_url: avatarPath ?? avatarUrl ?? null,
      default_association_id: defaultAssociationId === 'GLOBAL' ? null : defaultAssociationId,
    });
  }, [firstName, lastName, team, chatbotEnabled, isGuest, phone, birthYear, category, country, region, province, avatarPath, avatarUrl, defaultAssociationId]);

  const saveProfileFields = async () => {
    if (!user) return;
    if (isGuest) {
      setStatus({ type: 'error', message: t('profilePage.guestChatbotDisabled') });
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }

    setStatus({ type: 'saving', message: t('profilePage.saving') });

    const payload = JSON.parse(currentProfileSnapshot);

    const res = await fetch('/api/profile/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setStatus({ type: 'error', message: json?.error || t('profilePage.saveError') });
      return;
    }

    lastSavedRef.current = currentProfileSnapshot;
    setStatus({ type: 'success', message: t('profilePage.saveSuccess') });
    setCurrentAssociationId(defaultAssociationId === 'GLOBAL' ? null : defaultAssociationId);
    await refreshProfile();
  };

  const hasUnsavedChanges = useMemo(() => {
    if (!hydrationDone) return false;
    if (isGuest) return false;
    const emailDirty = email.trim().toLowerCase() !== (lastSavedEmailRef.current || '').trim().toLowerCase();
    const profileDirty = currentProfileSnapshot !== lastSavedRef.current;
    return emailDirty || profileDirty;
  }, [hydrationDone, isGuest, email, currentProfileSnapshot]);

  // Autosave: guarda cambios de perfil (excepto email) con debounce
  useEffect(() => {
    if (!hydrationDoneRef.current) return;
    if (!user || isGuest) return;

    if (currentProfileSnapshot === lastSavedRef.current) return;

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      void saveProfileFields();
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [currentProfileSnapshot, user, isGuest]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('associations')
        .select('id, name')
        .order('name', { ascending: true });
      if (active && data) setAssociations(data as { id: string; name: string }[]);
    };
    load();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!profile?.id) return;
    let active = true;

    const load = async () => {
      const res = await fetch('/api/profile/player-id', { method: 'GET', headers: await getAuthHeaders() });
      const json = await res.json().catch(() => null);
      if (!active) return;
      setPlayerDisplayId(typeof json?.playerId === 'number' ? json.playerId : null);
    };

    load();
    return () => { active = false; };
  }, [profile?.id]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-500">{t('common.loading')}</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm">
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  const handleBackToMenu = () => {
    router.push('/dashboard');
  };

  const handleEmailBlur = async () => {
    if (!user || isGuest) return;
    const nextEmail = email.trim().toLowerCase();
    const currentEmail = (user?.email || '').trim().toLowerCase();
    if (!nextEmail || nextEmail === currentEmail) return;
    if (nextEmail === lastSavedEmailRef.current) return;

    if (!nextEmail.includes('@')) {
      setStatus({ type: 'error', message: t('profilePage.emailInvalid') });
      return;
    }

    setStatus({ type: 'saving', message: t('profilePage.emailSaving') });
    const { error } = await supabase.auth.updateUser({ email: nextEmail });
    if (error) {
      setStatus({ type: 'error', message: error.message });
      return;
    }

    lastSavedEmailRef.current = nextEmail;
    setStatus({ type: 'success', message: t('profilePage.emailUpdated') });
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setStatus({ type: 'error', message: t('profilePage.avatarInvalidType') });
      return;
    }

    setUploading(true);
    setStatus({ type: 'idle' });

    try {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = async () => {
          const maxSize = 400;
          let { width, height } = img;
          const scale = Math.min(1, maxSize / Math.max(width, height));
          width = Math.round(width * scale);
          height = Math.round(height * scale);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error(t('profilePage.avatarCanvasError'));
          ctx.drawImage(img, 0, 0, width, height);

          canvas.toBlob(async (blob) => {
            if (!blob) throw new Error(t('profilePage.avatarConvertError'));

            const formData = new FormData();
            formData.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));

            const res = await fetch('/api/profile/avatar', { method: 'POST', headers: await getAuthHeaders(), body: formData });
            const json = await res.json().catch(() => ({}));

            if (!res.ok) {
              const details = json?.statusCode ? ` (HTTP ${json.statusCode})` : '';
              setStatus({ type: 'error', message: `${json?.error || t('profilePage.avatarUploadError')}${details}` });
              setUploading(false);
              return;
            }

            setAvatarPath(json?.path || null);
            setAvatarUrl(json?.publicUrl || null);
            setStatus({ type: 'success', message: t('profilePage.avatarUpdated') });
            setUploading(false);
          }, 'image/jpeg', 0.85);
        };
        img.src = reader.result as string;
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setStatus({ type: 'error', message: err?.message || t('profilePage.avatarUploadError') });
      setUploading(false);
    } finally {
      // Permite volver a seleccionar el mismo archivo
      e.target.value = '';
    }
  };

  if (isGuest) {
    return (
      <>
        <div className="premium-particles" />
        <main className="flex flex-col items-center min-h-screen py-8">
          <section className="premium-card w-full max-w-2xl mx-auto">
            <div className="flex justify-between items-center mb-4">
              <button
                onClick={handleBackToMenu}
                className="premium-back-btn"
                type="button"
                title={t('common.back')}
                aria-label={t('common.back')}
              >
                <FaArrowLeft />
                <FaDoorOpen />
              </button>
            </div>

            <div className="border border-red-300 rounded p-3 text-red-600 text-sm mb-6">
              <div className="font-semibold">{t('profilePage.guestModeTitle')}</div>
              <div>{t('profilePage.guestModeDesc')}</div>
            </div>

            <div className="mb-6">
              <div className="premium-badge text-lg">ID: 0</div>
            </div>

            <div className="flex flex-col items-center mb-6">
              <div className="premium-avatar">
                <img src="/logo-jugador-negro.png" alt={t('profilePage.avatarAlt')} className="w-full h-full object-cover" />
              </div>
              <div className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">{t('profilePage.title')}</div>
            </div>

            <div className="grid gap-3">
              <Field label={t('profilePage.fields.firstName')} value={t('profilePage.guestFirstName')} />
              <Field label={t('profilePage.fields.lastName')} value={t('profilePage.guestLastName')} />
              <Field label={t('profilePage.fields.role')} value="guest" />
              <Field label={t('profilePage.fields.team')} value={t('profilePage.guestTeam')} />
              <Field label={t('profilePage.fields.email')} value="invitado@agfg.com" />
              <Field label={t('profilePage.fields.phone')} value={t('common.notAvailable')} />
              <Field label={t('profilePage.fields.birthYear')} value="2000" />
              <Field label={t('profilePage.fields.category')} value={t('categories.male')} />
              <Field label={t('profilePage.fields.country')} value={t('profilePage.guestCountry')} />
              <Field label={t('profilePage.fields.region')} value={t('profilePage.guestRegion')} />
              <Field label={t('profilePage.fields.province')} value={t('profilePage.guestProvince')} />
            </div>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <div className="premium-particles" />
      <main className="flex flex-col items-center min-h-screen py-8">
        <section className="premium-card w-full max-w-2xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <button
              onClick={handleBackToMenu}
              className="premium-back-btn"
              type="button"
              title={t('common.back')}
              aria-label={t('common.back')}
            >
              <FaArrowLeft />
              <FaDoorOpen />
            </button>

          </div>

          <div className="mb-6">
            <div className="premium-badge text-lg">
              ID: {user?.email === 'mbs2026@gmail.com' ? 0 : (playerDisplayId ?? '-')}
            </div>
          </div>
          <div className="flex flex-col items-center mb-6">
            <div className="premium-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={t('profilePage.avatarAlt')} className="w-full h-full object-cover" />
              ) : (
                <FaUser className="text-5xl text-gray-400" />
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="premium-avatar-edit"
                title={t('profilePage.editPhoto')}
              >
                <FaCamera />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
            </div>
            <div className="mt-4 text-3xl font-extrabold text-gray-900 tracking-tight">{t('profilePage.title')}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mb-6">
            <div className="premium-field"><FaUser className="premium-field-icon" /> <span>{t('profilePage.fields.firstName')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={firstName} onChange={e=>setFirstName(e.target.value)} placeholder={t('profilePage.placeholders.firstName')} />
            </div>
            <div className="premium-field"><FaUser className="premium-field-icon" /> <span>{t('profilePage.fields.lastName')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={lastName} onChange={e=>setLastName(e.target.value)} placeholder={t('profilePage.placeholders.lastName')} />
            </div>
            <div className="premium-field"><FaEnvelope className="premium-field-icon" /> <span>{t('profilePage.fields.email')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={email} onChange={e=>setEmail(e.target.value)} onBlur={handleEmailBlur} placeholder={t('profilePage.placeholders.email')} />
            </div>
            <div className="premium-field"><FaIdCard className="premium-field-icon" /> <span>{t('profilePage.fields.role')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50" value={(profile as any)?.role || ''} disabled readOnly />
            </div>
            <div className="premium-field"><FaUsers className="premium-field-icon" /> <span>{t('profilePage.fields.team')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50" value={team} disabled readOnly />
            </div>
            <div className="premium-field"><FaPhone className="premium-field-icon" /> <span>{t('profilePage.fields.phone')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={phone} onChange={e=>setPhone(e.target.value)} placeholder={t('profilePage.placeholders.phone')} />
            </div>
            <div className="premium-field"><FaBirthdayCake className="premium-field-icon" /> <span>{t('profilePage.fields.birthYear')}:</span>
              <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={birthYear} onChange={e=>setBirthYear(e.target.value)} type="number" placeholder={t('profilePage.placeholders.birthYear')} />
            </div>
            <div className="premium-field"><FaFlag className="premium-field-icon" /> <span>{t('profilePage.fields.country')}:</span>
              <input
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={formatCountryLabel(country)}
                onChange={(e) => setCountry(normalizeCountryInput(e.target.value))}
                placeholder={t('profilePage.placeholders.country')}
              />
            </div>
            <div className="premium-field"><FaGlobe className="premium-field-icon" /> <span>{t('profilePage.fields.region')}:</span>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
              >
                <option value="">{t('profilePage.selectRegion')}</option>
                {SPANISH_REGIONS.map((r) => (
                  <option key={r} value={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="premium-field"><FaMapMarkerAlt className="premium-field-icon" /> <span>{t('profilePage.fields.province')}:</span>
              <select
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                value={province}
                onChange={(e) => setProvince(e.target.value)}
              >
                <option value="">{t('profilePage.selectProvince')}</option>
                {SPANISH_PROVINCES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>
            <div className="premium-field"><FaEnvelope className="premium-field-icon" /> <span>{t('profilePage.fields.category')}:</span>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={category} onChange={e=>setCategory(e.target.value)}>
                <option value="">{t('profilePage.selectOption')}</option>
                <option value="Masculino">{t('categories.male')}</option>
                <option value="Femenino">{t('categories.female')}</option>
                <option value="Senior">{t('categories.senior')}</option>
                <option value="Senior+">{t('categories.seniorPlus')}</option>
                <option value="Junior">{t('categories.junior')}</option>
              </select>
            </div>
            <div className="premium-field"><FaCrown className="premium-field-icon" /> <span>{t('profilePage.fields.association')}:</span>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={defaultAssociationId} onChange={e=>setDefaultAssociationId(e.target.value)}>
                <option value="GLOBAL">GLOBAL</option>
                {associations.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
            <div className="premium-field"><FaFlag className="premium-field-icon" /> <span>{t('profilePage.fields.language')}:</span>
              <select className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="es">🇪🇸 Español</option>
                <option value="en">🇬🇧 English</option>
                <option value="pt">🇵🇹 Português</option>
                <option value="fr">🇫🇷 Français</option>
                <option value="it">🇮🇹 Italiano</option>
                <option value="de">🇩🇪 Deutsch</option>
              </select>
            </div>

            <div className="premium-field"><FaComments className="premium-field-icon" /> <span>{t('profilePage.fields.chatbot')}:</span>
              <div className="w-full flex items-center justify-between gap-3">
                <div className="text-xs text-gray-700">
                  {isGuest
                    ? t('profilePage.chatbotGuest')
                    : chatbotEnabled
                      ? t('profilePage.on')
                      : t('profilePage.off')}
                </div>
                <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                  <input
                    type="checkbox"
                    checked={isGuest ? false : chatbotEnabled}
                    disabled={isGuest}
                    onChange={(e) => setChatbotEnabled(e.target.checked)}
                  />
                  <span>{(isGuest ? false : chatbotEnabled) ? t('profilePage.on') : t('profilePage.off')}</span>
                </label>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-6 gap-4">
            <button
              type="button"
              onClick={() => void saveProfileFields()}
              disabled={isGuest || status.type === 'saving' || !hasUnsavedChanges}
              className="bg-blue-500 text-white px-4 py-2 rounded font-semibold disabled:opacity-50"
            >
              {status.type === 'saving' ? t('profilePage.saving') : t('profilePage.saveChanges')}
            </button>
          </div>

          {/* Incidencias */}
          <div className="mt-8">
            <div className="rounded-lg border border-gray-200 p-4 mb-4 bg-white shadow">
              <div className="flex items-center gap-2 mb-2">
                <FaEnvelope className="text-lg text-blue-500" />
                <span className="font-semibold text-gray-800">{t('profilePage.supportTitle')}</span>
              </div>
              <button className="bg-blue-500 text-white px-4 py-2 rounded font-semibold" type="button" onClick={()=>setShowSupportModal(true)}>
                {t('profilePage.supportButton')}
              </button>
            </div>
          </div>

          {/* Zona de peligro: baja de cuenta */}
          <div className="mt-8">
            <div className="rounded-lg border border-red-400 p-4 bg-red-50 shadow">
              <div className="flex items-center gap-2 mb-2">
                <FaSignOutAlt className="text-lg text-red-600" />
                <span className="font-semibold text-red-700">{t('profilePage.dangerZone')}</span>
              </div>
              <button className="bg-red-600 text-white px-4 py-2 rounded font-semibold" type="button" onClick={()=>setShowDeleteModal(true)}>
                {t('profilePage.deleteAccount')}
              </button>
              <div className="text-xs text-red-700 mt-2">{t('profilePage.deleteWarning')}</div>
            </div>
          </div>

          {/* Modales */}
          {showSupportModal && (
            <Modal onClose={()=>setShowSupportModal(false)}>
              <SupportForm onSend={handleSendSupportMessage} loading={supportLoading} error={supportError} success={supportSuccess} />
            </Modal>
          )}
          {showDeleteModal && (
            <Modal onClose={()=>setShowDeleteModal(false)}>
              <DeleteAccountTripleConfirm onConfirm={handleDeleteAccount} loading={deleteLoading} error={deleteError} success={deleteSuccess} />
            </Modal>
          )}

          {status.type === 'saving' && (
            <div className="text-sm text-gray-700 mt-4">{status.message || t('profilePage.saving')}</div>
          )}
          {status.type === 'error' && (
            <div className="text-sm text-red-600 mt-4">{status.message}</div>
          )}
          {status.type === 'success' && (
            <div className="text-sm text-green-600 mt-4">{status.message}</div>
          )}
          <form className="hidden" />
        </section>
      </main>
    </>
  );
}

// Modal genérico
function Modal({ children, onClose }: { children: React.ReactNode; onClose: ()=>void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg p-6 relative min-w-[320px] max-w-[90vw]">
        <button className="absolute top-2 right-2 text-gray-500 hover:text-gray-700" onClick={onClose}>&times;</button>
        {children}
      </div>
    </div>
  );
}

// Formulario soporte
function SupportForm({ onSend, loading, error, success }: { onSend: (msg: string)=>void, loading: boolean, error: string|null, success: boolean }) {
  const { t } = useLanguage();
  const [message, setMessage] = useState('');
  return (
    <div>
      <div className="font-semibold mb-2">{t('profilePage.supportModalTitle')}</div>
      <textarea className="w-full border rounded p-2 mb-2" rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder={t('profilePage.supportPlaceholder')} />
      <button className="bg-blue-500 text-white px-4 py-2 rounded font-semibold" disabled={loading || !message.trim()} onClick={()=>onSend(message)}>
        {loading ? t('profilePage.sending') : t('profilePage.send')}
      </button>
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      {success && <div className="text-sm text-green-600 mt-2">{t('profilePage.supportSuccess')}</div>}
    </div>
  );
}

// Triple confirmación para baja de cuenta
function DeleteAccountTripleConfirm({ onConfirm, loading, error, success }: { onConfirm: ()=>void, loading: boolean, error: string|null, success: boolean }) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');
  return (
    <div>
      <div className="font-semibold mb-2 text-red-700">{t('profilePage.deleteAccount')}</div>
      {step === 1 && (
        <div>
          <div className="mb-2">{t('profilePage.deleteStep1')}</div>
          <button className="bg-red-600 text-white px-4 py-2 rounded font-semibold" onClick={()=>setStep(2)}>
            {t('profilePage.deleteContinue')}
          </button>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="mb-2">
            {t('profilePage.deleteStep2')}{' '}<b>{t('profilePage.deleteConfirmWord')}</b>
          </div>
          <input className="border rounded px-2 py-1 mb-2" value={input} onChange={e=>setInput(e.target.value)} placeholder={t('profilePage.deleteConfirmWord')} />
          <button className="bg-red-600 text-white px-4 py-2 rounded font-semibold" disabled={input !== t('profilePage.deleteConfirmWord')} onClick={()=>setStep(3)}>
            {t('profilePage.confirm')}
          </button>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="mb-2">{t('profilePage.deleteStep3')}</div>
          <button className="bg-red-600 text-white px-4 py-2 rounded font-semibold" disabled={loading} onClick={onConfirm}>
            {loading ? t('profilePage.deleting') : t('profilePage.deleteAccountAction')}
          </button>
        </div>
      )}
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      {success && <div className="text-sm text-green-600 mt-2">{t('profilePage.deleteSuccess')}</div>}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-gray-500">{label}</div>
      <div className="text-sm text-gray-800">{value}</div>
    </div>
  );
}

function InputField({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
      />
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const { t } = useLanguage();
  return (
    <div>
      <label className="text-xs text-gray-500 block mb-1">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
      >
        <option value="">{t('profilePage.selectOption')}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
