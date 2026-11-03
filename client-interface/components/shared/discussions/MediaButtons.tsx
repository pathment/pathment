'use client';

import { useEffect, useRef, useState } from 'react';
import { Loader2, Mic, Paperclip, Square } from 'lucide-react';
import { toast } from 'sonner';
import { VoiceRecorder, recorderSupported } from '@/lib/utils/interviewMedia';

const BUTTON = 'h-9 w-9 md:h-10 md:w-10 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-slate-200/70 hover:text-foreground dark:hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';

/**
 * Attach an image or video, or record a voice note. Sits in the composer's
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
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) send(file);
        }}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy || recording}
        className={BUTTON}
        aria-label="Attach an image or video"
        title="Attach an image or video (up to 25MB)"
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
