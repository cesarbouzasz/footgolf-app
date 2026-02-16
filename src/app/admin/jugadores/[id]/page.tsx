'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Save } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

interface PlayerProfile {
  id: string;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  team?: string | null;
  phone?: string | null;
  birth_year?: number | null;
  category?: string | null;
  country?: string | null;
  region?: string | null;
  province?: string | null;
  role?: string | null;
  association_id?: string | null;
  default_association_id?: string | null;
  is_admin?: boolean | null;
}

export default function AdminPlayerProfilePage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const playerId = String(params?.id || '');

  const [form, setForm] = useState<PlayerProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!playerId) return;
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const res = await fetch(`/api/admin/players/${playerId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      if (!res.ok) {
        setStatus(String(json?.error || t('common.error')));
        return;
      }
      setForm(json?.profile || null);
    };

    void load();
    return () => {
      active = false;
    };
  }, [playerId, t]);

  const hasForm = !!form;

  const payload = useMemo(() => {
    if (!form) return null;
    return {
      email: form.email?.trim() || null,
      first_name: form.first_name?.trim() || null,
      last_name: form.last_name?.trim() || null,
      team: form.team?.trim() || null,
      phone: form.phone?.trim() || null,
      birth_year: form.birth_year ? Number(form.birth_year) : null,
      category: form.category?.trim() || null,
      country: form.country?.trim() || null,
      region: form.region?.trim() || null,
      province: form.province?.trim() || null,
      role: form.role?.trim() || null,
      association_id: form.association_id?.trim() || null,
      default_association_id: form.default_association_id?.trim() || null,
      is_admin: Boolean(form.is_admin),
    };
  }, [form]);

  const onSave = async () => {
    if (!form || !payload) return;
    setSaving(true);
    setStatus(null);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(String(json?.error || t('common.error')));
        return;
      }
      setStatus(t('profilePage.saveSuccess'));
      setForm(json?.profile || form);
    } catch (e: any) {
      setStatus(e?.message || t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('common.loading')}</div>
      </div>
    );
  }

  if (!user || !profile) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-800">
          {t('common.noSession')}{' '}
          <Link href="/login" className="text-blue-600">{t('common.login')}</Link>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm text-gray-700">{t('admin.noAccess')}</div>
      </div>
    );
  }

  return (
    <>
      <div className="premium-particles" />
      <div className="min-h-screen px-4 py-6 sm:px-6">
        <header className="max-w-3xl mx-auto mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/jugadores" className="premium-back-btn" aria-label={t('common.back')}>
              <ArrowLeft className="h-4 w-4" />
              <DoorOpen className="h-4 w-4" />
            </Link>
            <div>
              <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
                {t('adminPlayers.title')}
              </div>
              <div className="text-xs text-gray-700">{t('profilePage.title')}</div>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto">
          <section className="premium-card w-full">
            {!hasForm ? (
              <div className="text-sm text-gray-600">{status || t('common.loading')}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3">
                <div className="premium-field">
                  <span>ID:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50" value={form.id} disabled readOnly />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.email')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.email || ''} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.firstName')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.first_name || ''} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.lastName')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.last_name || ''} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.team')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.team || ''} onChange={(e) => setForm({ ...form, team: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.phone')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.phone || ''} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.birthYear')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.birth_year ?? ''} onChange={(e) => setForm({ ...form, birth_year: Number(e.target.value) })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.category')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.category || ''} onChange={(e) => setForm({ ...form, category: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.country')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.country || ''} onChange={(e) => setForm({ ...form, country: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.region')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.region || ''} onChange={(e) => setForm({ ...form, region: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.province')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.province || ''} onChange={(e) => setForm({ ...form, province: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.role')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.role || ''} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.association')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.association_id || ''} onChange={(e) => setForm({ ...form, association_id: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.defaultAssociation')}:</span>
                  <input className="w-full border border-gray-300 rounded px-3 py-2 text-sm" value={form.default_association_id || ''} onChange={(e) => setForm({ ...form, default_association_id: e.target.value })} />
                </div>
                <div className="premium-field">
                  <span>{t('profilePage.fields.admin')}:</span>
                  <label className="flex items-center gap-2 text-sm font-semibold text-gray-800">
                    <input
                      type="checkbox"
                      checked={Boolean(form.is_admin)}
                      onChange={(e) => setForm({ ...form, is_admin: e.target.checked })}
                    />
                    <span>{Boolean(form.is_admin) ? t('profilePage.on') : t('profilePage.off')}</span>
                  </label>
                </div>
              </div>
            )}

            <div className="mt-6 flex items-center gap-3">
              <button
                type="button"
                onClick={onSave}
                disabled={!hasForm || saving}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? t('profilePage.saving') : t('profilePage.saveChanges')}
              </button>
              {status && <div className="text-xs text-gray-700">{status}</div>}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}

export {};
