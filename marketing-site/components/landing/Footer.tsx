'use client';

import { SiGithub, SiX } from 'react-icons/si';
import { FaLinkedin } from 'react-icons/fa6';
import { Brand } from './Brand';
import { footerColumns } from './content';
import { Reveal } from './Reveal';

export function Footer() {
  return (
    <footer className="border-t border-zinc-200 bg-white">
      <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 sm:py-12 lg:px-8">
        <div className="mb-10 grid grid-cols-1 gap-8 sm:mb-12 sm:grid-cols-2 md:grid-cols-5">
          <div className="space-y-4 sm:col-span-2">
            <Brand compact />
            <p className="max-w-xs text-xs leading-relaxed text-zinc-500">
              One place to run structured mentorship, match pairs, build roadmaps, review
              work, and see real progress.
            </p>
            <div className="flex items-center gap-3 text-zinc-400">
              <a href="#" aria-label="GitHub" className="text-base hover:text-zinc-600">
                <SiGithub />
              </a>
              <a href="#" aria-label="LinkedIn" className="text-base hover:text-zinc-600">
                <FaLinkedin />
              </a>
              <a href="#" aria-label="X" className="text-base hover:text-zinc-600">
                <SiX />
              </a>
            </div>
          </div>

          {footerColumns.map((column) => (
            <div key={column.title}>
              <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-900">
                {column.title}
              </h4>
              <ul className="space-y-2 text-xs text-zinc-500">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <a href={link.href} className="hover:text-brand-700">
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <Reveal className="sm:col-span-2 md:col-span-1">
            <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-900">
              Newsletter
            </h4>
            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
              Tips on running structured mentorship programs that actually stick.
            </p>
            <form className="flex flex-col gap-2">
              <input
                type="email"
                placeholder="Email address"
                required
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-brand-300 focus:outline-none focus:ring-4 focus:ring-brand-500/10"
              />
              <button
                type="submit"
                className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
              >
                Subscribe
              </button>
            </form>
          </Reveal>
        </div>

        <div className="flex flex-col items-start justify-between gap-4 border-t border-zinc-200/60 pt-6 sm:flex-row sm:items-center sm:pt-8">
          <p className="text-xs text-zinc-400">
            &copy; 2026 Pathment Technologies, Inc. All rights reserved.
          </p>
          <div className="flex items-center gap-1.5 rounded border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-600">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            All services fully operational
          </div>
        </div>
      </div>
    </footer>
  );
}
