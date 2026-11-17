import { screenShareSupported, videoRecordingSupported } from '@/lib/utils/interviewMedia';

/** What this browser can do, sent when an attempt starts (see the server's proctoringRules). */
export const browserCapabilities = () =>
  [screenShareSupported() ? 'screen' : null, videoRecordingSupported() ? 'video' : null].filter(Boolean) as string[];

/** What a proctored or video attempt needs that this browser can't do, if anything. */
export function deviceProblemFor({ screenRequired, hasVideo }: { screenRequired: boolean; hasVideo: boolean }): 'screen' | 'video' | null {
  if (screenRequired && !screenShareSupported()) return 'screen';
  if (hasVideo && !videoRecordingSupported()) return 'video';
  return null;
}
