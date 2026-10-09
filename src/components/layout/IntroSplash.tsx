import {useEffect, useState} from 'react';
import {BRAND} from '@/config/brand';
import {LogoMark} from '@/components/ui/Logo';
import {useReducedMotion} from '@/hooks/useReducedMotion';
import {cn} from '@/lib/cn';

const SESSION_KEY = 'ea:intro-seen';

function alreadySeen(): boolean {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return true;
  }
}

/**
 * Brand intro: the E monogram draws itself, flares, then fades into the platform.
 * Shown once per browser session (never on route changes), skippable by click or
 * any key, and skipped entirely under reduced motion.
 */
export function IntroSplash() {
  const reduced = useReducedMotion();
  const [phase, setPhase] = useState<'show' | 'leave' | 'done'>(() =>
    alreadySeen() || new URLSearchParams(window.location.search).has('nointro') ? 'done' : 'show',
  );

  useEffect(() => {
    if (phase === 'done') return;
    try {
      window.sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // ignore
    }
    if (reduced) {
      setPhase('done');
      return;
    }
    const leave = window.setTimeout(() => setPhase('leave'), 1500);
    const done = window.setTimeout(() => setPhase('done'), 2000);
    const skip = () => setPhase('done');
    window.addEventListener('keydown', skip, {once: true});
    return () => {
      window.clearTimeout(leave);
      window.clearTimeout(done);
      window.removeEventListener('keydown', skip);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'done') return null;

  return (
    <div
      className={cn(
        'ea-intro fixed inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-bg transition-opacity duration-500',
        phase === 'leave' ? 'pointer-events-none opacity-0' : 'opacity-100',
      )}
      onClick={() => setPhase('done')}
      aria-hidden>
      <div className="relative">
        <div
          className="absolute -inset-10 rounded-full bg-accent/40 blur-3xl"
          style={{animation: 'ea-flare 1.4s 0.5s ease-in-out both'}}
        />
        <LogoMark className="relative h-28 w-28 sm:h-32 sm:w-32" title={null} />
      </div>
      <p
        className="mt-6 font-display text-sm font-bold tracking-[0.4em] text-ink"
        style={{animation: 'ea-pop 0.6s 0.9s cubic-bezier(0.2,0.8,0.2,1) both'}}>
        {BRAND.wordmark}
      </p>
      <p
        className="mt-2 text-[11px] uppercase tracking-[0.3em] text-ink-faint"
        style={{animation: 'ea-pop 0.6s 1.05s cubic-bezier(0.2,0.8,0.2,1) both'}}>
        {BRAND.signature}
      </p>
    </div>
  );
}
