'use client';

import { useState } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Drawer } from '@/components/shared/Drawer';
import { mentorApi } from '@/lib/services/mentor-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export type NudgeMentee = { id: string; name: string };

const PLACEHOLDER =
  "Just checking in — how's it going? Let me know if anything's blocking you.";

/**
 * Review and send a nudge to one or more mentees. Leave the message blank to
 * use the server's per-mentee default (includes their first name).
 */
export function BulkNudgeDrawer({
  mentees,
  onClose,
  onSent,
}: {
  mentees: NudgeMentee[];
  onClose: () => void;
  onSent: (sentCount: number) => void;
}) {
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const count = mentees.length;

  const send = async () => {
    if (busy || !count) return;
    setBusy(true);
    try {
      const trimmed = message.trim();
      const res = await mentorApi.nudgeBulk(
        mentees.map((m) => m.id),
        trimmed || undefined,
      );
      const sent = res.data?.sent ?? 0;
      const failed = res.data?.failed ?? 0;
      if (sent > 0 && failed === 0) {
        toast.success(`Nudge sent to ${sent} mentee${sent === 1 ? '' : 's'}`);
      } else if (sent > 0) {
        toast.warning(`Nudge sent to ${sent}; ${failed} could not be sent`);
      } else {
        toast.error('Could not send nudges');
        return;
      }
      onSent(sent);
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not send nudges'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={count === 1 ? 'Send a nudge' : `Nudge ${count} mentees`}
      subtitle="They'll get an in-app notification with your message"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-medium disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={send}
            disabled={busy || !count}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
            Send nudge{count > 1 ? ` (${count})` : ''}
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400 mb-2">
            Recipients ({count})
          </p>
          <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 divide-y divide-slate-100">
            {mentees.map((m) => (
              <li key={m.id} className="px-3 py-2 text-sm text-slate-800">
                {m.name}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label htmlFor="nudge-message" className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
            Your message
          </label>
          <textarea
            id="nudge-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={5}
            placeholder={PLACEHOLDER}
            className="mt-2 w-full rounded-xl border border-slate-200 bg-card px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Leave blank to send the default check-in (personalized with each mentee&apos;s name).
          </p>
        </div>
      </div>
    </Drawer>
  );
}
