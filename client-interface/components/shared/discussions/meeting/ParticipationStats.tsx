import { Clock, Image as ImageIcon, MessageCircle, Mic } from 'lucide-react';
import { MetricTile } from '@/components/shared/MetricTile';
import { fmtTalk } from './meetingFormat';

/**
 * What one member did in a group discussion, as the app's stat tiles: speaking
 * time, messages, voice notes and files. Shared by the mentor's participation
 * section and the mentee's own result, which differ only in the hints.
 */
export function ParticipationStats({
  talkSeconds, messageCount, voiceCount, imageCount, videoCount, fileCount,
  talkHint, messagesHint, className = 'grid grid-cols-2 gap-3',
}: {
  talkSeconds: number;
  messageCount: number;
  voiceCount: number;
  imageCount: number;
  videoCount: number;
  fileCount: number;
  talkHint: string;
  messagesHint: string;
  className?: string;
}) {
  const files = imageCount + videoCount + fileCount;
  return (
    <div className={className}>
      <MetricTile compact tone={0} icon={Clock} label="Speaking time" value={fmtTalk(talkSeconds)} hint={talkHint} />
      <MetricTile compact tone={1} icon={MessageCircle} label="Messages" value={messageCount} hint={messagesHint} />
      <MetricTile compact tone={2} icon={Mic} label="Voice notes" value={voiceCount} hint="Recorded in the chat" />
      <MetricTile
        compact
        tone={3}
        icon={ImageIcon}
        label="Files shared"
        value={files}
        hint={files ? `${imageCount} images, ${videoCount} videos, ${fileCount} other` : 'Images, videos and files'}
      />
    </div>
  );
}
