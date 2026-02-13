'use client';

import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '@/context/language-context';
import type { LanguageCode } from '@/lib/translations';

const languageOptions: { value: LanguageCode; label: string; flag: string }[] = [
  { value: 'ES', label: 'Español', flag: '/footgolf-app_public_flags_es.svg' },
  { value: 'EN', label: 'English', flag: '/footgolf-app_public_flags_gb.svg' },
  { value: 'PT', label: 'Português', flag: '/footgolf-app_public_flags_pt.svg' },
  { value: 'FR', label: 'Français', flag: '/footgolf-app_public_flags_fr.svg' },
  { value: 'IT', label: 'Italiano', flag: '/footgolf-app_public_flags_it.svg' },
  { value: 'SV', label: 'Svenska', flag: '/footgolf-app_public_flags_sv.svg' },
  { value: 'SK', label: 'Slovensky', flag: '/footgolf-app_public_flags_sk.svg' },
  { value: 'TR', label: 'Türkçe', flag: '/footgolf-app_public_flags_tr.svg' },
];

export default function LanguageSelector() {
  const { language, setLanguage } = useLanguage();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const current = languageOptions.find((option) => option.value === language) ?? languageOptions[0];

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const handleSelect = (value: LanguageCode) => {
    setLanguage(value);
    setOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-full border border-white/35 bg-black/35 px-2.5 py-1.5 text-sm text-white shadow-lg shadow-black/20 backdrop-blur-md"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current.label}
      >
        <img src={current.flag} alt={current.label} className="h-6 w-6 rounded-full" />
        <span aria-hidden className="text-xs">▾</span>
      </button>

      {open && (
        <div
          className="absolute right-0 mt-2 w-44 overflow-hidden rounded-xl border border-white/20 bg-black/70 text-white shadow-xl shadow-black/30 backdrop-blur"
          role="listbox"
        >
          {languageOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/10"
              role="option"
              aria-selected={option.value === language}
            >
              <img src={option.flag} alt={option.label} className="h-5 w-5 rounded-full" />
              <span>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
