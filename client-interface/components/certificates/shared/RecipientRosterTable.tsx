'use client';

import React from 'react';
import { Loader2, Users, Sparkles, Info, Edit3, ChevronDown, PauseCircle } from 'lucide-react';
import { getTierBadgeColor } from '@/lib/utils/certificates';
import { TierCriteria } from '@/components/admin/certificates/certificate-constants';

export interface RecipientRosterTableProps {
  filtered: any[];
  criteria: TierCriteria[];
  aiEvalMap: Record<string, any>;
  selectedIds: Set<string>;
  toggleOne: (id: string) => void;
  toggleAll: () => void;
  allSelected: boolean;
  assignedTiers: Record<string, string>;
  handleTierChange: (menteeId: string, tierId: string) => void;
  onInspectAI: (aiResult: any) => void;
  loading: boolean;
  getTierName: (tierId: string) => string;
  recipientTypeLabel?: string;
  userRole?: 'admin' | 'mentor';
  emptyMessage?: string;
}

export function RecipientRosterTable({
  filtered,
  criteria,
  aiEvalMap,
  selectedIds,
  toggleOne,
  toggleAll,
  allSelected,
  assignedTiers,
  handleTierChange,
  onInspectAI,
  loading,
  getTierName,
  recipientTypeLabel = 'Mentee',
  userRole = 'mentor',
  emptyMessage,
}: RecipientRosterTableProps) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="animate-spin w-6 h-6 text-brand-500" />
        <span className="text-xs text-muted-foreground font-semibold">Loading roster data...</span>
      </div>
    );
  }

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-2 text-center border border-border/80 rounded-2xl bg-card">
        <Users className="w-8 h-8 text-muted-foreground/30" />
        <p className="text-xs font-bold text-muted-foreground">
          {emptyMessage || `No active ${recipientTypeLabel.toLowerCase()}s found.`}
        </p>
      </div>
    );
  }

  return (
    <div className="border border-border rounded-2xl overflow-hidden flex flex-col bg-card shadow-xs">
      {}
      <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/50 dark:bg-muted/20 text-[10px] font-extrabold text-muted-foreground uppercase tracking-wider items-center border-b border-border select-none">
        <div className="col-span-1 flex items-center justify-center">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={toggleAll}
            className="w-3.5 h-3.5 rounded border-border text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer shadow-3xs"
          />
        </div>
        <div className="col-span-3">{recipientTypeLabel}</div>
        <div className="col-span-3 text-center">AI Recommendation</div>
        <div className="col-span-3 text-center">Final Assigned Badge</div>
        <div className="col-span-2 text-center">Issued Badges</div>
      </div>

      {}
      <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
        {filtered.map((m: any) => {
          const defaultTier = m.isPaused ? '' : (criteria[criteria.length - 1]?.id ?? 'participation');
          const selectedTier = assignedTiers[m.id] || (aiEvalMap[m.id]?.certificate_tier || m.assignedTier || defaultTier);
          const issuedTiersList: string[] = m.issuedTiers ?? [];
          const initials = `${m.firstName?.charAt(0) || ''}${m.lastName?.charAt(0) || ''}`.toUpperCase();

          return (
            <div
              key={m.id}
              className={`grid grid-cols-12 gap-2 px-4 py-3 items-center text-xs transition-all duration-150 ${
                m.isPaused
                  ? 'bg-amber-500/5 dark:bg-amber-500/10 hover:bg-amber-500/10'
                  : 'hover:bg-muted/20 dark:hover:bg-muted/10'
              }`}
            >
              <div className="col-span-1 flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedIds.has(m.id)}
                  onChange={() => toggleOne(m.id)}
                  className="w-3.5 h-3.5 rounded border-border text-brand-600 focus:ring-brand-500 accent-brand-600 cursor-pointer shadow-3xs"
                />
              </div>

              {}
              <div className="col-span-3 flex items-center gap-2.5 min-w-0">
                <div className="h-7 w-7 rounded-full bg-gradient-to-tr from-brand-500/10 to-indigo-500/10 dark:from-brand-500/20 dark:to-indigo-500/20 text-brand-700 dark:text-brand-300 flex items-center justify-center text-[9px] font-extrabold border border-brand-500/20 shrink-0">
                  {initials || 'U'}
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-foreground truncate flex items-center gap-1.5">
                    <span className="truncate">{m.firstName} {m.lastName}</span>
                    {m.isPaused && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-black uppercase tracking-wider bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-500/30 shrink-0">
                        PAUSED
                      </span>
                    )}
                    {m.role && m.role !== 'mentee' && !m.isPaused && (
                      <span className="px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 shrink-0">
                        {m.role}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-muted-foreground font-medium truncate">{m.email}</p>
                </div>
              </div>

              {}
              <div className="col-span-3 flex items-center justify-center gap-1.5 flex-wrap">
                {m.isPaused ? (
                  <span className="text-[10px] font-bold text-amber-600/80 dark:text-amber-400/80 flex items-center gap-1 px-2 py-0.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <PauseCircle className="w-3 h-3" /> Paused (No Auto Cert)
                  </span>
                ) : aiEvalMap[m.id] ? (
                  <div className="flex items-center gap-1.5 bg-violet-500/10 dark:bg-violet-500/20 border border-violet-500/20 px-2.5 py-1 rounded-xl">
                    <span className="text-[10px] font-extrabold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                      <Sparkles className="w-3 h-3 text-violet-500" /> {getTierName(aiEvalMap[m.id].certificate_tier)}
                    </span>
                    <span
                      className={`px-1.5 py-0.2 rounded-full text-[9px] font-bold ${
                        (aiEvalMap[m.id].match_score ?? 0) >= 75
                          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/20'
                          : 'text-amber-600 dark:text-amber-400 bg-amber-500/20'
                      }`}
                    >
                      {aiEvalMap[m.id].match_score}%
                    </span>
                    <button
                      type="button"
                      onClick={() => onInspectAI(aiEvalMap[m.id])}
                      className="p-0.5 hover:bg-violet-500/20 rounded text-violet-600 dark:text-violet-400 transition-colors"
                      title="View AI Analysis & Breakdown"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-[10px] text-muted-foreground/50 font-semibold select-none">—</span>
                )}
              </div>

              {}
              <div className="col-span-3 flex flex-col items-center justify-center">
                <div className="relative inline-flex items-center w-full max-w-[170px] shadow-2xs rounded-xl border border-border bg-background hover:bg-muted/30 transition-colors">
                  <select
                    value={selectedTier}
                    onChange={e => handleTierChange(m.id, e.target.value)}
                    className="w-full appearance-none pr-8 pl-3 py-1.5 bg-transparent text-[11px] font-semibold text-foreground cursor-pointer focus:outline-none"
                  >
                    <option value="">Select Certificate</option>
                    {criteria.map((c: any) => (
                      <option key={c.id} value={c.id} className="text-foreground bg-card font-medium">
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-2.5 w-3 h-3 pointer-events-none text-muted-foreground/60" />
                </div>
                {aiEvalMap[m.id] && aiEvalMap[m.id].certificate_tier !== selectedTier && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 dark:text-amber-400 mt-0.5">
                    <Edit3 className="w-2.5 h-2.5" /> Overridden by {userRole === 'admin' ? 'Admin' : 'Mentor'}
                  </span>
                )}
              </div>

              {}
              <div className="col-span-2 flex flex-wrap justify-center gap-1">
                {issuedTiersList.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/40 font-semibold select-none">—</span>
                ) : (
                  issuedTiersList.map((tier, idx) => (
                    <span
                      key={`${tier}-${idx}`}
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-extrabold uppercase tracking-wide ${getTierBadgeColor(tier)}`}
                    >
                      {getTierName(tier)}
                    </span>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
