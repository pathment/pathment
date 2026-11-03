'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, CheckCheck, FileText, SmilePlus } from 'lucide-react';

import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from '@/components/ui/popover';
import type { ChatMessage, MessageAttachment } from '@/lib/types/messaging';
import { Avatar } from '@/components/shared/Avatar';
import { Spinner } from '@/components/shared/LoadingSpinner';
import { VoiceNote } from './VoiceNote';
import { ImageLightbox } from '@/components/shared/ImageLightbox';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '😢', '🙏'];
const LONG_PRESS_MS = 420;

interface MessageItemProps {
  message: ChatMessage;
  isMine: boolean;
  startsRun: boolean;
  /** A group chat: other people's messages carry the sender's photo. */
  showAvatar?: boolean;
  /** A group discussion: the sender's part in it, beside their name. */
  senderTag?: SenderTag;
  currentUserId?: string;
  onReact: (messageId: string, emoji: string) => void | Promise<void>;
}

export interface SenderTag { label: string; lead?: boolean }

const isVisual = (file: MessageAttachment) => /^(image|video)\//.test(file.fileType || '');

/**
 * Images, videos and voice notes, played where they were sent. Photos and
 * videos fill the bubble edge to edge (it keeps a thin frame); the rest sit in
 * the bubble's own padding.
 */
