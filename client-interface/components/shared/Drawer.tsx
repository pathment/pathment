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

/**
 * Drawer — the single, accessible right slide-over used across admin / mentor /
 * mentee for any "add / edit / assign" form. Handles Escape-to-close, body
 * scroll lock, backdrop dismiss, focus, and a subtle slide-in. Keeping every
 * form in this one component is what makes the system feel consistent.
 */
export function Drawer({ open, onClose, title, subtitle, width = 'md', footer, children }: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!open) { setShown(false); return; }
    const raf = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusTimer = setTimeout(() => panelRef.current?.focus(), 60);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative w-full ${WIDTHS[width]} h-full bg-white shadow-xl flex flex-col outline-none transform transition-transform duration-200 ease-out ${shown ? 'translate-x-0' : 'translate-x-full'}`}
      >
        <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="min-w-0">
            <h2 className="font-semibold text-slate-900 truncate">{title}</h2>
            {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 flex justify-end gap-2 shrink-0">{footer}</div>
        )}
      </div>
    </div>
  );
}

export default Drawer;
