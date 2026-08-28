'use client';

import { useRef } from 'react';
import { Loader2, Send } from 'lucide-react';

interface MessageComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  isSending?: boolean;
}

export default function MessageComposer({
  value,
  onChange,
  onSend,
  disabled = false,
  isSending = false,
}: MessageComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      if (value.trim() && !disabled && !isSending) {
        onSend();
      }
    }
  };

  return (
    <div className="p-3 md:p-4 border-t border-slate-200/80 dark:border-slate-800 bg-card/95 dark:bg-slate-900/80 backdrop-blur-sm">
      <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800/70 p-2 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 focus-within:border-brand-500 dark:focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 dark:focus-within:ring-brand-400/20 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={1}
          placeholder="Type a message... (Shift + Enter for new line)"
          disabled={disabled}
          className="flex-1 max-h-32 resize-none bg-transparent px-2 py-1 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 min-h-[36px]"
          style={{ height: 'auto' }}
        />
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="h-9 w-9 md:h-10 md:w-10 rounded-xl bg-brand-600 hover:bg-brand-700 dark:bg-brand-500 dark:hover:bg-brand-400 active:scale-95 text-white disabled:opacity-40 disabled:hover:bg-brand-600 dark:disabled:hover:bg-brand-500 disabled:active:scale-100 flex items-center justify-center shrink-0 transition-all shadow-sm dark:shadow-brand-900/40"
          aria-label="Send message"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
