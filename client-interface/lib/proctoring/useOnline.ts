'use client';

import { useEffect, useState } from 'react';

/** Is the device online, as the browser reports it? For the offline banner. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    const frame = requestAnimationFrame(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
