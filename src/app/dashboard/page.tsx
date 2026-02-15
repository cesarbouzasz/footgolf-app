'use client';

import { useEffect } from 'react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import AssociationSelector from '@/components/AssociationSelector';
import {
  CalendarDays,
  Crown,
  Dumbbell,
  Flag,
  Info,
  Map,
  Trophy,
  UserRound,
  Users,
} from 'lucide-react';

export default function DashboardPage() {
  const { user, loading, signOut, isAdmin } = useAuth();
  const { t } = useLanguage();
  const router = useRouter();

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

  const handleLogout = async () => {
    await signOut().catch(() => null);
    router.push('/login');
  };

  return (
    <div
      className="min-h-screen bg-cover bg-center"
      style={{ backgroundImage: "url('/aereo.jpg')" }}
    >
      <div className="min-h-screen bg-gradient-to-b from-black/70 via-black/40 to-black/80">
        <div className="lux-shell min-h-screen">
          <div className="pointer-events-none absolute inset-0 -z-10">
            <div className="absolute -left-20 top-16 h-64 w-64 rounded-full bg-amber-300/15 blur-3xl" />
            <div className="absolute right-10 top-52 h-72 w-72 rounded-full bg-sky-300/10 blur-3xl" />
            <div className="absolute bottom-10 left-1/3 h-56 w-56 rounded-full bg-rose-300/10 blur-3xl" />
          </div>

          <header className="flex items-center justify-between px-4 py-3 text-white">
            <button
              onClick={handleLogout}
              className="rounded-full border border-white/30 bg-black/50 px-3 py-1.5 text-xs font-semibold text-white"
              type="button"
            >
              {t('dashboard.logout')}
            </button>
            <AssociationSelector />
            <div className="w-16" aria-hidden />
          </header>

          <main className="mx-auto w-full max-w-6xl px-4 pb-10 pt-2">
            <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
              <Link
                href="/events"
                className="lux-tile lux-tile-outline group relative overflow-hidden rounded-[28px] border-2 border-red-500 p-6 text-red-400 shadow-[0_0_18px_rgba(239,68,68,0.5)] transition hover:brightness-75 hover:bg-black/40"
              >
                  <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                    <Trophy className="h-20 w-20 text-red-500 drop-shadow-[0_0_14px_rgba(239,68,68,0.95)]" />
                    <h2 className="text-3xl font-semibold tracking-[0.22em] text-red-500">
                      {t('dashboard.events')}
                    </h2>
                  </div>
              </Link>

              <div className="grid grid-cols-2 gap-4">
                <Link
                  href="/events/calendar"
                  className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-lime-400 p-4 text-lime-400 shadow-[0_0_16px_rgba(163,230,53,0.55)]"
                >
                  <CalendarDays className="h-10 w-10" />
                  <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.calendar')}</span>
                </Link>

                <Link
                  href="/practice"
                  className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-slate-200 p-4 text-slate-200 shadow-[0_0_16px_rgba(226,232,240,0.55)]"
                >
                  <Dumbbell className="h-10 w-10" />
                  <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.practice')}</span>
                </Link>

                <Link
                  href="/courses"
                  className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-sky-400 p-4 text-sky-400 shadow-[0_0_16px_rgba(56,189,248,0.55)]"
                >
                  <Map className="h-10 w-10" />
                  <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.fields')}</span>
                </Link>

                <Link
                  href="/players"
                  className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-orange-400 p-4 text-orange-400 shadow-[0_0_16px_rgba(251,146,60,0.55)]"
                >
                  <Users className="h-10 w-10" />
                  <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.players')}</span>
                </Link>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <Link
                href="/profile"
                className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-yellow-400 p-4 text-yellow-400 shadow-[0_0_16px_rgba(250,204,21,0.55)]"
              >
                <UserRound className="h-10 w-10" />
                <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.myProfile')}</span>
              </Link>

              <Link
                href="/info"
                className="lux-tile group flex flex-col items-center justify-center gap-3 rounded-[26px] border-2 border-fuchsia-400 p-4 text-fuchsia-400 shadow-[0_0_16px_rgba(217,70,239,0.55)]"
              >
                <Info className="h-10 w-10" />
                <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.information')}</span>
              </Link>

              {isAdmin && (
                <Link
                  href="/admin"
                  className="lux-tile lux-admin-tile group col-span-2 flex flex-col items-center justify-center gap-3 rounded-[26px] p-4"
                  title={t('dashboard.admin')}
                >
                  <Crown className="h-10 w-10" />
                  <span className="text-base font-semibold tracking-[0.12em]">{t('dashboard.admin')}</span>
                </Link>
              )}
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}