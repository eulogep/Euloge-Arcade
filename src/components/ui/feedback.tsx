import {AlertTriangle, CheckCircle2, Info, Trophy, X} from 'lucide-react';
import type {ReactNode} from 'react';
import {usePlatform} from '@/app/PlatformProvider';
import {LogoMark} from '@/components/ui/Logo';
import {cn} from '@/lib/cn';

/** Branded loading indicator: the E monogram with an orbiting light. */
export function BrandLoader({label = 'Chargement…', className}: {label?: string; className?: string}) {
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center gap-4', className)}>
      <div className="relative h-16 w-16">
        <div className="absolute -inset-3 animate-spin-slow rounded-full border-2 border-transparent border-t-accent-3 border-r-accent-2/60" />
        <LogoMark className="h-16 w-16" title={null} />
      </div>
      <span className="text-sm font-medium text-ink-muted">{label}</span>
    </div>
  );
}

export function Skeleton({className}: {className?: string}) {
  return (
    <div className={cn('relative overflow-hidden rounded-xl bg-surface-2/70', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-white/5 to-transparent" />
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="glass mx-auto flex max-w-lg flex-col items-center gap-3 rounded-2xl px-6 py-10 text-center">
      {icon && <div className="text-accent-3">{icon}</div>}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children && <div className="text-sm text-ink-muted">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({title, message, onRetry}: {title: string; message?: string; onRetry?: () => void}) {
  return (
    <EmptyState
      icon={<AlertTriangle size={32} className="text-warning" />}
      title={title}
      action={
        onRetry && (
          <button type="button" className="btn-secondary" onClick={onRetry}>
            Réessayer
          </button>
        )
      }>
      {message}
    </EmptyState>
  );
}

const TOAST_ICON = {
  info: <Info size={18} className="text-accent-3" />,
  success: <CheckCircle2 size={18} className="text-success" />,
  error: <AlertTriangle size={18} className="text-danger" />,
  achievement: <Trophy size={18} className="text-warning" />,
};

export function Toaster() {
  const {toasts, dismissToast} = usePlatform();
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-4 z-[70] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
      aria-live="polite">
      {toasts.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className={cn(
            'glass pointer-events-auto flex w-full max-w-sm animate-fade-up items-start gap-3 rounded-xl px-4 py-3 shadow-card',
            t.tone === 'achievement' && 'shadow-glow-violet',
          )}>
          <span className="mt-0.5">{TOAST_ICON[t.tone]}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">{t.title}</p>
            {t.body && <p className="truncate text-xs text-ink-muted">{t.body}</p>}
          </div>
          <button
            type="button"
            onClick={() => dismissToast(t.id)}
            className="-m-1 rounded-md p-1 text-ink-faint hover:text-ink"
            aria-label="Fermer la notification">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
