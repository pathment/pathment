import { useEffect, useState } from 'react';

export interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalMs: number;
  isExpired: boolean;
}

export function calculateTimeLeft(targetDateStr?: string | null): TimeLeft {
  if (!targetDateStr) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true };
  }

  const target = new Date(targetDateStr).getTime();
  const now = Date.now();
  const totalMs = target - now;

  if (totalMs <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true };
  }

  const seconds = Math.floor((totalMs / 1000) % 60);
  const minutes = Math.floor((totalMs / (1000 * 60)) % 60);
  const hours = Math.floor((totalMs / (1000 * 60 * 60)) % 24);
  const days = Math.floor(totalMs / (1000 * 60 * 60 * 24));

  return { days, hours, minutes, seconds, totalMs, isExpired: false };
}

/**
 * Custom hook to calculate and update countdown time left for any target ISO date string.
 */
export function useCountdown(targetDateStr?: string | null): TimeLeft {
  const [timeLeft, setTimeLeft] = useState<TimeLeft>(() => calculateTimeLeft(targetDateStr));

  useEffect(() => {
    if (!targetDateStr) {
      setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0, isExpired: true });
      return;
    }

    setTimeLeft(calculateTimeLeft(targetDateStr));

    const timer = setInterval(() => {
      const tl = calculateTimeLeft(targetDateStr);
      setTimeLeft(tl);
      if (tl.isExpired) {
        clearInterval(timer);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [targetDateStr]);

  return timeLeft;
}
