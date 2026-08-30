'use client';

import { Check, Palette, Sparkles, Sun, Moon, Monitor } from 'lucide-react';
import { useTheme, type ThemeMode } from '@/lib/context/ThemeContext';

const MODES: { key: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Monitor },
];

/**
 * Appearance settings - "Pick your vibe". A grid of accent presets that recolor
 * the whole app instantly (via ThemeContext → CSS vars) and persist per-user
 * (localStorage + server). Each preset only swaps the brand scale, so contrast,
 * neutrals and status colors are always safe.
 */
export function AppearanceTab() {
  const { accent, setAccent, presets, mode, setMode, theme } = useTheme();

  const filteredPresets = presets.filter((p) => {
    if (theme === 'dark') {
      return p.key !== 'violet' && p.key !== 'rose' && p.key !== 'sky' && p.key !== 'graphite';
    } else {
      return p.key !== 'graphite';
    }
  });

  return (
    <div className="space-y-8">
      {/* Light / Dark / System */}
      <div>
        <h2 className="text-slate-900 flex items-center gap-2"><Sun className="w-4 h-4 text-brand-500" />Theme</h2>
        <p className="text-slate-600 text-sm mt-1 mb-3">Light, dark, or match your device.</p>
        <div className="inline-flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
          {MODES.map(({ key, label, Icon }) => (
            <button key={key} type="button" onClick={() => setMode(key)} aria-pressed={mode === key}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                mode === key ? 'bg-card text-brand-700 shadow-sm' : 'text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-4 h-4" />{label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <h2 className="text-slate-900 flex items-center gap-2"><Palette className="w-4 h-4 text-brand-500" />Pick your vibe</h2>
        <p className="text-slate-600 text-sm mt-1">
          Choose an accent that feels like you - it recolors your whole experience instantly and saves to your account.
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {filteredPresets.map((p) => {
          const selected = accent === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => setAccent(p.key)}
              aria-pressed={selected}
              className={`group relative text-left rounded-2xl border p-4 transition-all ${
                selected ? 'border-brand-400 ring-2 ring-brand-500/30 bg-brand-50/40 dark:bg-brand-500/10' : 'border-slate-200 hover:border-slate-300 bg-card'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="w-10 h-10 rounded-xl shadow-sm" style={{ backgroundColor: p.swatch }} />
                {selected && (
                  <span className="w-5 h-5 rounded-full bg-brand-600 flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-slate-900">{p.name}</p>
              <p className="text-xs text-slate-500">{p.vibe}</p>
              {/* mini swatch ramp */}
              <div className="mt-3 flex gap-1">
                {[0.25, 0.5, 0.85, 1].map((o, i) => (
                  <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: p.swatch, opacity: o }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 rounded-xl bg-slate-50 border border-slate-200 px-3.5 py-3">
        <Sparkles className="w-4 h-4 text-brand-500 shrink-0 mt-0.5" />
        <p className="text-sm text-slate-600">
          Your pick follows you across devices. It only changes the accent - text, surfaces and status colors stay clear and readable.
        </p>
      </div>
    </div>
  );
}

export default AppearanceTab;
