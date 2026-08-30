export type TaskFeedbackLike = {
  feedbackText?: string | null;
  revisionNotes?: string | null;
  rating?: number | string | null;
  createdAt?: string | null;
};

/** Latest feedback on a submission (API returns feedback as a hasMany array). */
export function latestSubmissionFeedback(
  submission?: { feedback?: TaskFeedbackLike | TaskFeedbackLike[] | null } | null,
): TaskFeedbackLike | null {
  const raw = submission?.feedback;
  if (!raw) return null;
  const list = Array.isArray(raw) ? raw : [raw];
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
  )[0];
}

export function taskReviewSummary(task: {
  status?: string;
  finalRating?: number | string | null;
  pointsAwarded?: number | null;
  submissions?: { feedback?: TaskFeedbackLike | TaskFeedbackLike[] | null }[] | null;
}) {
  const fb = latestSubmissionFeedback(task.submissions?.[0]);
  const ratingRaw = task.finalRating ?? fb?.rating;
  const r = Number(ratingRaw);
  const rating = task.status === 'completed' && Number.isFinite(r) && r > 0 ? r : null;
  let note: string | null = null;
  if (task.status === 'revision_needed') {
    note = fb?.revisionNotes || fb?.feedbackText || null;
  } else if (task.status === 'completed') {
    note = fb?.feedbackText || null;
  }
  return { rating, note, pointsAwarded: task.pointsAwarded ?? null, feedback: fb };
}
