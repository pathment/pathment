import { useStore } from '@/store/AppStore';
import { RotateCcw, X } from 'lucide-react';

/* Bottom-center toasts. Undo-over-confirm: actions complete optimistically and
   offer an Undo here instead of interrupting with a confirm dialog. */
export function Toaster() {
  const { toasts, dismissToast } = useStore();
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="rounded-r pointer-events-auto flex items-center gap-3 border border-ink bg-ink px-4 py-2.5 text-sm text-white shadow-lift animate-slide-in"
        >
          <span>{t.message}</span>
          {t.undo && (
            <button
              onClick={() => {
                t.undo?.();
                dismissToast(t.id);
              }}
              className="inline-flex items-center gap-1 font-medium text-white/80 hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" /> Undo
            </button>
          )}
          <button
            onClick={() => dismissToast(t.id)}
            className="text-white/50 hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
