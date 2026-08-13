import React from 'react';

export interface Tab {
  id: string;
  label: string;
  icon?: React.ElementType;
  /** Optional count badge, e.g. tab count */
  count?: number;
  /** Marks a newly arrived tab, so people notice it exists. */
  isNew?: boolean;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onChange: (id: string) => void;
  /** Visual style: 'underline' (default) or 'pill' */
  variant?: 'underline' | 'pill';
  /** Extra class on the container */
  className?: string;
}

export function TabBar({
  tabs,
  activeTab,
  onChange,
  variant = 'underline',
  className = '',
}: TabBarProps) {
  if (variant === 'pill') {
    return (
      <div className={`flex flex-wrap gap-2 ${className}`}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {Icon && <Icon className="w-4 h-4" />}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${active ? 'bg-card/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                  {tab.count}
                </span>
              )}
              {tab.isNew && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${active ? 'bg-card/20 text-white' : 'bg-brand-100 text-brand-700'}`}>
                  New
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  // underline variant
  return (
    <div className={`flex gap-1 border-b border-slate-200 ${className}`}>
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const active = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${
              active
                ? 'border-brand-600 text-brand-600'
                : 'border-transparent text-slate-500 hover:text-slate-900 hover:border-slate-300'
            }`}
          >
            {Icon && <Icon className="w-4 h-4" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600'}`}>
                {tab.count}
              </span>
            )}
            {tab.isNew && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide bg-brand-100 text-brand-700">
                New
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
