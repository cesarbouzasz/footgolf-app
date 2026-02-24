'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, DoorOpen } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import { supabase } from '@/lib/supabase';
import AssociationSelector from '@/components/AssociationSelector';

type EventLite = {
  id: string;
  name: string;
  event_date: string | null;
  config: any | null;
};

function isChampionshipEventRow(eventLike: any) {
  const config = eventLike?.config || {};
  return !!config?.isChampionship || !!config?.championshipHub?.enabled;
}

export default function AdminGestionarCampeonatoPage() {
  const { user, profile, loading, isAdmin, currentAssociationId } = useAuth();
  const { t } = useLanguage();

  const [items, setItems] = useState<EventLite[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  useEffect(() => {
    document.body.classList.add('premium-admin-bg');
    return () => document.body.classList.remove('premium-admin-bg');
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!currentAssociationId) {
        if (active) setItems([]);
        return;
      }

      setLoadingItems(true);
      const { data, error } = await supabase
        .from('events')
        .select('id, name, event_date, config')
        .eq('association_id', currentAssociationId)
        .order('event_date', { ascending: false });

      if (!active) return;
      setLoadingItems(false);

      if (error) {
        setItems([]);
        return;
      }

      const rows = ((data as any[]) || []).map((row) => ({
        id: String(row.id),
        name: String(row.name || ''),
        event_date: row.event_date ? String(row.event_date) : null,
        config: row.config || null,
      }));
      setItems(rows);
    };

    void load();
    return () => {
      active = false;
    };
  }, [currentAssociationId]);

  const byId = useMemo(() => {
    const map = new Map<string, EventLite>();
    items.forEach((item) => map.set(item.id, item));
    return map;
  }, [items]);

  const championships = useMemo(
    () => items.filter((item) => isChampionshipEventRow(item)),
    [items]
  );

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
          <div>
            <div className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">{t('adminChampionshipsManage.title')}</div>
            <div className="text-xs text-gray-700">{t('adminChampionshipsManage.subtitle')}</div>
          </div>
          <Link href="/admin/eventos" className="premium-back-btn" aria-label={t('common.back')}>
            <ArrowLeft className="h-4 w-4" />
            <DoorOpen className="h-4 w-4" />
          </Link>
        </header>

        <main className="max-w-3xl mx-auto space-y-4">
          <div className="rounded-2xl border border-gray-200 bg-white/80 p-4 space-y-3">
            <AssociationSelector />
          </div>

          {!currentAssociationId ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {t('adminEventsCreate.selectAssociationWarn')}
            </div>
          ) : loadingItems ? (
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 text-sm text-gray-600">{t('adminEventsEdit.loadingEvents')}</div>
          ) : championships.length === 0 ? (
            <div className="rounded-2xl border border-gray-200 bg-white/80 p-3 text-sm text-gray-600">{t('adminChampionshipsManage.empty')}</div>
          ) : (
            championships.map((championship) => {
              const championshipCfg = championship.config?.championship || {};
              const championshipHub = championship.config?.championshipHub || {};
              const included = Array.isArray(championshipHub.events) ? championshipHub.events : [];

              return (
                <section key={championship.id} className="rounded-2xl border border-gray-200 bg-white/80 p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-extrabold text-gray-900">{championship.name}</div>
                      <div className="text-xs text-gray-500">
                        {championship.event_date ? new Date(championship.event_date).toLocaleDateString() : '-'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Link href={`/admin/eventos/editar?scope=championship&event=${championship.id}`} className="text-xs text-blue-700 underline">
                        {t('adminEventsMenu.edit')}
                      </Link>
                      <Link href={`/events/${championship.id}`} className="text-xs text-blue-700 underline">
                        {t('adminChampionshipsManage.viewStandings')}
                      </Link>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl border border-gray-200 bg-white p-2">
                      <div className="text-gray-500">{t('adminEventsCreate.championshipTotal')}</div>
                      <div className="font-semibold text-gray-900">{championshipCfg?.totalEvents ?? '-'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-2">
                      <div className="text-gray-500">{t('adminEventsCreate.championshipSimple')}</div>
                      <div className="font-semibold text-gray-900">{championshipCfg?.simpleEvents ?? '-'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-2">
                      <div className="text-gray-500">{t('adminEventsCreate.championshipDouble')}</div>
                      <div className="font-semibold text-gray-900">{championshipCfg?.doubleEvents ?? '-'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-2">
                      <div className="text-gray-500">{t('adminEventsCreate.championshipBestSimple')}</div>
                      <div className="font-semibold text-gray-900">{championshipCfg?.bestSimpleCount ?? '-'}</div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-2">
                      <div className="text-gray-500">{t('adminEventsCreate.championshipBestDouble')}</div>
                      <div className="font-semibold text-gray-900">{championshipCfg?.bestDoubleCount ?? '-'}</div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="text-xs font-semibold text-gray-800">{t('adminChampionshipsManage.includedTests')}</div>
                    {included.length === 0 ? (
                      <div className="text-xs text-gray-500">{t('adminEventsCreate.championshipHubEmpty')}</div>
                    ) : (
                      <div className="space-y-1">
                        {included.map((row: any, idx: number) => {
                          const eventId = String(row?.eventId || '').trim();
                          const linked = byId.get(eventId);
                          return (
                            <div key={`inc-${championship.id}-${idx}`} className="text-xs text-gray-700 flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-2 py-1">
                              <span className="truncate">{linked?.name || eventId || '-'}</span>
                              {eventId ? (
                                <Link href={`/events/${eventId}`} className="text-blue-700 underline">
                                  {t('adminChampionshipsManage.openTest')}
                                </Link>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>
              );
            })
          )}
        </main>
      </div>
    </>
  );
}
