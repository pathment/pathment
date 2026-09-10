'use client';

import { useState } from 'react';
import { CalendarRange, ChevronDown, Check } from 'lucide-react';

export const DAYS_LIST = [
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
  { value: 0, label: 'Sunday' },
];

interface MultiDaySelectDropdownProps {
  selectedDays: number[];
  onChange: (days: number[]) => void;
}

export function MultiDaySelectDropdown({
  selectedDays,
  onChange,
}: MultiDaySelectDropdownProps) {
  const [open, setOpen] = useState(false);

  const isAll = selectedDays.length === 7;
  const isWeekdays = selectedDays.length === 5 && [1, 2, 3, 4, 5].every((d) => selectedDays.includes(d));
  const isWeekends = selectedDays.length === 2 && [6, 0].every((d) => selectedDays.includes(d));

  let labelText = '';
  if (isAll) labelText = 'Every day (Mon-Sun)';
  else if (isWeekdays) labelText = 'Weekdays (Mon-Fri)';
  else if (isWeekends) labelText = 'Weekends (Sat-Sun)';
  else if (selectedDays.length === 0) labelText = 'Select days...';
  else {
    const order = [1, 2, 3, 4, 5, 6, 0];
    const sorted = [...selectedDays].sort((a, b) => order.indexOf(a) - order.indexOf(b));
    labelText = sorted.map((val) => DAYS_LIST.find((d) => d.value === val)?.label.slice(0, 3)).join(', ');
  }

  const toggleDay = (val: number) => {
    const isSelected = selectedDays.includes(val);
    const next = isSelected ? selectedDays.filter((d) => d !== val) : [...selectedDays, val];
    onChange(next.length > 0 ? next : [val]);
  };

  const applyPreset = (preset: 'all' | 'weekdays' | 'weekends' | 'mon-wed-fri') => {
    if (preset === 'all') onChange([1, 2, 3, 4, 5, 6, 0]);
    else if (preset === 'weekdays') onChange([1, 2, 3, 4, 5]);
    else if (preset === 'weekends') onChange([6, 0]);
    else if (preset === 'mon-wed-fri') onChange([1, 3, 5]);
  };

  return (
    <div className="relative inline-block w-full">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 text-xs font-semibold bg-card border border-border rounded-xl text-foreground hover:bg-muted/50 transition-colors shadow-2xs"
      >
        <span className="truncate flex items-center gap-1.5">
          <CalendarRange className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          {labelText}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-full mt-1.5 w-64 z-30 bg-card border border-border rounded-xl shadow-lg dark:shadow-black/50 p-3 space-y-3">
            <div>
              <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Quick Presets</span>
              <div className="flex flex-wrap gap-1">
                {([['weekdays', 'Weekdays'], ['mon-wed-fri', 'M-W-F'], ['weekends', 'Weekends'], ['all', 'Everyday']] as const).map(([preset, label]) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="px-2 py-1 text-[11px] rounded-md bg-muted text-muted-foreground hover:bg-brand-500/10 hover:text-brand-600 dark:hover:text-brand-400 font-medium transition-colors"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="border-t border-border pt-2.5">
              <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1.5">Select Days</span>
              <div className="space-y-0.5 max-h-48 overflow-y-auto pr-1">
                {DAYS_LIST.map((d) => {
                  const checked = selectedDays.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleDay(d.value)}
                      className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                        checked
                          ? 'bg-brand-500/10 text-brand-600 dark:text-brand-400 font-semibold'
                          : 'text-foreground hover:bg-muted'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          readOnly
                          className="rounded border-border text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 pointer-events-none"
                        />
                        <span>{d.label}</span>
                      </div>
                      {checked && <Check className="w-3.5 h-3.5 text-brand-600 dark:text-brand-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
