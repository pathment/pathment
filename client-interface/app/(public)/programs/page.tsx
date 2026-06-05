'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Clock, Loader2, Sparkles } from 'lucide-react';

import { publicApi, type PublicProgram } from '@/lib/services/public-api';

export default function PublicProgramsPage() {
  const [programs, setPrograms] = useState<PublicProgram[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    publicApi
      .listPrograms()
      .then(setPrograms)
      .catch(() => setError('Could not load programs right now.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="max-w-2xl">
        <h1 className="text-3xl font-semibold text-slate-900">Programs we&apos;re offering</h1>
        <p className="mt-2 text-slate-600">
          Browse our structured mentorship programs and apply to the ones that fit you. You&apos;ll get a
          personal link to track your application.
        </p>
      </div>

      {loading ? (
        <div className="py-24 flex justify-center">
          <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
        </div>
      ) : error ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-card p-6 text-slate-600">{error}</div>
      ) : programs.length === 0 ? (
        <div className="mt-10 rounded-xl border border-slate-200 bg-card p-8 text-center text-slate-500">
          No programs are open for applications right now. Check back soon.
        </div>
      ) : (
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Link
              key={program.id}
              href={`/programs/${program.id}`}
              className="group rounded-2xl border border-slate-200 bg-card p-5 hover:border-brand-300 hover:shadow-sm transition-all flex flex-col"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium uppercase tracking-wide text-brand-700 bg-brand-50 dark:bg-brand-500/15 rounded-full px-2.5 py-1">
                  {program.type}
                </span>
                {program.acceptingApplications && (
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
                    <Sparkles className="w-3 h-3" /> Open
                  </span>
                )}
              </div>
              <h2 className="mt-3 font-semibold text-slate-900 group-hover:text-brand-700">{program.name}</h2>
              {program.description && (
                <p className="mt-1.5 text-sm text-slate-600 line-clamp-3">{program.description}</p>
              )}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
                {program.totalDurationWeeks ? (
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> {program.totalDurationWeeks} weeks
                  </span>
                ) : <span />}
                <span className="inline-flex items-center gap-1 text-brand-700 font-medium">
                  View <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
