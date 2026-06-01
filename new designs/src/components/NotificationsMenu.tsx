import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  ClipboardCheck,
  Flag,
  Zap,
  CalendarDays,
  Plus,
  Sparkles,
  Check,
} from 'lucide-react';
import { useStore } from '@/store/AppStore';
import { cx } from '@/lib/ui';
import type { Role, NotificationKind } from '@/lib/types';

const ICON: Record<NotificationKind, typeof Bell> = {
  nudge: Bell,
  review: ClipboardCheck,
  blocker: Flag,
  assignment: Plus,
  meeting: CalendarDays,
  friction: Zap,
  system: Sparkles,
};

export function NotificationsMenu({ role }: { role: Role }) {
  const { notifications, unread, markRead, markAllRead } = useStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = unread(role);
  const list = notifications.filter((n) => n.role === role);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="rounded-r relative inline-flex h-9 w-9 items-center justify-center text-ink-mute transition-colors hover:bg-neutral-100 hover:text-ink"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" />
        {count > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-[#FF3B30] px-0.5 font-mono text-[9px] font-semibold text-white">
            {count}
          </span>
        )}
      </button>

      {open && (
        <div className="rounded-r absolute right-0 top-11 z-50 w-80 border border-hairline bg-white shadow-lift animate-scale-in">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-2.5">
            <span className="text-sm font-semibold text-ink">Notifications</span>
            {count > 0 && (
              <button
                onClick={() => markAllRead(role)}
                className="inline-flex items-center gap-1 text-xs text-ink-mute hover:text-ink"
              >
                <Check className="h-3.5 w-3.5" /> Mark all read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {list.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-ink-faint">You&apos;re all caught up.</p>
            ) : (
              list.map((n) => {
                const Icon = ICON[n.kind];
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      markRead(n.id);
                      if (n.to) navigate(n.to);
                      setOpen(false);
                    }}
                    className={cx(
                      'flex w-full items-start gap-3 border-b border-hairline px-4 py-3 text-left transition-colors hover:bg-neutral-50',
                      !n.read && 'bg-brand-50/30',
                    )}
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center border border-hairline text-ink-mute">
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-ink">{n.title}</span>
                        {!n.read && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand-500" />}
                      </span>
                      {n.body && <span className="mt-0.5 block text-xs leading-snug text-ink-mute">{n.body}</span>}
                      <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-wider text-ink-faint">
                        {n.at}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
