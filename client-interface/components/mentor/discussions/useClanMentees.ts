'use client';

import { useMemo } from 'react';
import { useMentorCohort } from '@/lib/hooks/mentor/useMentorCohort';
import { clanIdOfRow } from '@/lib/utils/clan-scope';
import type { MenteeOption } from './MenteePicker';

/** The mentees of one clan, for choosing who is in a group. The server checks too. */
export function useClanMentees(clanId: string | null | undefined): MenteeOption[] {
  const { cohort } = useMentorCohort();
  return useMemo(() => (
    clanId
      ? cohort
        .filter((m) => clanIdOfRow(m).includes(clanId))
        .map((m) => ({ id: m.id, name: m.name, profilePictureUrl: m.profilePictureUrl }))
      : []
  ), [cohort, clanId]);
}
