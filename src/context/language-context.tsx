'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { translations, LanguageCode } from '@/lib/translations';

interface LanguageContextType {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (path: string) => string;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

// Valor por defecto cuando el contexto no está disponible
const defaultLanguage: LanguageCode = 'ES';
const defaultContext: LanguageContextType = {
  language: defaultLanguage,
  setLanguage: () => {},
  t: (path: string) => path,
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(defaultLanguage);
  const [mounted, setMounted] = useState(false);

  // Cargar idioma guardado en localStorage cuando el componente monta
  useEffect(() => {
    const savedLang = localStorage.getItem('language') as LanguageCode | null;
    if (savedLang && savedLang in translations) {
      setLanguageState(savedLang);
    }
    setMounted(true);
  }, []);

  const setLanguage = (lang: LanguageCode) => {
    setLanguageState(lang);
    localStorage.setItem('language', lang);
  };

  // Función para acceder a las traducciones de forma anidada
  const t = (path: string): string => {
    const keys = path.split('.');

    const resolve = (lang: LanguageCode): string | null => {
      let value: any = translations[lang];
      for (const key of keys) {
        if (value && typeof value === 'object') {
          value = value[key];
        } else {
          return null;
        }
      }
      return typeof value === 'string' ? value : null;
    };

    return resolve(language) || resolve('ES') || path;
  };

  const contextValue: LanguageContextType = { language, setLanguage, t };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  
  // Retornar contexto si existe, o valor por defecto
  if (context === null) {
    return defaultContext;
  }
  
  return context;
}
