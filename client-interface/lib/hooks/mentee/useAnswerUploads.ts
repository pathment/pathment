'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { interviewApi, uploadVideoAnswer } from '@/lib/services/interview-api';

export type RecordingKind = 'voice' | 'video';

export interface UploadStatus {
  kind: RecordingKind;
  state: 'uploading' | 'saved' | 'failed';
  /** 0–1 while uploading (video only; voice is small enough not to need it). */
  progress: number;
  /** Where it landed, once saved. */
  url?: string | null;
}

/** A refusal retrying won't fix (the session closed, the question is wrong). */
const isFinal = (e: unknown) => {
  const status = (e as { response?: { status?: number } })?.response?.status;
  return !!status && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

/**
 * Every recorded answer of an interview on its way to the server.
 *
 * - One question's uploads run one after another, so when a candidate records
 *   again the newer take always lands last (the server replaces the older one).
 * - Each upload retries with a growing pause; a clip that never makes it stays
 *   held here, and `flush` tries all of them again before submitting.
 * - While anything is unsent, closing or reloading the tab asks first: the
 *   recording only exists in this page until it is uploaded.
 */
export function useAnswerUploads() {
  const [status, setStatus] = useState<Record<string, UploadStatus>>({});
  const held = useRef(new Map<string, { kind: RecordingKind; blob: Blob }>());
  const chains = useRef(new Map<string, Promise<boolean>>());
  const [unsent, setUnsent] = useState(0);
  const sync = () => setUnsent(held.current.size);

  const patch = (questionId: string, next: Partial<UploadStatus> & { kind: RecordingKind }) =>
    setStatus((cur) => ({ ...cur, [questionId]: { ...(cur[questionId] ?? { progress: 0, state: 'uploading' }), ...next } }));

  const sendOnce = useCallback(async (sessionId: string, questionId: string, kind: RecordingKind, blob: Blob) => {
    if (kind === 'video') {
      return uploadVideoAnswer(sessionId, questionId, blob, (f) => patch(questionId, { kind, state: 'uploading', progress: f }));
    }
    const res: { data?: { audioUrl?: string } } = await interviewApi.uploadAnswerAudio(sessionId, questionId, blob);
    return res?.data?.audioUrl ?? null;
  }, []);

  /** Upload one recording (replacing any earlier take of the same question). Resolves true when stored. */
  const upload = useCallback((sessionId: string, questionId: string, kind: RecordingKind, blob: Blob, attempts = 3): Promise<boolean> => {
    held.current.set(questionId, { kind, blob });
    sync();
    const run = async () => {
      // A newer take arrived while we waited our turn: let that one go instead.
      if (held.current.get(questionId)?.blob !== blob) return true;
      for (let attempt = 0; attempt < attempts; attempt += 1) {
        patch(questionId, { kind, state: 'uploading', progress: 0 });
        try {
          const url = await sendOnce(sessionId, questionId, kind, blob);
          if (held.current.get(questionId)?.blob === blob) held.current.delete(questionId);
          sync();
          patch(questionId, { kind, state: 'saved', progress: 1, url });
          return true;
        } catch (e) {
          if (isFinal(e)) break;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      }
      patch(questionId, { kind, state: 'failed', progress: 0 });
      return false;
    };
    const next = (chains.current.get(questionId) ?? Promise.resolve(true)).then(run, run);
    chains.current.set(questionId, next);
    return next;
  }, [sendOnce]);

  /**
   * Wait for everything in flight, then try whatever is still held once more.
   * Returns the questions whose recordings still didn't make it.
   */
  const flush = useCallback(async (sessionId: string): Promise<{ questionId: string; kind: RecordingKind }[]> => {
    await Promise.all(Array.from(chains.current.values()).map((p) => p.catch(() => false)));
    for (const [questionId, { kind, blob }] of Array.from(held.current.entries())) {
      await upload(sessionId, questionId, kind, blob, 2);
    }
    return Array.from(held.current.entries()).map(([questionId, { kind }]) => ({ questionId, kind }));
  }, [upload]);

  /** Give up on a question's recording (they chose to submit without it). */
  const drop = useCallback((questionId: string) => { held.current.delete(questionId); sync(); }, []);

  useEffect(() => {
    if (!unsent) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [unsent]);

  return { status, upload, flush, drop, unsent };
}
