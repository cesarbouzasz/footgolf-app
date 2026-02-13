'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/auth-context';
import { useLanguage } from '@/context/language-context';

interface Association {
  id: string;
  name: string;
}

export default function AssociationSelector() {
  const { currentAssociationId, setCurrentAssociationId } = useAuth();
  const { t } = useLanguage();
  const [associations, setAssociations] = useState<Association[]>([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch('/api/associations');
        if (!response.ok) {
          throw new Error('Failed to load associations');
        }
        const payload = await response.json();
        if (active && payload?.data) {
          setAssociations(payload.data as Association[]);
        }
      } catch (error) {
        console.error('Error loading associations:', error);
        if (active) setAssociations([]);
      }
    };
    load();
    return () => { active = false; };
  }, []);

  const value = currentAssociationId ?? 'GLOBAL';

  return (
    <select
      value={value}
      onChange={(e) => setCurrentAssociationId(e.target.value === 'GLOBAL' ? null : e.target.value)}
      className="font-elegant text-sm bg-black/40 text-white border border-white/40 rounded px-3 py-1 text-center"
      aria-label={t('common.association')}
    >
      <option value="GLOBAL" className="text-black text-center">GLOBAL</option>
      {associations.map((a) => (
        <option key={a.id} value={a.id} className="text-black text-center">
          {a.name}
        </option>
      ))}
    </select>
  );
}
