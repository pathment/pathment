'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ChevronLeft, ChevronRight, Download, X } from 'lucide-react';
import { Dialog, DialogClose, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog';
import { MEDIA_HEADER_BUTTON } from '@/components/shared/VideoPlayerModal';
import { downloadHref } from '@/lib/utils/url';
import type { SubmissionFile } from '@/lib/types/submission';

interface ImageLightboxProps {
  file: SubmissionFile;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Move to the previous image in the submission. */
  onPrev?: () => void;
  /** Move to the next image in the submission. */
  onNext?: () => void;
  /** Hide/disable the previous arrow (first image). */
  canPrev?: boolean;
  /** Hide/disable the next arrow (last image). */
  canNext?: boolean;
  /** Position indicator, e.g. "2 / 5". */
  positionLabel?: string;
}

const ARROW = 'absolute top-1/2 z-10 -translate-y-1/2 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 disabled:opacity-0 disabled:pointer-events-none transition-opacity';

/**
 * Full-size viewer for an image (a submission's, or one sent in a chat).
 * Fully controlled: the parent owns the open state and current image, and
 * supplies the arrows' callbacks. It looks like the video player - the same
 * dark panel, header and buttons - so the two read as one viewer.
 */
export function ImageLightbox({
  file,
  open,
  onOpenChange,
  onPrev,
  onNext,
  canPrev = true,
  canNext = true,
  positionLabel,
}: ImageLightboxProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay className="bg-black/80 backdrop-blur-xs" />
        {/* The dialog's parts rather than DialogContent, which brings its own close button. */}
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 flex w-[calc(100%-2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl outline-none duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-800 bg-slate-950/60 px-5 py-3.5">
            <div className="min-w-0">
              <DialogTitle className="truncate text-base font-semibold text-white">{file.fileName}</DialogTitle>
              <DialogDescription className={positionLabel ? 'text-xs text-slate-400' : 'sr-only'}>
                {positionLabel ?? `Preview of ${file.fileName}`}
              </DialogDescription>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <a href={downloadHref(file.fileUrl)} download className={MEDIA_HEADER_BUTTON} title="Download">
                <Download className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Download</span>
              </a>
              <DialogClose
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
                aria-label="Close image"
              >
                <X className="h-5 w-5" />
              </DialogClose>
            </div>
          </div>

          <div className="relative flex min-h-[40vh] items-center justify-center bg-black p-4">
            {onPrev && (
              <button type="button" onClick={onPrev} disabled={!canPrev} aria-label="Previous image" className={`${ARROW} left-3`}>
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={file.fileUrl} alt={file.fileName} className="max-h-[72vh] max-w-full rounded-lg object-contain" />

            {onNext && (
              <button type="button" onClick={onNext} disabled={!canNext} aria-label="Next image" className={`${ARROW} right-3`}>
                <ChevronRight className="h-6 w-6" />
              </button>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
