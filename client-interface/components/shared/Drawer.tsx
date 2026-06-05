'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Panel width. sm = max-w-md, md = max-w-lg, lg = max-w-xl. */
  width?: 'sm' | 'md' | 'lg';
  /** Sticky footer (usually the Cancel / Save actions). */
  footer?: ReactNode;
  children: ReactNode;
}

const WIDTHS = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-xl' } as const;
const DURATION = 250; // keep in sync with the duration-[250ms] classes below

/**
 * Drawer — the single, accessible right slide-over used across admin / mentor /
 * mentee for any "add / edit / assign" form. Animates smoothly both in AND out
 * (stays mounted through the exit), and handles Escape-to-close, body scroll
 * lock, backdrop dismiss, and focus.
 */
export function Drawer({ open, onClose, title, subtitle, width = 'md', footer, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without making the open-effect re-run every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; });

  const [mounted, setMounted] = useState(open); // in the DOM (true while animating out)
  const [shown, setShown] = useState(false);    // the "open" visual state (drives transform/opacity)

  // Drive enter/exit purely off `open`.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames so the initial off-screen transform paints before we flip
      // to the on-screen one — otherwise the browser skips the transition.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => { r2 = requestAnimationFrame(() => setShown(true)); });
      return () => { cancelAnimationFrame(r1); cancelAnimationFrame(r2); };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
  }, [open]);

  // Escape + scroll-lock + focus while mounted.
  useEffect(() => {
    if (!mounted) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCloseRef.current(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => panelRef.current?.focus(), DURATION);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
  }, [mounted]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-black/40 dark:bg-black/70 transition-opacity duration-[250ms] ease-out ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={() => onCloseRef.current()}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ willChange: 'transform' }}
        className={`relative w-full ${WIDTHS[width]} h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col outline-none transform-gpu transition-transform duration-[250ms] ease-[cubic-bezier(0.32,0.72,0,1)] ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={() => onCloseRef.current()}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

export default Drawer;
