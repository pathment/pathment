'use client';

import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useAuth } from '@/lib/context/AuthContext';
import { Avatar } from '@/components/shared/Avatar';
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader';

/** The "change your profile photo" row, dropped at the top of each role's Settings → Profile. */
export function ProfilePhotoField() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();

  return (
    <div className="flex items-center gap-4 pb-5 mb-5 border-b border-slate-100">
      <Avatar name={name} src={user?.profilePictureUrl} size="xl" />
      <div>
        <p className="text-sm font-medium text-slate-900">Profile photo</p>
        <p className="text-xs text-slate-500 mb-2">PNG or JPG, up to 5 MB. Shown across Pathment.</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-sm text-slate-700 hover:bg-slate-50"
        >
          <Camera className="w-4 h-4" />{user?.profilePictureUrl ? 'Change photo' : 'Add photo'}
        </button>
      </div>
      <ProfileImageUploader open={open} onClose={() => setOpen(false)} currentUrl={user?.profilePictureUrl} />
    </div>
  );
}
