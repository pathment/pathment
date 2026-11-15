'use client';

import { useId, useMemo, useState } from 'react';
import { Check, Search, Users, X } from 'lucide-react';
import { Kiko } from '@/components/shared/Kiko';
import { formatCoursePrice, type Course } from '@/lib/services/courses-api';

/**
 * Pick an Edorax course from cards rather than a dropdown of long titles.
 *
 * Mentors and admins choose courses by what they look like and what they are
 * about, so each card carries a cover, the title, the opening of the
 * description and what it costs this workspace. Searching filters on title and
 * description. Used by the mentor assign drawer and a selection round's work.
 */

export type PickableCourse = Pick<Course, 'courseId' | 'title' | 'availableSeats' | 'pricingType'>
  & Partial<Pick<Course, 'courseSlug' | 'description' | 'price' | 'currency' | 'coverUrl' | 'freeForOrganization'>>;

export function CoursePicker({
  courses,
  value,
  onChange,
  unavailable,
  disabled = false,
}: {
  courses: PickableCourse[];
  value: string;
  onChange: (course: PickableCourse) => void;
  /** Courses that cannot be picked here, with why ("Already in this pool"). */
  unavailable?: Map<string, string>;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState('');
  const searchId = useId();
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => `${c.title} ${c.description || ''}`.toLowerCase().includes(q));
  }, [courses, query]);

  return (
    <div className="space-y-3">
      {courses.length > 4 && (
        <div className="relative">
          <label htmlFor={searchId} className="sr-only">Search courses</label>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            id={searchId}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${courses.length} courses…`}
            className="w-full rounded-xl border border-slate-200 bg-card py-2.5 pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 py-6 text-center">
          <Kiko mood="thinking" size={56} className="mx-auto" />
          <p className="mt-1 text-sm text-slate-500">No course matches “{query}”.</p>
        </div>
      ) : (
        <div role="radiogroup" aria-label="Edorax course" className="grid max-h-[26rem] grid-cols-1 gap-3 overflow-y-auto p-0.5 sm:grid-cols-2">
          {shown.map((c) => {
            const full = c.availableSeats !== null && c.availableSeats <= 0;
            const reason = unavailable?.get(c.courseId) || (full ? 'No seats left' : null);
            const selected = value === c.courseId;
            const off = disabled || !!reason;
            return (
              <button
                key={c.courseId}
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={off && !selected}
                onClick={() => !off && onChange(c)}
                className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card text-left transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${
                  selected
                    ? 'border-brand-500 ring-2 ring-brand-500/30 shadow-md'
                    : off
                      ? 'cursor-not-allowed border-slate-200 opacity-55'
                      : 'border-slate-200 hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-md'
                }`}
              >
                <CourseCover course={c} />
                {selected && (
                  <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-white shadow">
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                )}
                <div className="flex flex-1 flex-col gap-1 p-3">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">{c.title}</p>
                  {c.description && <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{c.description}</p>}
                  <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1.5 text-[11px] font-medium">
                    <span className={`rounded-full px-2 py-0.5 ${priceTone(c)}`}>{priceLabel(c)}</span>
                    {reason ? (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">{reason}</span>
                    ) : c.availableSeats !== null ? (
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Users className="h-3 w-3" aria-hidden /> {c.availableSeats} seat{c.availableSeats === 1 ? '' : 's'} left
                      </span>
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** "Free", "Free for you" (a paid course this workspace has for free), or the price. */
function priceLabel(c: PickableCourse) {
  if (c.pricingType === 'FREE' || !c.price) return 'Free';
  if (c.freeForOrganization) return 'Free for you';
  return formatCoursePrice({ price: c.price, currency: c.currency || 'USD', pricingType: c.pricingType });
}
const priceTone = (c: PickableCourse) =>
  c.pricingType !== 'FREE' && c.price && !c.freeForOrganization
    ? 'bg-amber-50 text-amber-700'
    : 'bg-emerald-50 text-emerald-700';

/**
 * Edorax's own cover when it sends one. Until then, one drawn from the title:
 * a colour fixed per course (so a course looks the same every time), its
 * initials, and Kiko keeping it company.
 */
export function CourseCover({ course, className = 'h-24' }: { course: PickableCourse; className?: string }) {
  const [broken, setBroken] = useState(false);
  if (course.coverUrl && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote, unknown host; next/image needs it allow-listed
      <img src={course.coverUrl} alt="" onError={() => setBroken(true)} className={`${className} w-full object-cover`} />
    );
  }
  const hue = hueOf(course.courseSlug || course.courseId || course.title);
  const initials = course.title.replace(/[^A-Za-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 || /\d/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return (
    <div
      aria-hidden
      className={`${className} relative w-full overflow-hidden`}
      style={{ background: `linear-gradient(135deg, hsl(${hue} 68% 46%), hsl(${(hue + 38) % 360} 62% 30%))` }}
    >
      <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.9) 1px, transparent 1px)', backgroundSize: '12px 12px' }} />
      <div className="absolute -left-6 -top-10 h-28 w-28 rounded-full bg-white/10" />
      <span className="absolute left-3 top-2.5 text-2xl font-black tracking-tight text-white/90 drop-shadow-sm">{initials || 'ED'}</span>
      <span className="absolute bottom-2 left-3 rounded-full bg-black/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/90 backdrop-blur-sm">Edorax</span>
      <Kiko mood="happy" size={52} className="absolute -bottom-1 right-2 drop-shadow-[0_4px_6px_rgba(0,0,0,0.25)] transition-transform duration-300 group-hover:-translate-y-1" />
    </div>
  );
}

function hueOf(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}
