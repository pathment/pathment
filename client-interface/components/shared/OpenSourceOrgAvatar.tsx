'use client';

import { useState } from 'react';

export function getOrgAvatarUrl(name?: string, url?: string, avatar?: string): string | null {
  if (avatar) return avatar;

  if (url) {
    try {
      const match = url.match(/github\.com\/([^\/\s\?#]+)/i);
      if (match && match[1]) {
        return `https://github.com/${match[1]}.png`;
      }
      const rawUrl = url.startsWith('http') ? url : `https://${url}`;
      const parsed = new URL(rawUrl);
      if (parsed.hostname) {
        return `https://www.google.com/s2/favicons?domain=${parsed.hostname}&sz=64`;
      }
    } catch {
      // Ignore URL parse failures
    }
  }

  if (name && !name.includes(' ')) {
    return `https://github.com/${name.toLowerCase()}.png`;
  }

  return null;
}

export interface OpenSourceOrgAvatarProps {
  name: string;
  url?: string;
  avatar?: string;
  className?: string;
  fallbackSize?: string;
}

export function OpenSourceOrgAvatar({
  name,
  url,
  avatar,
  className = 'w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800',
  fallbackSize = 'text-[10px]',
}: OpenSourceOrgAvatarProps) {
  const [error, setError] = useState(false);
  const src = !error ? getOrgAvatarUrl(name, url, avatar) : null;

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        onError={() => setError(true)}
        className={className}
      />
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center bg-brand-100 dark:bg-brand-900 font-bold text-brand-700 dark:text-brand-200 uppercase shrink-0`}
    >
      <span className={fallbackSize}>{name ? name.charAt(0) : '?'}</span>
    </div>
  );
}
