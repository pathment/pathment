import type { ReactNode } from 'react';
import Link from 'next/link';
import '@/styles/public-appearance.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-public-appearance className="auth-shell">
      <header className="auth-nav">
        <Link href="https://pathment.me" className="inline-flex items-center gap-3 text-lg font-bold text-slate-950">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tile.png" alt="" width={42} height={42} className="rounded-xl shadow-sm" />
          Pathment
        </Link>
        <Link href="https://pathment.me" className="text-sm font-medium text-slate-600 hover:text-brand-700">About Pathment</Link>
      </header>
      <main id="auth-content" className="auth-main"><div className="auth-form">{children}</div></main>
      <footer className="auth-footer">
        <span>© Pathment</span>
        <Link href="https://pathment.me/privacy">Privacy</Link>
      </footer>
    </div>
  );
}
