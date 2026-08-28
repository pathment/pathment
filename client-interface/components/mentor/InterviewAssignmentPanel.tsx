'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Mic, StopCircle } from 'lucide-react';
import { interviewApi } from '@/lib/services/interview-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { useConfirm } from '@/lib/context/ConfirmContext';

/**
 * Mentor controls for an active mock-interview assignment: adjust total time and
 * end a live attempt without deleting submitted history.
 */
export function InterviewAssignmentPanel({
  taskId,
  taskStatus,
  onChanged,
}: {
  taskId: string;
  taskStatus: string;
  onChanged?: () => void;
}) {
  const confirm = useConfirm();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [timingMode, setTimingMode] = useState<'per_question' | 'total'>('per_question');
  const [totalMinutes, setTotalMinutes] = useState(30);
  const [activeSession, setActiveSession] = useState<{ id: string } | null>(null);

  const editable = !['submitted', 'completed', 'cancelled'].includes(taskStatus);

  const load = async () => {
    try {
      setLoading(true);
      const res = await interviewApi.getAssignmentForMentor(taskId) as {
        data?: {
          options?: { timingMode?: 'per_question' | 'total'; totalSeconds?: number | null };
          activeSession?: { id: string } | null;
        };
      };
      const opts = res?.data?.options;
      setTimingMode(opts?.timingMode || 'per_question');
      setTotalMinutes(opts?.totalSeconds ? Math.max(1, Math.round(opts.totalSeconds / 60)) : 30);
      setActiveSession(res?.data?.activeSession || null);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not load interview settings'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTiming = async () => {
    try {
      setSaving(true);
      await interviewApi.updateAssignmentOptions(taskId, {
        timingMode,
        totalSeconds: timingMode === 'total' ? Math.max(60, Math.round(totalMinutes * 60)) : null,
      });
      toast.success('Interview timing updated');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not update interview timing'));
    } finally {
      setSaving(false);
    }
  };

  const endAttempt = async () => {
    if (!(await confirm({
      title: 'End this interview attempt?',
      description: 'The mentee will no longer be able to resume this in-progress attempt. Submitted attempts are kept.',
      variant: 'danger',
      confirmLabel: 'End attempt',
    }))) return;
    try {
      setSaving(true);
      await interviewApi.abandonActiveInterview(taskId);
      toast.success('Interview attempt ended');
      await load();
      onChanged?.();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not end the interview attempt'));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500 inline-flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Loading interview settings…
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-violet-900">Mock interview</p>
        {activeSession && (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 px-2 py-0.5 text-[11px] font-medium text-white">
            <Mic className="w-3 h-3" /> In progress
          </span>
        )}
      </div>

      {editable && (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            {(['per_question', 'total'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setTimingMode(mode)}
                className={`px-2.5 py-1 rounded-md border text-xs font-medium ${
                  timingMode === mode
                    ? 'border-violet-400 bg-white text-violet-800'
                    : 'border-violet-200 text-violet-700 hover:bg-white/70'
                }`}
              >
                {mode === 'total' ? 'Total timer' : 'Per question'}
              </button>
            ))}
          </div>
          {timingMode === 'total' && (
            <label className="flex items-center gap-2 text-sm text-violet-900">
              <span>Total time</span>
              <input
                type="number"
                min={1}
                max={240}
                value={totalMinutes}
                onChange={(e) => setTotalMinutes(Math.max(1, Number(e.target.value) || 1))}
                className="w-20 rounded-md border border-violet-200 bg-white px-2 py-1 text-sm"
              />
              <span className="text-violet-700">minutes</span>
            </label>
          )}
          <button
            type="button"
            onClick={saveTiming}
            disabled={saving}
            className="px-3 py-1.5 rounded-md bg-violet-700 hover:bg-violet-800 text-white text-xs font-medium disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save timing'}
          </button>
        </div>
      )}

      {activeSession && editable && (
        <button
          type="button"
          onClick={endAttempt}
          disabled={saving}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 hover:text-red-800 disabled:opacity-50"
        >
          <StopCircle className="w-3.5 h-3.5" /> End in-progress attempt
        </button>
      )}
    </div>
  );
}
