import { Navigation } from '@/components/shared/Navigation';
import { RoleGuard } from '@/components/shared/RoleGuard';
import OnboardingGuard from '@/components/shared/OnboardingGuard';
import { ActivityTrackerMount } from '@/components/shared/ActivityTrackerMount';
import { TimezoneSync } from '@/components/shared/TimezoneSync';
import { WalkthroughMount } from '@/components/onboarding/WalkthroughMount';
import { ChangelogMount } from '@/components/shared/ChangelogMount';
import { InterviewResumeBar } from '@/components/mentee/InterviewResumeBar';
import { ReviewJoinBar } from '@/components/mentee/ReviewJoinBar';
import { PausedGate } from '@/components/mentee/PausedGate';

export default function MenteeLayout({ children }: { children: React.ReactNode }) {
  return (
    <RoleGuard allowedRoles={['mentee']}>
      <OnboardingGuard>
        <div className="min-h-screen bg-canvas">
          <ActivityTrackerMount />
          <TimezoneSync />
          <WalkthroughMount role="mentee" />
          <ChangelogMount role="mentee" />
          <InterviewResumeBar />
          <Navigation role="mentee" />
          <main className="lg:pl-64 pt-14 lg:pt-0">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              {/* Paused mentees see the "ask a mentor to resume you" gate here
                  instead of their dashboard. Only the mentee side is gated. */}
              <PausedGate>
                <ReviewJoinBar />
                {children}
              </PausedGate>
            </div>
          </main>
        </div>
      </OnboardingGuard>
    </RoleGuard>
  );
}
