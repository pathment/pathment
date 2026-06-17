'use client';

import { ArrowRight, Menu, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { Brand } from './Brand';
import { WorkspaceSignIn } from './WorkspaceSignIn';
import { navItems } from './content';

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

function MobileSignIn({ onNavigate }: { onNavigate: () => void }) {
  const [workspace, setWorkspace] = useState('');
  const slug = slugify(workspace);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!slug) return;
    onNavigate();
    window.location.href = `https://${slug}.${ROOT_DOMAIN}/login`;
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <p className="text-xs font-semibold text-zinc-900">Sign in to your workspace</p>
      <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white">
        <input
          type="text"
          value={workspace}
          onChange={(event) => setWorkspace(event.target.value)}
          placeholder="your-workspace"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none"
        />
        <span className="flex items-center bg-zinc-50 px-2.5 text-[11px] font-medium text-zinc-500">
          .{ROOT_DOMAIN}
        </span>
      </div>
      <button
        type="submit"
        disabled={!slug}
        className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
      >
        Continue <ArrowRight className="h-4 w-4" />
      </button>
    </form>
  );
}

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false);
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMenuOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 pb-2 sm:px-4 sm:pt-4">
      <nav
        aria-label="Main navigation"
        className="relative mx-auto flex h-14 max-w-3xl items-center justify-between gap-3 rounded-full border border-zinc-200/80 bg-white/90 px-3 shadow-md-soft backdrop-blur-md sm:h-[3.25rem] sm:max-w-4xl sm:px-5 md:grid md:grid-cols-[1fr_auto_1fr] md:items-center"
      >
        <div className="min-w-0 md:justify-self-start">
          <Brand />
        </div>

        <div className="hidden items-center justify-center gap-6 text-sm font-medium text-zinc-600 md:flex">
          {navItems.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="whitespace-nowrap transition-colors hover:text-brand-700"
            >
              {item.label}
            </a>
          ))}
        </div>

        <div className="hidden items-center justify-end gap-3 sm:gap-4 md:flex">
          <WorkspaceSignIn />
          <a
            href="#request-access"
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm-soft transition-all duration-200 hover:-translate-y-0.5 hover:bg-brand-700 hover:shadow-md-soft"
          >
            Request Access
          </a>
        </div>

        <div className="flex items-center gap-2 md:hidden">
          <a
            href="#request-access"
            onClick={closeMenu}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm-soft sm:px-4 sm:py-2 sm:text-sm"
          >
            Request Access
          </a>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-controls={menuId}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-50"
          >
            {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div ref={menuRef} id={menuId} className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-brand-950/20 backdrop-blur-[2px]"
            onClick={closeMenu}
          />
          <div className="absolute top-[4.75rem] right-3 left-3 max-h-[calc(100dvh-5.5rem)] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-4 shadow-lg-soft sm:top-[5rem] sm:right-4 sm:left-4 sm:p-5">
            <div className="space-y-1">
              {navItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={closeMenu}
                  className="flex items-center rounded-xl px-3 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50"
                >
                  {item.label}
                </a>
              ))}
            </div>

            <div className="my-4 border-t border-zinc-100" />

            <MobileSignIn onNavigate={closeMenu} />

            <a
              href="#request-access"
              onClick={closeMenu}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Request Access
            </a>
          </div>
        </div>
      ) : null}
    </header>
  );
}
