import React from 'react';
import { useLanguage } from '@/context/language-context';

export const TournamentBracket = () => {
  const { t } = useLanguage();
  return (
    <div className="p-4 text-center text-sm text-gray-400">{t('bracket.disabled')}</div>
  );
};

export default TournamentBracket;
