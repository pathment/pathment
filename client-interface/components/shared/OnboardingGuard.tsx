'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { Loader2 } from 'lucide-react';

/** A profile photo is mandatory for these roles (admins are exempt). */
const PHOTO_REQUIRED_ROLES = ['mentor', 'mentee'];

export default function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const needsOnboarding = !!user && !user.profileCompleted && user.onboardingStep !== 2;
  // Onboarding is otherwise done, but the user still owes us a profile photo.
  // This also catches EXISTING users (profileCompleted) the next time they log in.
  const needsPhoto = !!user && user.profileCompleted
    && PHOTO_REQUIRED_ROLES.includes(user.role) && !user.profilePictureUrl;

  useEffect(() => {
    if (isLoading || !user) return;

    if (!user.profileCompleted) {
      const step = user.onboardingStep || 0;
      if (step === 0) {
        router.push(user.role === 'mentor' ? '/onboarding/mentor' : '/onboarding/mentee');
      } else if (step === 1) {
        router.push('/onboarding/skills');
      }
      return;
    }

    if (needsPhoto) router.push('/onboarding/photo');
  }, [user, isLoading, router, needsPhoto]);

  // Hold the dashboard back while we redirect to onboarding / the photo step.
  if (isLoading || needsOnboarding || needsPhoto) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
