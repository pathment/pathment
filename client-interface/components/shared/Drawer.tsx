"use client";

import {
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { DRAWER_DURATION, drawerPanelClass, drawerBackdropClass } from "./drawerMotion";
import { useScrollLock } from "@/lib/hooks/useScrollLock";
import { X } from "lucide-react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Panel width. sm = max-w-md, md = max-w-lg, lg = max-w-xl, xl = max-w-3xl.
   *  `xl` is for dense settings forms with side-by-side fields — anything
   *  narrower makes a date + time pair wrap onto two lines. */
  width?: "sm" | "md" | "lg" | "xl";
  /** Override stacking when nested above another sheet (e.g. notification drawer). */
  zClass?: string;
  /**
   * Optional row under the title (e.g. who this is about + step controls).
   * When set, the title may wrap onto two lines instead of truncating, so it
   * stays readable. Omit for the standard single-block header.
   */
  headerMeta?: ReactNode;
  /** Sticky footer (usually the Cancel / Save actions). */
  footer?: ReactNode | ((dismiss: () => void) => ReactNode);
  children: ReactNode;
}

const WIDTHS = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-xl", xl: "max-w-3xl" } as const;
// Shared with every other drawer, so a second implementation cannot drift.
const DURATION = DRAWER_DURATION;

/**
 * Drawer - the single, accessible right slide-over used across admin / mentor /
 * mentee for any "add / edit / assign" form. Animates smoothly both in AND out
 * (stays mounted through the exit), and handles Escape-to-close, body scroll
 * lock, backdrop dismiss, and focus.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = "md",
  zClass = "z-50",
  headerMeta,
  footer,
  children,
}: DrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  // Latest onClose without making the open-effect re-run every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  const [mounted, setMounted] = useState(open); // in the DOM (true while animating out)
  const [shown, setShown] = useState(false); // the "open" visual state (drives transform/opacity)

  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dismiss = useCallback(() => {
    if (dismissTimer.current) return;
    setShown(false);
    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    dismissTimer.current = setTimeout(
      () => {
        dismissTimer.current = null;
        onCloseRef.current();
      },
      reduced ? 0 : DURATION,
    );
  }, []);
  useEffect(
    () => () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    },
    [],
  );

  // Drive enter/exit purely off `open`.
  useEffect(() => {
    if (open) {
      setMounted(true);
      // Two frames so the initial off-screen transform paints before we flip
      // to the on-screen one - otherwise the browser skips the transition.
      let r2 = 0;
      const r1 = requestAnimationFrame(() => {
        r2 = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(r1);
        cancelAnimationFrame(r2);
      };
    }
    setShown(false);
    const t = setTimeout(() => setMounted(false), DURATION);
    return () => clearTimeout(t);
  }, [open]);

  useScrollLock(mounted);

  // Escape + focus while mounted.
  useEffect(() => {
    if (!mounted) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const dialogs = document.querySelectorAll(
        '[role="dialog"][aria-modal="true"]',
      );
      if (dialogs[dialogs.length - 1] !== panelRef.current) return;
      if (e.key === "Escape") {
        e.preventDefault();
        dismiss();
      }
      if (e.key !== "Tab") return;
      const targets = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]',
        ) || [],
      ).filter((el) => el.getClientRects().length > 0);
      if (!targets.length) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const first = targets[0],
        last = targets[targets.length - 1];
      if (
        e.shiftKey &&
        (document.activeElement === first ||
          document.activeElement === panelRef.current)
      ) {
        e.preventDefault();
        last.focus();
      } else if (
        !e.shiftKey &&
        (document.activeElement === last ||
          document.activeElement === panelRef.current)
      ) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const focusTimer = setTimeout(() => panelRef.current?.focus(), DURATION);
    return () => {
      document.removeEventListener("keydown", onKey);
      clearTimeout(focusTimer);
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [mounted, dismiss]);

  if (!mounted) return null;

  const titleBlock = (
    <div className="min-w-0">
      <h2
        title={headerMeta ? title : undefined}
        className={`font-semibold text-slate-900 ${headerMeta ? "line-clamp-2 break-words" : "truncate"}`}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>
      )}
    </div>
  );
  const closeButton = (
    <button
      onClick={dismiss}
      aria-label="Close"
      className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 shrink-0"
    >
      <X className="w-5 h-5" />
    </button>
  );

  return createPortal(
    <div className={`fixed inset-0 ${zClass} flex justify-end`}>
      <div
        className={drawerBackdropClass(shown)}
        onClick={dismiss}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        data-drawer-motion
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={{ willChange: "transform" }}
        className={`relative w-full ${WIDTHS[width]} h-full bg-card border-l border-slate-200 dark:border-slate-700 shadow-2xl dark:shadow-[-8px_0_30px_rgba(0,0,0,0.6)] flex flex-col outline-none ${drawerPanelClass(shown)}`}
      >
        {headerMeta ? (
          <div className="px-6 pt-4 pb-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
            <div className="flex items-start justify-between gap-3">
              {titleBlock}
              {closeButton}
            </div>
            <div className="mt-3">{headerMeta}</div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
            {titleBlock}
            {closeButton}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-2 shrink-0">
            {typeof footer === "function" ? footer(dismiss) : footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

export default Drawer;