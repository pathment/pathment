'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import PhoneInput, { getCountryCallingCode } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';
import { Search, ChevronDown } from 'lucide-react';

/**
 * Phone input with a searchable, flagged country picker. Wraps
 * `react-phone-number-input` (libphonenumber-js under the hood) for accurate
 * per-country formatting + validation, and swaps its plain native country
 * <select> for a searchable dropdown that matches our design (SVG flags render
 * everywhere — emoji flags don't on Windows). Value is E.164 ("+923001234567").
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CountrySelect({ value, onChange, options, iconComponent: Icon }: any) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const list = useMemo(() => (options as any[]).filter((o) => o.value), [options]); // drop the "International" entry
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return list;
    return list.filter((o) => o.label.toLowerCase().includes(s) || (`+${getCountryCallingCode(o.value)}`).includes(s));
  }, [list, q]);
  const current = list.find((o) => o.value === value);

  return (
    <div ref={ref} className="relative flex items-stretch">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label="Select country"
        className="flex items-center gap-1 pl-3 pr-2 text-slate-600 hover:text-slate-900">
        <Icon country={value} label={current?.label} />
        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-[calc(100%+4px)] z-50 w-72 max-h-72 overflow-auto rounded-lg border border-slate-200 bg-card shadow-lg dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          <div className="sticky top-0 bg-card p-2 border-b border-slate-100">
            <div className="relative">
              <Search className="absolute left-2 top-2 w-4 h-4 text-slate-400" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search country or code…"
                className="w-full pl-8 pr-2 py-1.5 text-sm rounded-md border border-slate-200 bg-card focus:outline-none focus:ring-2 focus:ring-brand-500" />
            </div>
          </div>
          {filtered.map((o) => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); setQ(''); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left hover:bg-slate-50 ${o.value === value ? 'bg-brand-50 dark:bg-brand-500/15' : ''}`}>
              <span className="w-6 shrink-0 inline-flex"><Icon country={o.value} label={o.label} /></span>
              <span className="flex-1 truncate text-slate-700">{o.label}</span>
              <span className="text-xs text-slate-400 tabular-nums">+{getCountryCallingCode(o.value)}</span>
            </button>
          ))}
          {filtered.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 text-center">No match</p>}
        </div>
      )}
    </div>
  );
}

export function PhoneField({
  value, onChange, defaultCountry = 'PK', id, invalid = false,
}: {
  value?: string;
  onChange: (v: string) => void;
  /** ISO country pre-selected for new entries (e.g. 'PK', 'US'). */
  defaultCountry?: string;
  id?: string;
  invalid?: boolean;
}) {
  return (
    <div className={`pf-wrap ${invalid ? 'pf-invalid' : ''}`}>
      <PhoneInput
        international
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        defaultCountry={defaultCountry as any}
        countrySelectComponent={CountrySelect}
        value={value || undefined}
        onChange={(v) => onChange(v || '')}
        id={id}
        placeholder="300 1234567"
      />
    </div>
  );
}
