'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { Mic, Pause, Play } from 'lucide-react';

const SPEEDS = [1, 1.5, 2] as const;

// One voice note plays at a time, as in WhatsApp: starting one pauses the last.
let playing: HTMLAudioElement | null = null;

const clock = (seconds: number) => {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const whole = Math.floor(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
};

/**
 * A voice note in a chat bubble: play, seek, speed. It reads the bubble it is
 * in (`onBrand`) so it stays legible on both the sender's and the reader's.
 * `meta` (the message's time and ticks) shares the line under the bar.
 */
export function VoiceNote({ src, onBrand, meta }: { src: string; onBrand: boolean; meta?: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const readDuration = () => {
      if (Number.isFinite(audio.duration)) {
        setDuration(audio.duration);
        return;
      }
      // Browser-recorded webm often has no length in its header. Seeking past
      // the end makes the browser work it out, then it goes back to the start.
      const settle = () => {
        audio.removeEventListener('timeupdate', settle);
        audio.currentTime = 0;
        if (Number.isFinite(audio.duration)) setDuration(audio.duration);
      };
      audio.addEventListener('timeupdate', settle);
      audio.currentTime = 1e101;
    };
    const onTime = () => setCurrent(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => { setIsPlaying(false); setCurrent(0); };
    const onDuration = () => { if (Number.isFinite(audio.duration)) setDuration(audio.duration); };
    audio.addEventListener('loadedmetadata', readDuration);
    audio.addEventListener('durationchange', onDuration);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('loadedmetadata', readDuration);
      audio.removeEventListener('durationchange', onDuration);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      if (playing === audio) { audio.pause(); playing = null; }
    };
  }, []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (!audio.paused) { audio.pause(); return; }
    if (playing && playing !== audio) playing.pause();
    playing = audio;
    void audio.play().catch(() => setIsPlaying(false));
  };

  const seekTo = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    audio.currentTime = Math.min(Math.max(ratio, 0), 1) * duration;
    setCurrent(audio.currentTime);
  };

  const onBarPointer = (e: PointerEvent<HTMLDivElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    seekTo((e.clientX - box.left) / box.width);
  };

  const onBarKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!duration) return;
    if (e.key === 'ArrowRight') { e.preventDefault(); seekTo((current + 5) / duration); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); seekTo((current - 5) / duration); }
  };

  const cycleSpeed = () => {
    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
    setSpeed(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  const progress = duration ? (current / duration) * 100 : 0;
  const tone = onBrand
    ? { button: 'bg-white text-brand-700 hover:bg-white/90', track: 'bg-white/30', fill: 'bg-white', text: 'text-white/80', chip: 'bg-white/20 text-white hover:bg-white/30' }
    : { button: 'bg-brand-600 text-white hover:bg-brand-700', track: 'bg-slate-200 dark:bg-white/15', fill: 'bg-brand-600 dark:bg-brand-400', text: 'text-muted-foreground', chip: 'bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-white/10 dark:text-slate-200' };

  return (
    <div className="w-60 max-w-full py-0.5 sm:w-64">
      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
      {/* Button, bar and speed share one row, so the bar runs through the button's middle. */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          aria-label={isPlaying ? 'Pause voice note' : 'Play voice note'}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors ${tone.button}`}
        >
          {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="ml-0.5 h-4 w-4 fill-current" />}
        </button>
        <div
          role="slider"
          tabIndex={0}
          aria-label="Voice note position"
          aria-valuemin={0}
          aria-valuemax={Math.round(duration)}
          aria-valuenow={Math.round(current)}
          aria-valuetext={`${clock(current)} of ${clock(duration)}`}
          onPointerDown={onBarPointer}
          onKeyDown={onBarKey}
          className="group/bar relative flex h-10 min-w-0 flex-1 cursor-pointer items-center focus-visible:outline-none"
        >
          <div className={`h-1 w-full overflow-hidden rounded-full ${tone.track}`}>
            <div className={`h-full rounded-full ${tone.fill}`} style={{ width: `${progress}%` }} />
          </div>
          <span
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow ${tone.fill} group-focus-visible/bar:ring-2 group-focus-visible/bar:ring-brand-400`}
            style={{ left: `${progress}%` }}
            aria-hidden
          />
        </div>
        <button
          type="button"
          onClick={cycleSpeed}
          aria-label={`Playback speed ${speed}x`}
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors ${tone.chip}`}
        >
          {speed}×
        </button>
      </div>
      {/* Under the start of the bar: the button's width plus the gap. */}
      <div className={`-mt-1 flex items-center gap-1 pl-13 text-[11px] tabular-nums ${tone.text}`}>
        <Mic className="h-3 w-3" aria-hidden />
        {/* The length until it plays, then how far in, as WhatsApp does. */}
        <span>{clock(isPlaying || current > 0 ? current : duration)}</span>
        {meta && <span className="ml-auto flex items-center gap-1">{meta}</span>}
      </div>
    </div>
  );
}
