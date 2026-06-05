import Link from 'next/link';
import type { ReactNode } from 'react';

/**
 * Public shell for the unauthenticated intake surface (program catalog, apply
 * forms, applicant status). Deliberately minimal — visitors see only offerings,
 * nothing internal, until they're placed.
 */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-canvas flex flex-col">
      <header className="border-b border-slate-200 bg-card">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/programs" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="inline-flex w-7 h-7 rounded-lg bg-brand-600 text-white items-center justify-center text-sm">P</span>
            Pathment
          </Link>
          <nav className="flex items-center gap-2 text-sm">
            <Link href="/programs" className="px-3 py-2 rounded-lg text-slate-600 hover:bg-slate-100">Programs</Link>
            <Link href="/login" className="px-3 py-2 rounded-lg text-brand-700 hover:bg-brand-50 font-medium">Log in</Link>
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        © Pathment — structured mentorship programs
      </footer>
    </div>
  );
}
