'use client';

import { InterviewResumeBar } from '@/components/mentee/InterviewResumeBar';
import { ReviewJoinBar } from '@/components/mentee/ReviewJoinBar';
import { PausedBanner } from '@/components/mentee/PausedBanner';
import { DiscussionMeetingBanner } from '@/components/shared/discussions/meeting/DiscussionMeetingBanner';
import { useMenteeScope } from '@/lib/hooks/mentee';

/**
 * The strips above the learner workspace that only mean something in a clan.
 *
 * A pause belongs to a clan membership, a cohort review belongs to a cohort,
 * and an interview to resume belongs to a roadmap. A selection-pool candidate
 * has none of the three — and each of these components asks the server for
 * something a candidate has no enrollment behind, so leaving them mounted
 * would be three failing requests on every page as well as three strips that
 * could never say anything.
 *
 * `before` renders above them, so the layout keeps its order either way.
 */
export function MenteeClanChrome() {
  const { inPool } = useMenteeScope();
  if (inPool) return null;
  return (
    <>
      <PausedBanner />
      <ReviewJoinBar />
      <DiscussionMeetingBanner role="mentee" />
    </>
  );
}

/** The resume bar sits outside the page container, so it is its own export. */
export function MenteeInterviewChrome() {
  const { inPool } = useMenteeScope();
  if (inPool) return null;
  return <InterviewResumeBar />;
}
