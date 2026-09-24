'use client';

import { useState } from 'react';
import { Users, User, CheckSquare, Search, ChevronDown, Check, UserCheck } from 'lucide-react';

export type MenteeScope = 'all' | 'selected' | 'single';

export interface MenteeItem {
  id: string;
  name: string;
  avatarUrl?: string | null;
  profilePictureUrl?: string | null;
  avatar?: string | null;
  email?: string;
}

interface MenteeTargetSelectorProps {
  scope: MenteeScope;
  setScope: (scope: MenteeScope) => void;
  cohort: MenteeItem[];
  selectedMenteeIds: Set<string>;
  setSelectedMenteeIds: (ids: Set<string>) => void;
  menteeId: string;
  setMenteeId: (id: string) => void;
}

function getInitials(name: string) {
  if (!name) return 'M';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function MenteeAvatar({ mentee, size = 'sm' }: { mentee: MenteeItem; size?: 'sm' | 'md' }) {
  const photo = mentee.profilePictureUrl || mentee.avatarUrl;
  const imgClasses = size === 'md' ? 'w-9 h-9 rounded-full object-cover shrink-0' : 'w-6.5 h-6.5 rounded-full object-cover shrink-0';
  const fallbackClasses = size === 'md' ? 'w-9 h-9 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-bold text-xs flex items-center justify-center shrink-0' : 'w-6.5 h-6.5 rounded-full bg-brand-100 dark:bg-brand-500/20 text-brand-700 dark:text-brand-300 font-bold text-[10px] flex items-center justify-center shrink-0';

  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt={mentee.name}
        className={imgClasses}
      />
    );
  }

  const initials = mentee.avatar || getInitials(mentee.name);
  return (
    <div className={fallbackClasses}>
      {initials}
    </div>
  );
}

export function MenteeTargetSelector({
  scope,
  setScope,
  cohort,
  selectedMenteeIds,
  setSelectedMenteeIds,
  menteeId,
  setMenteeId,
}: MenteeTargetSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const selectedMentee = cohort.find((m) => m.id === menteeId);
  const filteredCohort = cohort.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
  );

  const allSelected = cohort.length > 0 && selectedMenteeIds.size === cohort.length;

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedMenteeIds(new Set());
    } else {
      setSelectedMenteeIds(new Set(cohort.map((m) => m.id)));
    }
  };

  const toggleMenteeSelection = (id: string) => {
    const next = new Set(selectedMenteeIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedMenteeIds(next);
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-5 space-y-4 shadow-xs">
      {/* Header & Scope Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Target Scope
            </h3>
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-brand-50 dark:bg-brand-500/15 text-brand-700 dark:text-brand-300">
              {scope === 'all'
                ? `${cohort.length} Mentees`
                : scope === 'selected'
                ? `${selectedMenteeIds.size} Selected`
                : selectedMentee
                ? selectedMentee.name
                : '1 Mentee'}
            </span>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Choose who to configure and activate schedule slots for.
          </p>
        </div>

        {/* Segmented Control Switcher */}
        <div className="inline-flex rounded-xl bg-muted p-1 border border-border">
          <button
            type="button"
            onClick={() => {
              setScope('all');
              setMenteeId('');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              scope === 'all'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            All Mentees ({cohort.length})
          </button>

          <button
            type="button"
            onClick={() => {
              setScope('selected');
              setMenteeId('');
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              scope === 'selected'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5" />
            Selected ({selectedMenteeIds.size})
          </button>

          <button
            type="button"
            onClick={() => setScope('single')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 ${
              scope === 'single'
                ? 'bg-background text-foreground shadow-sm font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            Single Mentee
          </button>
        </div>
      </div>

      {/* Scope: SELECTED (Multi-select Grid with Avatars) */}
      {scope === 'selected' && (
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Select cohort members to include:
            </span>
            <button
              type="button"
              onClick={toggleSelectAll}
              className="text-xs font-semibold text-brand-600 dark:text-brand-400 hover:text-brand-700 transition-colors"
            >
              {allSelected ? 'Clear all' : 'Select all'}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-48 overflow-y-auto p-0.5">
            {cohort.map((m) => {
              const isChecked = selectedMenteeIds.has(m.id);
              return (
                <label
                  key={m.id}
                  onClick={() => toggleMenteeSelection(m.id)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-xs font-medium cursor-pointer transition-all ${
                    isChecked
                      ? 'border-brand-300 dark:border-brand-500/40 bg-brand-50/70 dark:bg-brand-500/10 text-brand-800 dark:text-brand-200 font-semibold shadow-xs'
                      : 'border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    readOnly
                    className="rounded border-slate-300 text-brand-600 focus:ring-brand-500 w-3.5 h-3.5 shrink-0"
                  />
                  <MenteeAvatar mentee={m} size="sm" />
                  <span className="truncate">{m.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Scope: SINGLE MENTEE (Combobox Selector with Avatars) */}
      {scope === 'single' && (
        <div className="space-y-3 pt-1">
          {selectedMentee ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl border border-brand-200 dark:border-brand-500/30 bg-brand-50/50 dark:bg-brand-500/10">
              <div className="flex items-center gap-3 min-w-0">
                <MenteeAvatar mentee={selectedMentee} size="md" />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {selectedMentee.name}
                  </p>
                  <p className="text-[11px] text-brand-700 dark:text-brand-300">
                    Editing individual schedule slots
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setMenteeId('')}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shrink-0"
              >
                Change mentee
              </button>
            </div>
          ) : (
            <div className="relative">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Select Mentee:
              </label>

              <div className="relative">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onFocus={() => setIsDropdownOpen(true)}
                  placeholder="Search mentee by name..."
                  className="w-full pl-9 pr-9 py-2 border border-slate-200 dark:border-slate-800 rounded-xl text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Dropdown overlay */}
              {isDropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setIsDropdownOpen(false)}
                  />
                  <div className="absolute left-0 right-0 top-full mt-1.5 z-20 max-h-56 overflow-y-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg divide-y divide-slate-100 dark:divide-slate-800 p-1">
                    {filteredCohort.length === 0 ? (
                      <p className="py-3 text-center text-xs text-slate-400">
                        No mentees found.
                      </p>
                    ) : (
                      filteredCohort.map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => {
                            setMenteeId(m.id);
                            setIsDropdownOpen(false);
                            setSearchQuery('');
                          }}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-brand-50/60 dark:hover:bg-brand-500/15 flex items-center justify-between transition-colors group"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <MenteeAvatar mentee={m} size="sm" />
                            <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                              {m.name}
                            </span>
                          </div>
                          {menteeId === m.id && (
                            <Check className="w-3.5 h-3.5 text-brand-600 shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer Context Summary Strip */}
      <div className="pt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        <UserCheck className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
        {scope === 'all' ? (
          <span>
            Applying changes &amp; activating recurring tasks for <strong className="text-slate-800 dark:text-slate-200">all {cohort.length} mentees</strong>.
          </span>
        ) : scope === 'selected' ? (
          <span>
            Applying changes &amp; activating recurring tasks for <strong className="text-slate-800 dark:text-slate-200">{selectedMenteeIds.size} selected mentee(s)</strong>.
          </span>
        ) : (
          <span>
            {selectedMentee ? (
              <>Applying changes to individual schedule for <strong className="text-slate-800 dark:text-slate-200">{selectedMentee.name}</strong>.</>
            ) : (
              <>Select a mentee above to customize their schedule.</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}
