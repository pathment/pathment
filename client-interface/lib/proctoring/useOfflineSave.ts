'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * useOfflineSave — answer saving that survives a lost connection, a crash or
 * a power cut.
 *
 * Every save is kept on the device (localStorage) until the host confirms it.
 * A save that fails is retried when the connection comes back, every 15
 * seconds while anything is unsent, and the next time the page opens (after a
 * crash or a restart). Keys are independent (one per question, or one for the
 * whole set), and only the latest value per key is kept.
 *
 * The host answers with `send`. A refusal that retrying can't fix (a 4xx such
 * as "time is up" or "already submitted") drops that save and goes to
 * `onRejected` instead of retrying forever.
 *
 * On load, `readUnsent(storageKey)` gives what never reached the host, to lay
 * over what the host returned — so a candidate who comes back sees their
 * latest typing, not the last copy that got through.
 */
interface Options<T> {
  /** Where unsent saves are kept for this attempt; null while there is none. */
  storageKey: string | null;
  send: (key: string, value: T) => Promise<unknown>;
  onRejected?: (key: string, error: unknown) => void;
  retryEveryMs?: number;
}

type Pending<T> = Record<string, { value: T; at: number }>;

const load = <T,>(storageKey: string): Pending<T> => {
  try { return JSON.parse(localStorage.getItem(storageKey) || '{}') as Pending<T>; } catch { return {}; }
};

/** What this attempt saved on the device but never got to the host, by key. */
export function readUnsent<T>(storageKey: string | null): Record<string, T> {
  if (!storageKey || typeof window === 'undefined') return {};
  return Object.fromEntries(Object.entries(load<T>(storageKey)).map(([k, v]) => [k, v.value]));
}

/** A refusal that retrying won't change. */
const isFinal = (error: unknown): boolean => {
  const status = (error as { response?: { status?: number }; status?: number })?.response?.status
    ?? (error as { status?: number })?.status;
  return typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429;
};

export function useOfflineSave<T>({ storageKey, send, onRejected, retryEveryMs = 15000 }: Options<T>) {
  const pending = useRef<Pending<T>>({});
  const inFlight = useRef<Set<string>>(new Set());
  const [unsent, setUnsent] = useState(0);
  const cbs = useRef({ send, onRejected });
  useEffect(() => { cbs.current = { send, onRejected }; });
  const keyRef = useRef(storageKey);

  const persist = useCallback(() => {
    const sk = keyRef.current;
    setUnsent(Object.keys(pending.current).length);
    if (!sk) return;
    try {
      if (Object.keys(pending.current).length) localStorage.setItem(sk, JSON.stringify(pending.current));
      else localStorage.removeItem(sk);
    } catch { /* storage full or blocked: memory still has it */ }
  }, []);

  /** Resolves true once this key's latest value reached the host. */
  const sendOne = useCallback(async (key: string): Promise<boolean> => {
    const item = pending.current[key];
    if (!item) return true;
    if (inFlight.current.has(key)) return false;
    inFlight.current.add(key);
    let ok = false;
    try {
      await cbs.current.send(key, item.value);
      ok = true;
      // Only clear it if nothing newer arrived while this was on its way.
      if (pending.current[key]?.at === item.at) delete pending.current[key];
    } catch (error) {
      if (isFinal(error)) {
        if (pending.current[key]?.at === item.at) delete pending.current[key];
        cbs.current.onRejected?.(key, error);
      }
    } finally {
      inFlight.current.delete(key);
      persist();
    }
    // A newer value came in mid-flight: send that too.
    if (pending.current[key] && pending.current[key].at !== item.at) return sendOne(key);
    return ok;
  }, [persist]);

  const flush = useCallback(async () => {
    await Promise.all(Object.keys(pending.current).map((k) => sendOne(k)));
  }, [sendOne]);

  // Pick up what an earlier visit left unsent, and send it.
  useEffect(() => {
    keyRef.current = storageKey;
    if (!storageKey) { pending.current = {}; setUnsent(0); return; }
    pending.current = { ...load<T>(storageKey), ...pending.current };
    persist();
    void flush();
  }, [storageKey, persist, flush]);

  // Back online, and every so often while anything is waiting.
  useEffect(() => {
    if (!storageKey) return;
    const onOnline = () => { void flush(); };
    window.addEventListener('online', onOnline);
    const id = setInterval(() => { if (Object.keys(pending.current).length) void flush(); }, retryEveryMs);
    return () => { window.removeEventListener('online', onOnline); clearInterval(id); };
  }, [storageKey, flush, retryEveryMs]);

  /** Keep this value (on the device first), then send it. Resolves true once the host has it. */
  const save = useCallback((key: string, value: T) => {
    pending.current[key] = { value, at: Date.now() };
    persist();
    return sendOne(key);
  }, [persist, sendOne]);

  /** Forget everything unsent (after a successful final submit). */
  const clear = useCallback(() => {
    pending.current = {};
    persist();
  }, [persist]);

  return { save, flush, clear, unsent };
}
