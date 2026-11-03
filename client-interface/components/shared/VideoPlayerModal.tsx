'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, ExternalLink, Maximize2, Minimize2, Play, X, Video } from 'lucide-react';
import { downloadHref, toExternalHref } from '@/lib/utils/url';
import { extractVimeoId, extractYoutubeId, isDirectVideoUrl, isPlayableVideoUrl, videoEmbed } from '@/lib/utils/video';

// Kept here as well: callers have imported these from the player.
export { extractVimeoId, extractYoutubeId };

/** A header button of the media viewers (this player and the image lightbox). */
export const MEDIA_HEADER_BUTTON = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-medium transition-colors';

export interface VideoPlayerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  url: string;
  speaker?: string | null;
  /** Shows a Download button: an uploaded file, not a link to a video site. */
  downloadUrl?: string;
  /** The file is a video we hold (its type is known), so play it here whatever its extension. */
  direct?: boolean;
}

export function VideoPlayerModal({ open, onClose, title, url, speaker, downloadUrl, direct = false }: VideoPlayerModalProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === stageRef.current && !!stageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  // The stage, not the video tag, goes fullscreen, so it works for embeds too.
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void stageRef.current?.requestFullscreen?.().catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // Escape first leaves fullscreen (the browser does that); only then close.
      if (e.key === 'Escape' && !document.fullscreenElement) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  // A file we hold plays in the video tag; a video site's link in its player.
  const embed = direct ? null : videoEmbed(url);
  const isDirectVideo = direct || isDirectVideoUrl(url);
  const headerButton = MEDIA_HEADER_BUTTON;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative w-full max-w-4xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <div className="min-w-0 pr-4">
            <h3 className="text-base font-semibold text-white truncate">{title}</h3>
            {speaker && <p className="text-xs text-slate-400 truncate">{speaker}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {downloadUrl && (
              <a href={downloadHref(downloadUrl)} download className={headerButton} title="Download">
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
            )}
            <button
              type="button"
              onClick={toggleFullscreen}
              className={headerButton}
              title={fullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {fullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">{fullscreen ? 'Exit full screen' : 'Full screen'}</span>
            </button>
            {/* A video site's page is worth opening; a file we hold is only its raw storage link. */}
            {!downloadUrl && !direct && (
              <a
                href={toExternalHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                className={headerButton}
                title="Open in a new tab"
              >
                <span className="hidden sm:inline">Open original</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              aria-label="Close player"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Video Stage */}
        <div ref={stageRef} className="relative aspect-video w-full bg-black flex items-center justify-center">
          {embed ? (
            <iframe
              src={embed.src}
              title={title}
              allow={embed.allow}
              allowFullScreen
              className="w-full h-full border-0"
            />
          ) : isDirectVideo ? (
            <video
              src={url}
              controls
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="flex flex-col items-center justify-center p-8 text-center space-y-4">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 flex items-center justify-center text-slate-400">
                <Video className="w-8 h-8" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-white">External Video Stream</p>
                <p className="text-xs text-slate-400 max-w-sm">
                  This video host does not support direct in-app embedding. You can watch it directly on the host site.
                </p>
              </div>
              <a
                href={toExternalHref(url)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-sm font-medium transition-colors"
              >
                <span>Watch video on external site</span>
                <ExternalLink className="w-4 h-4" />
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** What the player needs to show one video. */
export type PlayableVideo = Omit<VideoPlayerModalProps, 'open' | 'onClose'>;

/**
 * The player, ready to drop into any component: call play(video) and render
 * player once. Saves each caller its own "which video is open" state.
 */
export function useVideoPlayer() {
  const [video, setVideo] = useState<PlayableVideo | null>(null);
  const close = useCallback(() => setVideo(null), []);
  const player = video ? <VideoPlayerModal open onClose={close} {...video} /> : null;
  return { play: setVideo, player };
}

/**
 * A video as a card: its picture (the first frame of a file we hold, a
 * YouTube still, or the site's name) with a Play button that opens the
 * player. Files show a Download button; a link opens its original page.
 */
export function VideoCard({ title, url, subtitle, downloadUrl, direct = false, onPlay }: {
  title: string;
  url: string;
  subtitle?: string | null;
  downloadUrl?: string;
  /** A video file we hold, previewed from its first frame. */
  direct?: boolean;
  onPlay: () => void;
}) {
  const embed = direct ? null : videoEmbed(url);
  return (
    <div className="w-60 max-w-full overflow-hidden rounded-lg border border-slate-200 bg-card">
      <button
        type="button"
        onClick={onPlay}
        className="group relative block aspect-video w-full bg-slate-900"
        title="Play video"
        aria-label={`Play ${title}`}
      >
        {embed?.thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={embed.thumbnail} alt="" className="pointer-events-none h-full w-full object-cover opacity-90" />
        ) : embed ? (
          <span className="absolute bottom-2 left-2.5 text-[11px] font-medium text-slate-300">{embed.host}</span>
        ) : (
          // The first frame as a preview; #t asks for it without playing.
          <video
            src={`${url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            className="pointer-events-none h-full w-full object-cover opacity-90"
          />
        )}
        <span className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors group-hover:bg-black/35">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/95 text-brand-700 shadow-lg transition-transform group-hover:scale-105">
            <Play className="ml-0.5 h-5 w-5 fill-current" />
          </span>
        </span>
      </button>
      <div className="flex items-center justify-between gap-1 px-2.5 py-2">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-slate-900">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {downloadUrl ? (
          <a href={downloadHref(downloadUrl)} download className="p-1.5 hover:bg-slate-200 rounded transition-colors shrink-0" title="Download">
            <Download className="w-3.5 h-3.5 text-slate-600" />
          </a>
        ) : (
          <a href={toExternalHref(url)} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-slate-200 rounded transition-colors shrink-0" title="Open original">
            <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * The video links among a submission's links, as cards that play in the
 * player. Other links render nothing here; the caller lists them as before.
 */
export function VideoLinks({ urls, title = 'Submitted video' }: { urls: string[]; title?: string }) {
  const { play, player } = useVideoPlayer();
  const videos = urls.filter(isPlayableVideoUrl).map(toExternalHref);
  if (!videos.length) return null;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {videos.map((url, i) => {
          const embed = videoEmbed(url);
          const name = embed ? `${embed.host} video` : decodeURIComponent(url.split('?')[0].split('/').pop() || 'Video');
          return <VideoCard key={`${url}-${i}`} title={name} subtitle={url} url={url} onPlay={() => play({ title, url })} />;
        })}
      </div>
      {player}
    </>
  );
}

/** Non-video links, for the callers that list them beside VideoLinks. */
export const nonVideoLinks = (urls: string[]) => urls.filter((url) => !isPlayableVideoUrl(url));
