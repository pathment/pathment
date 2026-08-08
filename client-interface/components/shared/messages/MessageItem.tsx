'use client';

import { Fragment, useMemo } from 'react';
import { Check, CheckCheck } from 'lucide-react';

import type { ChatMessage, MessageReaction } from '@/lib/types/messaging';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '🙏'];

interface MessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  startsRun: boolean;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void;
}

/**
 * Parses raw text to automatically render URLs as clickable links
 * and simple markdown (`**bold**`, `*italic*`, `` `code` ``).
 */
function FormattedMessageText({ text }: { text: string }) {
  const parts = useMemo(() => {
    // Regex for matching URLs
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const splitByUrl = text.split(urlRegex);

    return splitByUrl.map((segment, idx) => {
      if (urlRegex.test(segment)) {
        return (
          <a
            key={idx}
            href={segment}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:opacity-80 transition-opacity break-all font-medium"
            onClick={(e) => e.stopPropagation()}
          >
            {segment}
          </a>
        );
      }

      // Simple Markdown parser for bold, italic, code
      const tokens = segment.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);

      return (
        <Fragment key={idx}>
          {tokens.map((token, tokenIdx) => {
            if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
              return <strong key={tokenIdx} className="font-semibold">{token.slice(2, -2)}</strong>;
            }
            if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
              return <em key={tokenIdx} className="italic">{token.slice(1, -1)}</em>;
            }
            if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
              return (
                <code
                  key={tokenIdx}
                  className="rounded bg-black/10 dark:bg-white/15 px-1 py-0.5 font-mono text-xs"
                >
                  {token.slice(1, -1)}
                </code>
              );
            }
            return token;
          })}
        </Fragment>
      );
    });
  }, [text]);

  return <p className="text-sm whitespace-pre-wrap leading-relaxed">{parts}</p>;
}

export default function MessageItem({
  message,
  isMine,
  startsRun,
  currentUserId,
  onReact,
}: MessageItemProps) {
  const read = Boolean(message.isRead || message.readAt);

  // Group reactions by emoji
  const groupedReactions = useMemo(() => {
    return (message.reactions || []).reduce(
      (acc, reaction) => {
        let entry = acc.find((item) => item.emoji === reaction.emoji);
        if (!entry) {
          entry = { emoji: reaction.emoji, count: 0, mine: false };
          acc.push(entry);
        }
        entry.count += 1;
        if (reaction.userId === currentUserId) {
          entry.mine = true;
        }
        return acc;
      },
      [] as { emoji: string; count: number; mine: boolean }[]
    );
  }, [message.reactions, currentUserId]);

  // Dynamic border radii for WhatsApp-style message grouping
  const bubbleCornersClass = isMine
    ? startsRun
      ? 'rounded-2xl rounded-tr-sm'
      : 'rounded-2xl rounded-mr-sm'
    : startsRun
    ? 'rounded-2xl rounded-tl-sm'
    : 'rounded-2xl rounded-ml-sm';

  return (
    <div
      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} ${
        startsRun ? 'mt-3' : 'mt-1'
      }`}
    >
      <div className="group/msg relative max-w-[85%] sm:max-w-[75%] transition-all">
        {/* Main message bubble */}
        <div
          className={`px-4 py-2.5 shadow-xs ${bubbleCornersClass} ${
            isMine
              ? 'bg-brand-600 text-white shadow-brand-600/10'
              : 'bg-card border border-slate-200/90 dark:border-slate-800 text-slate-800 dark:text-slate-100'
          } ${message.id.startsWith('temp-') ? 'opacity-70 animate-pulse' : ''}`}
        >
          {startsRun && !isMine && (
            <p className="text-[11px] font-semibold text-brand-600 dark:text-brand-400 mb-0.5">
              {`${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() || 'User'}
            </p>
          )}

          <FormattedMessageText text={message.messageText} />

          <div className={`flex items-center gap-1.5 mt-1 ${isMine ? 'justify-end' : 'justify-start'}`}>
            <span className={`text-[10px] ${isMine ? 'text-white/70' : 'text-slate-400 dark:text-slate-500'}`}>
              {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>

            {isMine && (
              <span className="inline-flex" title={message.id.startsWith('temp-') ? 'Sending...' : (read ? 'Seen' : 'Sent')}>
                {message.id.startsWith('temp-') ? (
                  <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin self-center" />
                ) : read ? (
                  <CheckCheck className="w-3.5 h-3.5 text-sky-300" aria-label="Seen" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-white/60" aria-label="Sent" />
                )}
              </span>
            )}
          </div>
        </div>

        {/* Hover reaction picker overlay - pops above the message bubble */}
        <div
          className={`absolute -top-10 ${
            isMine ? 'right-0' : 'left-0'
          } z-10 origin-bottom flex items-center gap-1 rounded-full border border-slate-200/90 dark:border-slate-800 bg-card/95 backdrop-blur-md px-2 py-1 shadow-md opacity-0 scale-90 translate-y-1 pointer-events-none transition-all duration-150 ease-out group-hover/msg:opacity-100 group-hover/msg:scale-100 group-hover/msg:translate-y-0 group-hover/msg:pointer-events-auto focus-within:opacity-100 focus-within:scale-100 focus-within:translate-y-0 focus-within:pointer-events-auto`}
        >
          {QUICK_REACTIONS.map((emoji) => {
            const active = groupedReactions.some((g) => g.emoji === emoji && g.mine);
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji)}
                className={`w-7 h-7 rounded-full text-base leading-none flex items-center justify-center transition-transform duration-150 hover:scale-125 active:scale-95 ${
                  active ? 'bg-brand-50 dark:bg-brand-500/20' : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
                aria-label={`React with ${emoji}`}
              >
                {emoji}
              </button>
            );
          })}
        </div>

        {/* Reaction chips - attached to message bottom edge */}
        {groupedReactions.length > 0 && (
          <div
            className={`flex flex-wrap gap-1 -mt-1.5 ${
              isMine ? 'justify-end pr-1' : 'pl-1'
            } relative z-[2]`}
          >
            {groupedReactions.map((entry) => (
              <button
                key={entry.emoji}
                type="button"
                onClick={() => onReact(message.id, entry.emoji)}
                title={entry.mine ? 'You reacted - click to remove' : 'Click to react'}
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs shadow-2xs transition-all hover:-translate-y-0.5 active:translate-y-0 ${
                  entry.mine
                    ? 'border-brand-300 ring-1 ring-brand-300/40 bg-brand-50 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-800 bg-card text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span className="leading-none text-xs">{entry.emoji}</span>
                {entry.count > 1 && <span className="font-semibold text-[11px]">{entry.count}</span>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
