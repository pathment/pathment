'use client';

import { useMemo, useState, type KeyboardEvent } from 'react';
import { MapPin, Globe, Languages as LanguagesIcon, X } from 'lucide-react';
import { SelectMenu } from '@/components/shared/SelectMenu';

export interface LocationDetails {
  city: string;
  country: string;
  languages: string[];
  timezone: string;
}

interface Props {
  value: LocationDetails;
  onChange: (patch: Partial<LocationDetails>) => void;
}

const FIELD = 'w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 text-sm';

// A reasonable timezone list - falls back gracefully if the runtime lacks Intl.supportedValuesOf.
export function tzList(): string[] {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const all = (Intl as any).supportedValuesOf?.('timeZone');
    if (Array.isArray(all) && all.length) return all;
  } catch { /* ignore */ }
  return ['UTC', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Europe/London', 'Europe/Berlin', 'Asia/Karachi', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Australia/Sydney'];
}

/**
 * Shared "Location & details" block for every role's Settings → Profile tab:
 * city, country, spoken languages (chips), and timezone (datalist of IANA zones).
 * Controlled - the parent owns the values and persists them via PUT /api/profile.
 */
export function LocationDetailsFields({ value, onChange }: Props) {
  const [langDraft, setLangDraft] = useState('');
  const zones = useMemo(tzList, []);

  const addLanguage = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (value.languages.some((l) => l.toLowerCase() === v.toLowerCase())) { setLangDraft(''); return; }
    onChange({ languages: [...value.languages, v] });
    setLangDraft('');
  };
  const onLangKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addLanguage(langDraft); }
    else if (e.key === 'Backspace' && !langDraft && value.languages.length) {
      onChange({ languages: value.languages.slice(0, -1) });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <MapPin className="w-4 h-4 text-brand-500" />
        <h3 className="text-sm font-semibold text-slate-900">Location & details</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <div>
          <label className="block text-slate-700 mb-2 text-sm font-medium">City</label>
          <input value={value.city} onChange={(e) => onChange({ city: e.target.value })} placeholder="e.g. Lahore" className={FIELD} />
        </div>
        <div>
          <label className="block text-slate-700 mb-2 text-sm font-medium">Country</label>
          <input value={value.country} onChange={(e) => onChange({ country: e.target.value })} placeholder="e.g. Pakistan" className={FIELD} />
        </div>
      </div>

      <div>
        <label className="block text-slate-700 mb-2 text-sm font-medium inline-flex items-center gap-1.5"><Globe className="w-3.5 h-3.5 text-slate-400" />Timezone</label>
        <SelectMenu
          value={value.timezone}
          onChange={(tz) => onChange({ timezone: tz })}
          options={zones.map((z) => ({ value: z, label: z.replace(/_/g, ' ') }))}
          placeholder="e.g. Asia/Karachi"
          ariaLabel="Timezone"
          searchable
        />
      </div>

      <div>
        <label className="block text-slate-700 mb-2 text-sm font-medium inline-flex items-center gap-1.5"><LanguagesIcon className="w-3.5 h-3.5 text-slate-400" />Languages</label>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 focus-within:ring-2 focus-within:ring-brand-500">
          {value.languages.map((l) => (
            <span key={l} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-brand-50 text-brand-700 text-xs font-medium">
              {l}
              <button type="button" onClick={() => onChange({ languages: value.languages.filter((x) => x !== l) })} aria-label={`Remove ${l}`} className="hover:text-brand-900"><X className="w-3 h-3" /></button>
            </span>
          ))}
          <input
            value={langDraft}
            onChange={(e) => setLangDraft(e.target.value)}
            onKeyDown={onLangKey}
            onBlur={() => addLanguage(langDraft)}
            placeholder={value.languages.length ? 'Add another…' : 'e.g. English, Urdu'}
            className="flex-1 min-w-[8rem] text-sm focus:outline-none py-1"
          />
        </div>
        <p className="mt-1 text-xs text-slate-400">Press Enter or comma to add each language.</p>
      </div>
    </div>
  );
}

export default LocationDetailsFields;
