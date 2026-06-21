import { queryOptions } from '@tanstack/react-query';
import { matchingApi, enrollmentApi } from '@/lib/services/enrollment-api';
import type { MentorMenteeMatch, MenteeDetailMatch, EnrollmentWithMentee } from '@/lib/types/matches';

/**
 * Query factory for mentor↔mentee matches. Keyed under ['matches', …] so the
 * detail query is cached per (mentor, mentee)
 */
export const matchQueries = {
  all: () => ['matches'] as const,
  menteeDetail: ({ mentorId, menteeId }: { mentorId: string; menteeId: string }) =>
    queryOptions({
      queryKey: [...matchQueries.all(), 'mentor', mentorId, 'mentee', menteeId] as const,
      queryFn: async (): Promise<MenteeDetailMatch | null> => {
        const res: { data?: { matches?: MentorMenteeMatch[] } } =
          await matchingApi.getMatches({ mentorId, menteeId, status: 'active' });
        const matches = res?.data?.matches ?? [];
        if (matches.length > 0) return matches[0];

        // Clan-placed mentees have no MentorMenteeMatch — resolve them via their
        // enrollment instead so the page works for the clan model.
        const enrRes: { data?: { enrollments?: EnrollmentWithMentee[] } } =
          await enrollmentApi.getAll({ menteeId });
        const enrollments = enrRes?.data?.enrollments ?? [];
        const active =
          enrollments.find((e) => !['rejected', 'dropped'].includes(e.status)) ?? enrollments[0];
        if (active) return { mentee: active.mentee, enrollment: active };
        return null;
      },
      enabled: !!mentorId && !!menteeId,
      // Page renders inline "Mentee not found" / loading, not an ErrorBoundary.
      throwOnError: false,
    }),
};
