import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cx } from '@/lib/ui';

/* ----------------------------------------------------------------
   Drawer - right-side panel. Swiss: white, hairline, mono header.
----------------------------------------------------------------- */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 'max-w-lg',
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="absolute inset-0 bg-ink/20 animate-fade-in"
        onClick={onClose}
      />
      <div
        className={cx(
          'relative flex h-full w-full flex-col bg-white shadow-lift animate-slide-in',
          width,
        )}
        style={{ animationDuration: '0.24s' }}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div className="min-w-0">
            <div className="text-sm font-semibold tracking-tight text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-ink-mute">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-mute hover:bg-neutral-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && (
          <div className="border-t border-hairline bg-neutral-50/60 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Modal - centered. For short, focused forms (add key).
----------------------------------------------------------------- */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4">
      <div className="absolute inset-0 bg-ink/20 animate-fade-in" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-2xl border border-hairline bg-white shadow-lift animate-scale-in">
        <div className="flex items-start justify-between gap-3 border-b border-hairline px-5 py-4">
          <div>
            <div className="text-sm font-semibold tracking-tight text-ink">{title}</div>
            {subtitle && <div className="mt-0.5 text-xs text-ink-mute">{subtitle}</div>}
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-mute hover:bg-neutral-100 hover:text-ink"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">{children}</div>
        {footer && (
          <div className="border-t border-hairline bg-neutral-50/60 px-5 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   Form primitives - mono labels, hairline inputs (matches mockup)
----------------------------------------------------------------- */
export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="block font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-ink-faint">
        {label}
      </span>
      {children}
      {hint && <span className="block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  );
}

const inputBase =
  'w-full rounded-lg border border-hairline bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400';

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cx(inputBase, 'resize-none', props.className)} />;
}

export function SelectInput(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cx(inputBase, 'cursor-pointer', props.className)} />;
}

/* Segmented control - for sentiment / small enum choices */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="inline-flex rounded-lg border border-hairline bg-neutral-50 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            value === o.value ? 'bg-white text-ink shadow-soft' : 'text-ink-mute hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* Slider - for personality dimensions */
export function Slider({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-ink-soft">{label}</span>
        <span className="font-mono font-medium text-ink-mute tnum">{value}</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-neutral-200 accent-brand-500"
      />
    </div>
  );
}
