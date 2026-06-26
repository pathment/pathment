'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { ProfileImageUploader } from '@/components/shared/ProfileImageUploader';
import { UserCircle2 } from 'lucide-react';

/**
 * Mandatory profile-photo step. The OnboardingGuard sends any mentor/mentee
 * without a photo here (including existing users on their next login). The
 * uploader runs in `required` mode — no skipping — and on success we head to the
 * dashboard. Admins and anyone who already has a photo are bounced straight out.
 */
export default function OnboardingPhotoPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (isLoading) return;
    if (!user) { router.replace('/login'); return; }
    const exempt = user.role !== 'mentor' && user.role !== 'mentee';
    if (exempt || user.profilePictureUrl) router.replace(`/${user.role}/dashboard`);
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4">
      <div className="text-center mb-6 max-w-md">
        <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-4 shadow-sm shadow-brand-200">
          <UserCircle2 className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-slate-900 mb-2">One last thing — add your photo</h1>
        <p className="text-slate-600">A real photo helps your {user?.role === 'mentor' ? 'mentees' : 'mentor and clan'} recognise you across Pathment. It only takes a moment.</p>
      </div>
      <ProfileImageUploader
        open
        required
        title="Add your profile photo"
        onUploaded={() => router.push(`/${user?.role}/dashboard`)}
      />
    </div>
  );
}
