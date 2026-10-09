import {useSyncExternalStore} from 'react';
import {usePlatform} from '@/app/PlatformProvider';

const QUERY = '(prefers-reduced-motion: reduce)';

function subscribe(cb: () => void) {
  const mq = window.matchMedia?.(QUERY);
  mq?.addEventListener('change', cb);
  return () => mq?.removeEventListener('change', cb);
}

/** True when the OS asks for reduced motion or the player enabled it in settings. */
export function useReducedMotion(): boolean {
  const {settings} = usePlatform();
  const system = useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(QUERY).matches ?? false,
    () => false,
  );
  return system || settings.reducedMotion;
}
