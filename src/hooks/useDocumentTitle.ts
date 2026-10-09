import {useEffect} from 'react';
import {BRAND} from '@/config/brand';

/** Per-page <title> ("Page — Euloge Arcade"). */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} — ${BRAND.name}` : `${BRAND.name} — ${BRAND.tagline}`;
  }, [title]);
}
