import { stripHtml } from '@/lib/utils/html';

export const DISCUSSION_REVIEW_FALLBACK = 'Approved from your group discussion. Your feedback for each skill is under "Your participation".';

/**
 * A group discussion review's text, as the mentee should read it: only the
 * mentors' notes. Early automatic reviews stored the whole breakdown (the five
 * skills, speaking time, messages) in the text; that breakdown has its own
 * section now, so repeating it in the review only says the same thing twice.
 */
export function discussionReviewText(text?: string | null) {
  const plain = stripHtml(text || '').trim();
  const notes = plain.split('Group discussion feedback:')[0].trim();
  return notes || (plain ? DISCUSSION_REVIEW_FALLBACK : '');
}
