'use client';

import { ShieldAlert, X } from 'lucide-react';

interface DuplicateRecipient {
  id: string;
  name: string;
  email: string;
  tier: string;
}

interface DuplicateWarnModalProps {
  isOpen: boolean;
  duplicates: DuplicateRecipient[];
  onCancel: () => void;
  onIssueAnyway: () => void;
  onSkipDuplicates: () => void;
}

export default function DuplicateWarnModal({
  isOpen,
  duplicates,
  onCancel,
  onIssueAnyway,
  onSkipDuplicates
}: DuplicateWarnModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div 
        className="bg-card border border-border w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh] relative animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between bg-amber-500/5">
          <h3 className="text-sm font-bold text-amber-600 flex items-center gap-1.5">
            <ShieldAlert className="w-5 h-5 text-amber-500" />
            Duplicate Issuance Warning
          </h3>
          <button 
            onClick={onCancel} 
            className="p-1 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The following recipients have already been issued a certificate for the <strong className="text-foreground">same badge tier</strong>:
          </p>
          
          <div className="border border-border rounded-2xl overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-border bg-muted/10">
            {duplicates.map(dup => (
              <div key={dup.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-muted/20 text-xs font-semibold transition-colors gap-3">
                <div className="min-w-0 flex-1">
                  <span className="text-foreground font-bold truncate block">{dup.name}</span>
                  <span className="text-[10px] text-muted-foreground truncate block">{dup.email}</span>
                </div>
                <span className="shrink-0 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-500/10 text-amber-600 border border-amber-500/20">
                  Already Has {dup.tier}
                </span>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground leading-relaxed">
            Choose whether you want to skip these duplicates and issue to the remaining new recipients only, or force generation for all selections anyway.
          </p>
        </div>

        {}
        <div className="px-6 py-4 bg-muted/40 border-t border-border flex flex-col sm:flex-row justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="w-full sm:w-auto px-4 py-2.5 border border-border bg-background hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all order-3 sm:order-1 focus:outline-none"
          >
            Cancel
          </button>
          
          <button
            type="button"
            onClick={onIssueAnyway}
            className="w-full sm:w-auto px-4 py-2.5 border border-amber-500/20 hover:border-amber-500/30 bg-amber-500/5 hover:bg-amber-500/10 text-amber-700 rounded-xl text-xs font-bold transition-all order-2 focus:outline-none"
          >
            Issue All Anyway
          </button>

          <button
            type="button"
            onClick={onSkipDuplicates}
            className="w-full sm:w-auto px-4 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all order-1 sm:order-3 shadow-xs focus:outline-none"
          >
            Skip Duplicates & Issue
          </button>
        </div>
      </div>
    </div>
  );
}
