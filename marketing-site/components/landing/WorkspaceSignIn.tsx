'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRight } from 'lucide-react';

const ROOT_DOMAIN = 'pathment.me';

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(new RegExp(`\\.${ROOT_DOMAIN}.*$`), '')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function WorkspaceSignIn() {
  const [open, setOpen] = useState(false);
  const [workspace, setWorkspace] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const slug = slugify(workspace);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;
    window.location.href = `https://${slug}.${ROOT_DOMAIN}/login`;
  }

  return (
    <div ref={containerRef} className="relative hidden sm:block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="text-sm font-medium text-zinc-600 transition-colors hover:text-brand-700"
      >
        Sign In
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Sign in to your workspace"
          className="absolute right-0 top-full z-50 mt-3 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-lg-soft"
        >
          <p className="mb-1 text-sm font-semibold text-zinc-900">Sign in to your workspace</p>
          <p className="mb-3 text-xs text-zinc-500">
            Enter your workspace name to continue to your team&apos;s sign-in page.
          </p>
          <form onSubmit={handleSubmit} className="space-y-2.5">
            <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 transition-all focus-within:border-brand-300 focus-within:ring-4 focus-within:ring-brand-500/10">
              <input
                ref={inputRef}
                type="text"
                value={workspace}
                onChange={(event) => setWorkspace(event.target.value)}
                placeholder="your-workspace"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 bg-white px-3.5 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
              />
              <span className="flex items-center bg-zinc-50 px-3 text-xs font-medium text-zinc-500">
                .{ROOT_DOMAIN}
              </span>
            </div>
            <button
              type="submit"
              disabled={!slug}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:bg-brand-700 enabled:hover:-translate-y-0.5 enabled:hover:shadow-md-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              Continue <ArrowRight className="h-4 w-4" />
            </button>
          </form>
          <p className="mt-3 text-xs text-zinc-500">
            Don&apos;t have a workspace yet?{' '}
            <a href="#request-access" onClick={() => setOpen(false)} className="font-medium text-zinc-900 underline">
              Request access
            </a>
          </p>
        </div>
      )}
    </div>
  );
}
