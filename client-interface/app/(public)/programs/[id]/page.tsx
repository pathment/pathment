'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, Clock, Loader2 } from 'lucide-react';

import { publicApi, type PublicProgram } from '@/lib/services/public-api';

export default function PublicProgramDetailPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [program, setProgram] = useState<PublicProgram | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    publicApi
      .getProgram(id)
      .then(setProgram)
      .catch(() => setError('This program is not available.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="py-24 flex justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-600">{error || 'Program not found.'}</p>
        <Link href="/programs" className="mt-4 inline-flex items-center gap-1 text-brand-700 font-medium">
          <ArrowLeft className="w-4 h-4" /> Back to programs
        </Link>
      </div>
    );
  }

  const openCohorts = program.openCohorts || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-12">
      <Link href="/programs" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
        <ArrowLeft className="w-4 h-4" /> All programs
      </Link>

      <div className="mt-4 flex items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-brand-700 bg-brand-50 dark:bg-brand-500/15 rounded-full px-2.5 py-1">
          {program.type}
        </span>
        {program.totalDurationWeeks ? (
          <span className="inline-flex items-center gap-1 text-xs text-slate-500">
            <Clock className="w-3.5 h-3.5" /> {program.totalDurationWeeks} weeks
            {program.estimatedHoursPerWeek ? ` · ~${program.estimatedHoursPerWeek}h/week` : ''}
          </span>
        ) : null}
      </div>

      <h1 className="mt-3 text-3xl font-semibold text-slate-900">{program.name}</h1>
      {program.description && <p className="mt-3 text-slate-600 leading-relaxed">{program.description}</p>}

      {program.targetAudience && (
        <p className="mt-4 text-sm text-slate-500"><span className="font-medium text-slate-700">Who it&apos;s for:</span> {program.targetAudience}</p>
      )}

      {!!(program.learningOutcomes && program.learningOutcomes.length) && (
        <div className="mt-8">
          <h2 className="font-semibold text-slate-900">What you&apos;ll achieve</h2>
          <ul className="mt-3 space-y-2">
            {program.learningOutcomes.map((o, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                <CheckCircle2 className="w-4 h-4 text-brand-600 mt-0.5 shrink-0" /> {o}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!!(program.prerequisites && program.prerequisites.length) && (
        <div className="mt-6">
          <h2 className="font-semibold text-slate-900">Prerequisites</h2>
          <ul className="mt-3 space-y-1.5 list-disc list-inside text-sm text-slate-600">
            {program.prerequisites.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-10 rounded-2xl border border-slate-200 bg-card p-6">
        <h2 className="font-semibold text-slate-900">Apply</h2>
        {openCohorts.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            There are no open intakes for this program right now. Check back soon.
          </p>
        ) : (
          <div className="mt-4 space-y-3">
            {openCohorts.map((c) => (
              <Link
                key={c.id}
                href={`/apply/${c.slug}`}
                className="flex items-center justify-between rounded-xl border border-slate-200 p-4 hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
              >
                <div>
                  <p className="font-medium text-slate-900">{c.name}</p>
                  {(c.startDate || c.applyClosesAt) && (
                    <p className="mt-0.5 text-xs text-slate-500 inline-flex items-center gap-1">
                      <CalendarDays className="w-3.5 h-3.5" />
                      {c.startDate ? `Starts ${new Date(c.startDate).toLocaleDateString()}` : ''}
                      {c.applyClosesAt ? ` · Apply by ${new Date(c.applyClosesAt).toLocaleDateString()}` : ''}
                    </p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                  Apply <ArrowRight className="w-4 h-4" />
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
