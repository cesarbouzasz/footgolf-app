'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, DoorOpen, Save, Trash2 } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-context';
import { supabase } from '@/lib/supabase';
import { useLanguage } from '@/context/language-context';

interface PlayerProfile {
  id: string;
  management_id?: number | null;
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

type AssociationLite = {
  id: string;
  name: string;
};

export default function AdminPlayerProfilePage() {
  const { user, profile, loading, isAdmin } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();
  const params = useParams();
  const playerId = String(params?.id || '');

  const [form, setForm] = useState<PlayerProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleteSuccess, setDeleteSuccess] = useState(false);
  const [associations, setAssociations] = useState<AssociationLite[]>([]);

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

  useEffect(() => {
    let active = true;

    const loadAssociations = async () => {
      const res = await fetch('/api/associations');
      const json = await res.json().catch(() => ({}));
      if (!active) return;
      const rows = (json?.data as AssociationLite[]) || [];
      setAssociations(rows);
    };

    void loadAssociations();
    return () => {
      active = false;
    };
  }, []);

  const hasForm = !!form;
  const isCreatorTarget = String(form?.role || '').trim().toLowerCase() === 'creador';

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
    if (isCreatorTarget) {
      setStatus('La cuenta creador no se puede modificar desde esta pantalla.');
      return;
    }
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

  const onDeletePlayer = async () => {
    if (!form) return;
    if (isCreatorTarget) {
      setDeleteError('La cuenta creador no se puede eliminar desde esta pantalla.');
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    setDeleteSuccess(false);

    try {
      const sessionRes = await supabase.auth.getSession();
      const token = sessionRes?.data?.session?.access_token;
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDeleteError(String(json?.error || t('common.error')));
        return;
      }

      setDeleteSuccess(true);
      router.push('/admin/jugadores');
    } catch (e: any) {
      setDeleteError(e?.message || t('common.error'));
    } finally {
      setDeleting(false);
    }
  };

  const adminLabel = t('profilePage.fields.admin');
  const safeAdminLabel = adminLabel === 'profilePage.fields.admin' ? 'Administrador' : adminLabel;

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
                  <input
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm bg-gray-50"
                    value={form.management_id ?? ''}
                    disabled
                    readOnly
                  />
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
                  <select
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm"
                    value={form.association_id || ''}
                    onChange={(e) => setForm({ ...form, association_id: e.target.value || null })}
                  >
                    <option value="">—</option>
                    {associations.map((assoc) => (
                      <option key={assoc.id} value={assoc.id}>
                        {assoc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="premium-field">
                  <span>{safeAdminLabel}:</span>
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
                disabled={!hasForm || saving || isCreatorTarget}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {saving ? t('profilePage.saving') : t('profilePage.saveChanges')}
              </button>
              {status && <div className="text-xs text-gray-700">{status}</div>}
            </div>

            {hasForm && !isCreatorTarget && (
              <div className="mt-6 border-t border-gray-200 pt-4">
                <DeletePlayerTripleConfirm
                  onConfirm={onDeletePlayer}
                  loading={deleting}
                  error={deleteError}
                  success={deleteSuccess}
                />
              </div>
            )}
          </section>
        </main>
      </div>
    </>
  );
}

function DeletePlayerTripleConfirm({
  onConfirm,
  loading,
  error,
  success,
}: {
  onConfirm: () => void;
  loading: boolean;
  error: string | null;
  success: boolean;
}) {
  const { t } = useLanguage();
  const [step, setStep] = useState(1);
  const [input, setInput] = useState('');

  return (
    <div>
      <div className="font-semibold mb-2 text-red-700">{t('adminPlayers.deletePlayer')}</div>
      {step === 1 && (
        <div>
          <div className="mb-2">{t('adminPlayers.deletePlayerStep1')}</div>
          <button className="bg-red-600 text-white px-4 py-2 rounded font-semibold" onClick={() => setStep(2)}>
            {t('profilePage.deleteContinue')}
          </button>
        </div>
      )}
      {step === 2 && (
        <div>
          <div className="mb-2">
            {t('profilePage.deleteStep2')} <b>{t('profilePage.deleteConfirmWord')}</b>
          </div>
          <input
            className="border rounded px-2 py-1 mb-2"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t('profilePage.deleteConfirmWord')}
          />
          <button
            className="bg-red-600 text-white px-4 py-2 rounded font-semibold"
            disabled={input !== t('profilePage.deleteConfirmWord')}
            onClick={() => setStep(3)}
          >
            {t('profilePage.confirm')}
          </button>
        </div>
      )}
      {step === 3 && (
        <div>
          <div className="mb-2">{t('adminPlayers.deletePlayerStep3')}</div>
          <button
            className="inline-flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded font-semibold"
            disabled={loading}
            onClick={onConfirm}
          >
            <Trash2 className="h-4 w-4" />
            {loading ? t('profilePage.deleting') : t('adminPlayers.deletePlayerAction')}
          </button>
        </div>
      )}
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
      {success && <div className="text-sm text-green-600 mt-2">{t('adminPlayers.deletePlayerSuccess')}</div>}
    </div>
  );
}

export {};
