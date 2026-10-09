import {Gamepad2, Keyboard, Mouse, Smartphone} from 'lucide-react';
import type {ControlBinding, ControlDevice} from '@/types/game';

const DEVICE: Record<ControlDevice, {label: string; Icon: typeof Keyboard}> = {
  keyboard: {label: 'Clavier', Icon: Keyboard},
  mouse: {label: 'Souris', Icon: Mouse},
  gamepad: {label: 'Manette', Icon: Gamepad2},
  touch: {label: 'Tactile', Icon: Smartphone},
};

export function ControlsList({controls, compact = false}: {controls: ControlBinding[]; compact?: boolean}) {
  const groups = (Object.keys(DEVICE) as ControlDevice[])
    .map((device) => ({device, items: controls.filter((c) => c.device === device)}))
    .filter((g) => g.items.length > 0);
  return (
    <div className={compact ? 'space-y-3' : 'grid gap-5 sm:grid-cols-2'}>
      {groups.map(({device, items}) => {
        const {label, Icon} = DEVICE[device];
        return (
          <div key={device}>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-ink-muted">
              <Icon size={14} aria-hidden /> {label}
            </h4>
            <dl className="space-y-1.5">
              {items.map((c) => (
                <div key={c.input + c.action} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt>
                    <kbd className="rounded-md border bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink border-line-soft">{c.input}</kbd>
                  </dt>
                  <dd className="text-right text-ink-muted">{c.action}</dd>
                </div>
              ))}
            </dl>
          </div>
        );
      })}
    </div>
  );
}
