import { ES } from './i18n/es';
import { EN } from './i18n/en';
import { PT } from './i18n/pt';
import { FR } from './i18n/fr';
import { IT } from './i18n/it';
import { SV } from './i18n/sv';
import { SK } from './i18n/sk';
import { TR } from './i18n/tr';

export const translations = {
  ES,
  EN,
  PT,
  FR,
  IT,
  SV,
  SK,
  TR,
} as const;

export type LanguageCode = keyof typeof translations;