function MessageAttachments({ attachments, isMine, framed, meta, ignoreTap }: {
  attachments: MessageAttachment[];
  isMine: boolean;
  /** The time and ticks, when a voice note is the whole message. */
  meta?: ReactNode;
  /** The bubble has the thin media frame, so non-visual items add their own padding. */
  framed: boolean;
  /** True for the tap that ends a long press: that one opened the reactions, not the image. */
  ignoreTap?: () => boolean;
}) {
  const media = 'block max-h-80 w-64 max-w-full rounded-xl bg-black/5 object-cover sm:w-72';
  // A picture opens in the app's image viewer, the one submissions use, not
  // as a bare file link in a new tab.
  const images = attachments.filter((file) => (file.fileType || '').startsWith('image/'));
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const zoomed = zoomIndex !== null ? images[zoomIndex] : null;
  return (
    <div className="space-y-1">
      {attachments.map((file) => {
        const type = file.fileType || '';
        if (type.startsWith('image/')) {
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => { if (!ignoreTap?.()) setZoomIndex(images.findIndex((image) => image.id === file.id)); }}
              className="block cursor-zoom-in"
              aria-label={`View ${file.fileName}`}
            >
              {/* A plain img: next/image throws on any host missing from its config. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={file.fileUrl} alt={file.fileName} loading="lazy" className={media} />
            </button>
          );
        }
        if (type.startsWith('video/')) {
          return <video key={file.id} src={file.fileUrl} controls preload="metadata" className={media} />;
        }
        if (type.startsWith('audio/')) {
          return (
            <div key={file.id} className={framed ? 'px-2 pt-1' : ''}>
              <VoiceNote src={file.fileUrl} onBrand={isMine} meta={meta} />
            </div>
          );
        }
        return (
          <a
            key={file.id}
            href={file.fileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex w-64 max-w-full items-center gap-3 rounded-xl p-2.5 transition-colors ${
              isMine ? 'bg-white/15 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10'
            } ${framed ? 'm-1' : ''}`}
          >
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isMine ? 'bg-white/20' : 'bg-brand-500/10 text-brand-600'}`}>
              <FileText className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{file.fileName}</span>
          </a>
        );
      })}
      {/* The viewer is portalled, but React still bubbles its events through the
          bubble, whose long press and right click open reactions; stop them here. */}
      {zoomed && zoomIndex !== null && (
        <span
          className="contents"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.stopPropagation()}
        >
        <ImageLightbox
          file={zoomed}
          open
          onOpenChange={(open) => !open && setZoomIndex(null)}
          onPrev={images.length > 1 ? () => setZoomIndex((i) => (i === null ? i : Math.max(0, i - 1))) : undefined}
          onNext={images.length > 1 ? () => setZoomIndex((i) => (i === null ? i : Math.min(images.length - 1, i + 1))) : undefined}
          canPrev={zoomIndex > 0}
          canNext={zoomIndex < images.length - 1}
          positionLabel={images.length > 1 ? `${zoomIndex + 1} / ${images.length}` : undefined}
        />
        </span>
      )}
    </div>
  );
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
            if (
              token.startsWith('**') &&
              token.endsWith('**') &&
              token.length > 4
            ) {
              return (
                <strong key={tokenIdx} className="font-semibold">
                  {token.slice(2, -2)}
                </strong>
              );
            }
            if (
              token.startsWith('*') &&
              token.endsWith('*') &&
              token.length > 2
            ) {
              return (
                <em key={tokenIdx} className="italic">
                  {token.slice(1, -1)}
                </em>
              );
            }
            if (
              token.startsWith('`') &&
              token.endsWith('`') &&
              token.length > 2
            ) {
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
  showAvatar = false,
  senderTag,
  currentUserId,
  onReact,
}: MessageItemProps) {
  const [reactionsOpen, setReactionsOpen] = useState(false);
  const [reacting, setReacting] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  // null until first paint history load should not pop; only newly added chips do.
  const seenReactionEmojis = useRef<Set<string> | null>(null);
  const isTemp = message.id.startsWith('temp-');
  const canReact = !isTemp && !reacting;

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => () => clearLongPress(), []);

  const openReactions = () => {
    if (!canReact) return;
    setReactionsOpen(true);
  };

  const react = async (emoji: string) => {
    if (!canReact) return;
    setReacting(true);
    setReactionsOpen(false);
    try {
      await onReact(message.id, emoji);
    } finally {
      setReacting(false);
    }
  };

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
      [] as { emoji: string; count: number; mine: boolean }[],
    );
  }, [message.reactions, currentUserId]);

  const hasReactions = groupedReactions.length > 0;

  useEffect(() => {
    const next = new Set(groupedReactions.map((g) => g.emoji));
    if (seenReactionEmojis.current === null) {
      seenReactionEmojis.current = next;
      return;
    }
    for (const emoji of next) seenReactionEmojis.current.add(emoji);
  }, [groupedReactions]);

  // After first paint, new/updated chips may pop; history load stays still.
  const canPopReaction = seenReactionEmojis.current !== null;

  // Dynamic border radii for WhatsApp-style message grouping
  const bubbleCornersClass = isMine
    ? startsRun
      ? 'rounded-2xl rounded-tr-sm'
      : 'rounded-2xl rounded-mr-sm'
    : startsRun
      ? 'rounded-2xl rounded-tl-sm'
      : 'rounded-2xl rounded-ml-sm';

  // Stack spacing: reacted messages keep room so the next bubble slides down
  const stackSpacingClass = [
    startsRun ? 'mt-3' : 'mt-1',
    hasReactions ? 'mb-2' : '',
    'transition-[margin] duration-200 ease-out',
  ]
    .filter(Boolean)
    .join(' ');

  const senderName = `${message.sender?.firstName || ''} ${message.sender?.lastName || ''}`.trim() || 'User';
  const withAvatar = showAvatar && !isMine;

  // A photo or video gets a thin frame instead of the text padding, and when
  // nothing else is in the bubble the time sits on the picture, as in WhatsApp.
  const attachments = message.attachments ?? [];
  const framed = attachments.some(isVisual);
  const metaOnMedia = framed && !message.messageText && attachments.every(isVisual);
  const inset = framed ? 'px-2' : '';
  // A voice note on its own carries the time on its own line, as WhatsApp does,
  // so the bubble reads the same whoever sent it.
  const voiceOnly = !message.messageText && !!attachments.length
    && attachments.every((file) => (file.fileType || '').startsWith('audio/'));

  // The time, and for my messages whether it was seen.
  const meta = (
    <>
      <span
        className={`text-[10px] ${metaOnMedia ? 'text-white' : isMine ? 'text-white/70' : 'text-muted-foreground'}`}
      >
        {new Date(message.createdAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </span>

      {isMine &&
        (() => {
          const isRead = Boolean(message.isRead || message.readAt);
          const isDelivered = Boolean(message.deliveredAt);

          if (isTemp) {
            return (
              <span className="inline-flex" title="Sending...">
                <Spinner size="xs" className="h-3 w-3 self-center text-white" />
              </span>
            );
          }

          if (isRead) {
            return (
              <span className="inline-flex" title="Seen">
                <CheckCheck
                  className="w-3.5 h-3.5 text-sky-300"
                  aria-label="Seen"
                />
              </span>
            );
          }

          if (isDelivered) {
            return (
              <span className="inline-flex" title="Delivered">
                <CheckCheck
                  className="w-3.5 h-3.5 text-white/70"
                  aria-label="Delivered"
                />
              </span>
            );
          }

          return (
            <span className="inline-flex" title="Sent">
              <Check
                className="w-3.5 h-3.5 text-white/60"
                aria-label="Sent"
              />
            </span>
          );
        })()}
    </>
  );

  return (
    <div
      className={`flex ${withAvatar ? 'gap-2 items-start' : `flex-col ${isMine ? 'items-end' : 'items-start'}`} ${stackSpacingClass}`}
    >
      {/* The photo sits on the first message of a run, as in a WhatsApp group;
          the rest of the run keeps its width so the bubbles stay lined up. */}
      {withAvatar && (startsRun
        ? <Avatar name={senderName} src={message.sender?.profilePictureUrl} size="sm" />
        : <span className="w-8 shrink-0" aria-hidden />)}
      <Popover open={reactionsOpen} onOpenChange={setReactionsOpen}>
        {/* Side padding = hover bridge to the smile button (avoids a dead gap). */}
        <div
          className={`group/msg relative max-w-[85%] sm:max-w-[75%] ${
            canReact ? (isMine ? 'pl-11' : 'pr-11') : ''
          }`}
        >
          <PopoverAnchor asChild>
            <div
              className={`relative shadow-xs select-none ${framed ? 'p-1' : 'px-4 py-2.5'} ${bubbleCornersClass} ${
                isMine
                  ? 'bg-brand-600 text-white shadow-brand-600/10'
                  : 'bg-card border border-border text-foreground'
              } ${isTemp ? 'opacity-70 animate-pulse' : ''}`}
              onContextMenu={(e) => {
                if (!canReact) return;
                e.preventDefault();
                openReactions();
              }}
              onTouchStart={() => {
                if (!canReact) return;
                longPressFired.current = false;
                clearLongPress();
                longPressTimer.current = setTimeout(() => {
                  longPressFired.current = true;
                  openReactions();
                }, LONG_PRESS_MS);
              }}
              onTouchEnd={clearLongPress}
              onTouchCancel={clearLongPress}
              onTouchMove={clearLongPress}
              onClick={() => {
                // Swallow the click that follows a long-press open
                if (longPressFired.current) longPressFired.current = false;
              }}
            >
              {startsRun && !isMine && (
                <p className={`mb-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] ${framed ? 'px-2 pt-1' : ''}`}>
                  <span className="font-semibold text-brand-600 dark:text-brand-400">{senderName}</span>
                  {senderTag && (
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold leading-none ${
                        senderTag.lead
                          ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300'
                      }`}
                    >
                      {senderTag.label}
                    </span>
                  )}
                </p>
              )}

              {!!attachments.length && (
                <MessageAttachments attachments={attachments} isMine={isMine} framed={framed} meta={voiceOnly ? meta : undefined} ignoreTap={() => longPressFired.current} />
              )}
              {!!message.messageText && (
                <div className={framed ? 'px-2 pt-1.5' : attachments.length ? 'mt-1.5' : ''}>
                  <FormattedMessageText text={message.messageText} />
                </div>
              )}

              {!voiceOnly && (
                <div
                  className={
                    metaOnMedia
                      ? 'absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/45 px-2 py-0.5 backdrop-blur-sm'
                      : `flex items-center gap-1.5 mt-1 ${inset} ${framed ? 'pb-0.5' : ''} ${isMine ? 'justify-end' : 'justify-start'}`
                  }
                >
                  {meta}
                </div>
              )}
            </div>
          </PopoverAnchor>

          {/* Hover smile - desktop shortcut into the picker */}
          {canReact && (
            <button
              type="button"
              aria-label="Add reaction"
              aria-expanded={reactionsOpen}
              onClick={(e) => {
                e.stopPropagation();
                openReactions();
              }}
              /*
                  Pinned to the TOP of the bubble, not its middle.
                  The picker opens above the bubble — that is where WhatsApp
                  puts it too — so a centred button on a four-line message
                  left the two a hundred pixels apart: you clicked beside the
                  third line and the keys appeared above the first, over the
                  date divider. Top-aligned, the button and the keys it opens
                  are always next to each other, whatever the message's height.
              */
              className={`absolute top-1.5 z-1 inline-flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-0 transition-opacity duration-150 motion-reduce:transition-none group-hover/msg:opacity-100 hover:bg-muted hover:text-foreground focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-brand-500 ${
                isMine ? 'left-0' : 'right-0'
              } ${reactionsOpen ? 'opacity-100' : ''}`}
            >
              <SmilePlus className="h-4 w-4" />
            </button>
          )}

          {/* Reaction chips - hug the bubble edge, still in-flow so the next message shifts down */}
          {hasReactions && (
            <div
              className={`relative z-2 -mt-2.5 flex max-w-full flex-wrap gap-0.5 pt-0.5 ${
                isMine ? 'justify-end pr-1' : 'justify-start pl-1'
              }`}
            >
              {groupedReactions.map((entry) => (
                <button
                  key={`${entry.emoji}-${entry.count}`}
                  type="button"
                  disabled={!canReact}
                  onClick={(e) => {
                    e.stopPropagation();
                    void react(entry.emoji);
                  }}
                  aria-pressed={entry.mine}
                  aria-label={`${entry.emoji}, ${entry.count} reactions${entry.mine ? ', including you' : ''}`}
                  title={
                    entry.mine
                      ? 'You reacted - click to remove'
                      : 'Click to react'
                  }
                  className={`inline-flex h-7 min-w-7 items-center justify-center gap-0.5 rounded-full border text-[14px] shadow-md backdrop-blur-sm transition-[transform,background-color,box-shadow,opacity] duration-150 ease-out hover:scale-110 active:scale-95 ${
                    canPopReaction ? 'animate-msg-reaction-pop' : ''
                  } ${
                    entry.count > 1 ? 'px-1.5' : 'px-0.5'
                  } ${
                    entry.mine
                      ? 'border-emerald-500/55 bg-emerald-500/20 text-foreground ring-1 ring-emerald-500/30'
                      : 'border-border/80 bg-card/95 text-foreground hover:bg-muted'
                  } ${reacting ? 'opacity-60' : ''}`}
                >
                  <span className="msg-reaction-emoji leading-none drop-shadow-sm">{entry.emoji}</span>
                  {entry.count > 1 && (
                    <span className="text-[11px] font-semibold tabular-nums leading-none text-muted-foreground">
                      {entry.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/*
              Positioned the way WhatsApp Web does it: a compact pill directly
              above the bubble, aligned to the bubble's near edge, flipping
              below when the message is at the very top of the thread.

              It was translucent — bg-card/95 over a backdrop blur — and a
              floating bar you can see through does not read as floating, it
              reads as broken: the message behind it bled through the emoji
              and the sender's name showed straight out of the middle of the
              picker. It is opaque now, with a real shadow and a ring to lift
              it off the thread, and the keys are 36px rather than 44 so it
              covers less of the conversation while it is open.
          */}
          <PopoverContent
            side="top"
            align={isMine ? 'end' : 'start'}
            sideOffset={4}
            alignOffset={isMine ? -2 : 2}
            collisionPadding={12}
            onOpenAutoFocus={(e) => e.preventDefault()}
            className="w-auto max-w-[calc(100vw-2rem)] rounded-full border border-border bg-card p-1 shadow-xl ring-1 ring-black/5 dark:ring-white/10 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-90 data-[side=top]:data-[state=open]:slide-in-from-bottom-1 data-[side=bottom]:data-[state=open]:slide-in-from-top-1 data-[state=open]:duration-150 motion-reduce:data-[state=open]:animate-none"
            aria-label="Choose a reaction"
          >
            <div className="flex items-center gap-0.5">
              {QUICK_REACTIONS.map((emoji, i) => {
                const mine = groupedReactions.some(
                  (g) => g.emoji === emoji && g.mine,
                );
                return (
                  <button
                    key={emoji}
                    type="button"
                    aria-label={`React with ${emoji}`}
                    aria-pressed={mine}
                    disabled={reacting}
                    onClick={() => {
                      void react(emoji);
                    }}
                    style={{ animationDelay: `${i * 28}ms` }}
                    className={`flex h-10 w-10 items-center justify-center rounded-full text-[1.55rem] leading-none transition-transform duration-200 ease-out motion-reduce:transition-none hover:scale-125 hover:bg-muted active:scale-110 focus-visible:outline-2 focus-visible:outline-brand-500 animate-in fade-in zoom-in-75 fill-mode-both motion-reduce:animate-none ${
                      mine ? 'bg-muted scale-110 ring-1 ring-brand-500/30' : ''
                    }`}
                  >
                    {emoji}
                  </button>
                );
              })}
            </div>
          </PopoverContent>
        </div>
      </Popover>
    </div>
  );
}
