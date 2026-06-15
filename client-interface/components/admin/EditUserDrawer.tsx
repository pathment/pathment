'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Loader2, KeyRound, Mail, ShieldCheck } from 'lucide-react';

import { Drawer } from '@/components/shared/Drawer';
import { adminApi } from '@/lib/services/admin-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

export interface EditableUser {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: 'admin' | 'mentor' | 'mentee';
  twoFactorEnabled?: boolean;
}

/**
 * Admin edit of any user: name, email (kept verified), base role (mentee↔mentor),
 * and password — set a new one directly OR send a reset link. Admin accounts
 * can't be re-roled here (managed in Roles & Access).
 */
export function EditUserDrawer({ user, onClose, onSaved }: { user: EditableUser; onClose: () => void; onSaved?: () => void }) {
  const [firstName, setFirstName] = useState(user.firstName || '');
  const [lastName, setLastName] = useState(user.lastName || '');
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<'mentee' | 'mentor'>(user.role === 'mentor' ? 'mentor' : 'mentee');
  const [saving, setSaving] = useState(false);

  const [newPassword, setNewPassword] = useState('');
  const [pwBusy, setPwBusy] = useState<'set' | 'reset' | null>(null);
  const [twoFaOn, setTwoFaOn] = useState(!!user.twoFactorEnabled);
  const [twoFaBusy, setTwoFaBusy] = useState(false);

  const isAdmin = user.role === 'admin';

  const disable2FA = async () => {
    setTwoFaBusy(true);
    try {
      await adminApi.users.disable2FA(user.id);
      setTwoFaOn(false);
      toast.success('Two-factor disabled. They can log in without a code and re-enable it in Settings.');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not disable 2FA')); }
    finally { setTwoFaBusy(false); }
  };

  const save = async () => {
    setSaving(true);
    try {
      const data: Record<string, unknown> = { firstName, lastName, email };
      if (!isAdmin) data.role = role;
      await adminApi.users.update(user.id, data);
      toast.success('User updated');
      onSaved?.();
      onClose();
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not update the user')); }
    finally { setSaving(false); }
  };

  const setPassword = async () => {
    if (newPassword.length < 8) { toast.error('Password must be at least 8 characters'); return; }
    setPwBusy('set');
    try {
      await adminApi.users.setPassword(user.id, newPassword);
      toast.success('Password set — the user has been signed out.');
      setNewPassword('');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not set the password')); }
    finally { setPwBusy(null); }
  };

  const sendReset = async () => {
    setPwBusy('reset');
    try {
      await adminApi.users.sendReset(user.id);
      toast.success('Reset link sent to their email.');
    } catch (e) { toast.error(extractApiErrorMessage(e, 'Could not send the reset link')); }
    finally { setPwBusy(null); }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer open onClose={onClose} title="Edit user" subtitle={`${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-brand-600 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}Save
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">First name</label>
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className={field} />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Last name</label>
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} className={field} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          <p className="mt-1 text-xs text-slate-400">Changing this keeps the account verified — they can log in with the new email right away.</p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Base role</label>
          {isAdmin ? (
            <p className="text-sm text-slate-500">This is an admin account — manage its access in Roles &amp; Access.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                {(['mentee', 'mentor'] as const).map((r) => (
                  <button key={r} type="button" onClick={() => setRole(r)}
                    className={`rounded-lg border px-3 py-2 text-sm capitalize ${role === r ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15 text-brand-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                    {r}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-slate-400">Their default account type. Switching to mentor lets them lead/co-mentor without being treated as a mentee.</p>
            </>
          )}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1 inline-flex items-center gap-1.5"><KeyRound className="w-4 h-4 text-slate-400" />Password</label>
          <div className="flex items-center gap-2">
            <input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password (min 8 chars)" className={`${field} flex-1`} />
            <button onClick={setPassword} disabled={pwBusy !== null || newPassword.length < 8}
              className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5 shrink-0">
              {pwBusy === 'set' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}Set
            </button>
          </div>
          <button onClick={sendReset} disabled={pwBusy !== null}
            className="mt-2 inline-flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 disabled:opacity-50">
            {pwBusy === 'reset' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}Or send them a reset link instead
          </button>
          <p className="mt-1 text-xs text-slate-400">Setting a password signs the user out everywhere. Share it with them securely.</p>
        </div>

        <div className="border-t border-slate-100 pt-4">
          <label className="block text-sm font-medium text-slate-700 mb-1 inline-flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-slate-400" />Two-factor authentication</label>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm text-slate-600 inline-flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${twoFaOn ? 'bg-emerald-500' : 'bg-slate-300'}`} />
              {user.twoFactorEnabled === undefined ? '2FA' : twoFaOn ? 'Enabled' : 'Off'}
            </span>
            <button onClick={disable2FA} disabled={twoFaBusy || (user.twoFactorEnabled === false)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 text-sm font-medium disabled:opacity-50 inline-flex items-center gap-1.5">
              {twoFaBusy && <Loader2 className="w-4 h-4 animate-spin" />}Disable / reset 2FA
            </button>
          </div>
          <p className="mt-1 text-xs text-slate-400">Use this if a user is locked out (lost device). Admins can turn 2FA off, but can’t turn it on for someone — enrolling needs their own authenticator app.</p>
        </div>
      </div>
    </Drawer>
  );
}
