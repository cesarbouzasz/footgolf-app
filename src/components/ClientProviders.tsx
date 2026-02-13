'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import LanguageSelector from '@/components/LanguageSelector';
import BirdyChat from '@/components/BirdyChat';
import TournamentNotificationPopup from '@/components/TournamentNotificationPopup';

export default function ClientProviders({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const hideLanguageSelector = pathname?.startsWith('/admin');

  return (
    <>
      {!hideLanguageSelector && (
        <div style={{ position: 'fixed', top: 12, right: 12, zIndex: 50 }}>
          <LanguageSelector />
        </div>
      )}
      <TournamentNotificationPopup />
      <BirdyChat />
      {children}
    </>
  );
}
