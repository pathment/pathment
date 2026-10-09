import { SummitBackdrop } from '@/components/auth/SummitBackdrop';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Route, Users, CheckCircle2 } from 'lucide-react';
import '@/styles/public-appearance.css';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div data-public-appearance className="auth-shell">
      <aside className="auth-story">
        <SummitBackdrop />
        <Link href="https://pathment.me" className="flex w-fit items-center gap-3 text-xl font-semibold">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-tile.png" alt="" width={40} height={40} className="rounded-xl" />Pathment
        </Link>
        <div className="auth-story-content">
          <p className="text-xs font-semibold uppercase tracking-[.2em] text-teal-200">A little direction. A lot of possibility.</p>
          <h2>Your next chapter<br />starts with a path.</h2>
          <p className="max-w-sm text-base leading-relaxed text-teal-50/80">Learn with purpose, connect with mentors, and turn steady effort into meaningful progress.</p>
          <div className="auth-story-benefits mt-6 space-y-3">
            {[{ icon: Route, title: 'Find your direction', detail: 'A clear roadmap, one step at a time.' }, { icon: Users, title: 'Grow with people', detail: 'Mentors and a community along the way.' }, { icon: CheckCircle2, title: 'Make progress visible', detail: 'Your work, feedback, and milestones together.' }].map(({ icon: Icon, title, detail }) => <div key={title} className="flex items-start gap-4"><span className="rounded-xl border border-white/15 bg-white/10 p-2.5"><Icon size={19} aria-hidden="true" /></span><div><p className="text-sm font-medium">{title}</p><p className="mt-1 text-sm text-teal-50/65">{detail}</p></div></div>)}
          </div>
        </div>
        <Link href="https://pathment.me" className="mt-8 flex w-fit items-center gap-2 text-sm text-teal-100 hover:text-white">About Pathment <ArrowUpRight size={16} /></Link>
      </aside>
      <main id="auth-content" className="auth-main"><div className="auth-form">{children}</div><p className="mt-8 text-center text-xs text-muted-foreground">Pathment · Learn with direction. Grow together.</p></main>
    </div>
  );
}
