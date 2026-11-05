'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Paperclip, Square } from 'lucide-react';
import { toast } from 'sonner';
import { VoiceRecorder, recorderSupported } from '@/lib/utils/interviewMedia';

const BUTTON = 'h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-slate-200/70 hover:text-foreground dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

/** What the group chat takes: pictures, clips, and the usual documents. Matches the server. */
const ACCEPT = [
  'image/*', 'video/*',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain', 'text/csv',
].join(',');
const MAX_BYTES = 25 * 1024 * 1024;
/** Documents are stored as Cloudinary raw files, which are capped at 10MB. */
const DOC_MAX_BYTES = 10 * 1024 * 1024;

/**
 * Attach an image, video or document, or record a voice note. Sits in the composer's
 * `leading` slot, so a chat that does not want files never loads any of this.
 */
export function MediaButtons({ onFile, disabled = false }: {
  onFile: (file: File) => Promise<void>;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<VoiceRecorder | null>(null);
  const [recording, setRecording] = useState(false);
  const [uploading, setUploading] = useState(false);

  // Leaving the page mid-recording must not leave the microphone on.
  useEffect(() => () => { recorderRef.current?.stop(); }, []);

  const send = async (file: File) => {
    setUploading(true);
    try {
      await onFile(file);
    } finally {
      setUploading(false);
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      const blob = await recorderRef.current?.stop();
      recorderRef.current = null;
      setRecording(false);
      if (blob) await send(new File([blob], `voice-note-${Date.now()}.webm`, { type: 'audio/webm' }));
      return;
    }
    const recorder = new VoiceRecorder();
    if (!await recorder.start()) {
      toast.error('Could not use the microphone. Check that the browser has permission.');
      return;
    }
    recorderRef.current = recorder;
    setRecording(true);
  };

  const busy = disabled || uploading;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (!file) return;
          // Said here, before a long upload that the server would refuse anyway.
          const isMedia = /^(image|video)\//.test(file.type);
          if (!isMedia && file.size > DOC_MAX_BYTES) { toast.error(`"${file.name}" is over 10MB. Documents can be up to 10MB.`); return; }
          if (file.size > MAX_BYTES) { toast.error(`"${file.name}" is over 25MB. Send a smaller one.`); return; }
          send(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || recording}
        className={BUTTON}
        aria-label="Attach a photo, video or document"
        title="Attach a photo or video (up to 25MB), or a PDF, Word, Excel, PowerPoint or text file (up to 10MB)"
      >
        {uploading ? <Loader2 className="w-4 h-4 animate-spin text-brand-600" /> : <Paperclip className="w-4 h-4" />}
      </button>
      {recorderSupported() && (
        <button
          type="button"
          onClick={toggleRecording}
          disabled={busy}
          className={recording ? `${BUTTON} !bg-red-600 !text-white animate-pulse` : BUTTON}
          aria-label={recording ? 'Stop and send the voice note' : 'Record a voice note'}
          title={recording ? 'Stop and send' : 'Record a voice note'}
        >
          {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
        </button>
      )}
    </>
  );
}
