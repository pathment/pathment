'use client';

import { PhoneField } from './PhoneField';
import type { IntakeFormField } from '@/lib/config/intakeFields';

/**
 * Renders an intake form's configurable fields (the cohort's `intakeFormSchema`).
 * Shared by the public apply form and the applicant portal's "edit my info" so
 * both render — and validate the look of — fields identically. Values are flat
 * strings keyed by field.key; multi-selects store a comma-joined string.
 */
export function IntakeFormFields({ fields, values, onChange }: {
  fields: IntakeFormField[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const inputCls = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card';
  return (
    <>
      {fields.map((field) => {
        const val = values[field.key] || '';
        const selected = val ? val.split(',').map((s) => s.trim()).filter(Boolean) : [];
        const toggleCheckbox = (opt: string) => {
          const next = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
          onChange(field.key, next.join(', '));
        };
        return (
          <div key={field.key}>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              {field.label}{field.required && <span className="text-rose-500"> *</span>}
            </label>
            {field.type === 'phone' ? (
              <PhoneField value={val} onChange={(v) => onChange(field.key, v)} />
            ) : field.type === 'textarea' ? (
              <textarea rows={3} value={val} onChange={(e) => onChange(field.key, e.target.value)} className={inputCls} />
            ) : field.type === 'select' ? (
              <select value={val} onChange={(e) => onChange(field.key, e.target.value)} className={inputCls}>
                <option value="">Select…</option>
                {(field.options || []).map((opt) => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : field.type === 'checkboxes' ? (
              <div className="space-y-1.5">
                {(field.options || []).map((opt) => (
                  <label key={opt} className="flex items-center gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggleCheckbox(opt)} className="accent-brand-600" />
                    {opt}
                  </label>
                ))}
              </div>
            ) : field.type === 'yes_no' ? (
              <div className="flex gap-4 text-sm text-slate-700">
                {['Yes', 'No'].map((opt) => (
                  <label key={opt} className="inline-flex items-center gap-2">
                    <input type="radio" name={field.key} checked={val === opt} onChange={() => onChange(field.key, opt)} className="accent-brand-600" />
                    {opt}
                  </label>
                ))}
              </div>
            ) : (
              <input
                type={field.type === 'number' ? 'number' : field.type === 'date' ? 'date' : field.type === 'email' ? 'email' : field.type === 'url' ? 'url' : 'text'}
                placeholder={field.type === 'url' ? 'https://…' : undefined}
                value={val} onChange={(e) => onChange(field.key, e.target.value)} className={inputCls} />
            )}
          </div>
        );
      })}
    </>
  );
}
