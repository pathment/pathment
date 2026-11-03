'use client';

import { useState } from 'react';
import { Download, FileText } from 'lucide-react';
import { formatFileSize } from '@/lib/utils/formatting';
import { isImageFile, isVideoFile } from '@/lib/utils/file-type';
import { ImageLightbox } from '@/components/shared/ImageLightbox';
import { VideoCard, useVideoPlayer } from '@/components/shared/VideoPlayerModal';
import type { SubmissionFile } from '@/lib/types/submission';

interface SubmissionFileListProps {
  files: SubmissionFile[];
}

/**
 * Renders a submission's attached files.
 *
 * - Images render inline with a click-to-zoom lightbox (plus download).
 * - Videos show their first frame and play in the video player (full screen,
 *   download), so a recorded presentation is watched where it is reviewed.
 * - Everything else renders as an icon row with a download link.
 *
 * Open/closed: rendering per file kind is delegated so new kinds (video, pdf
 * previews, …) can be added without touching the list itself.
 */
export function SubmissionFileList({ files }: SubmissionFileListProps) {
  const images = files.filter((file) => isImageFile(file.fileType));
  const [zoomIndex, setZoomIndex] = useState<number | null>(null);
  const { play, player } = useVideoPlayer();

  const renderVideo = (file: SubmissionFile) => (
    <VideoCard
      key={file.id}
      title={file.fileName}
      subtitle={Number(file.fileSizeBytes) > 0 ? formatFileSize(Number(file.fileSizeBytes)) : null}
      url={file.fileUrl}
      downloadUrl={file.fileUrl}
      direct
      onPlay={() => play({ title: file.fileName, url: file.fileUrl, downloadUrl: file.fileUrl, direct: true })}
    />
  );

  const renderImage = (file: SubmissionFile) => (
    <div
      key={file.id}
      className="rounded-lg border border-slate-200 overflow-hidden bg-slate-50 w-24"
    >
      <button
        type="button"
        onClick={() => setZoomIndex(images.findIndex((f) => f.id === file.id))}
        className="block w-full group cursor-zoom-in"
        title="Click to zoom"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={file.fileUrl}
          alt={file.fileName}
          className="w-full h-20 object-cover bg-slate-100 group-hover:opacity-95 transition-opacity"
        />
      </button>
      <div className="flex items-center justify-between gap-1 px-2 py-1.5 bg-card">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="min-w-0">
            <p className="text-xs text-slate-900 truncate">{file.fileName}</p>
            {Number(file.fileSizeBytes) > 0 && (
              <p className="text-[11px] text-slate-500">{formatFileSize(Number(file.fileSizeBytes))}</p>
            )}
          </div>
        </div>
        <a
          href={file.fileUrl}
          download
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 hover:bg-slate-200 rounded transition-colors shrink-0"
          title="Download"
        >
          <Download className="w-3.5 h-3.5 text-slate-600" />
        </a>
      </div>
    </div>
  );

  const renderOther = (file: SubmissionFile) => (
    <div
      key={file.id}
      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg"
    >
      <div className="flex items-center gap-3 min-w-0">
        <FileText className="w-5 h-5 text-slate-600 shrink-0" />
        <div className="min-w-0">
          <p className="text-sm text-slate-900 truncate">{file.fileName}</p>
          {Number(file.fileSizeBytes) > 0 && (
            <p className="text-xs text-slate-500">{formatFileSize(Number(file.fileSizeBytes))}</p>
          )}
        </div>
      </div>
      <a
        href={file.fileUrl}
        download
        target="_blank"
        rel="noopener noreferrer"
        className="p-2 hover:bg-slate-200 rounded transition-colors shrink-0"
        title="Download"
      >
        <Download className="w-4 h-4 text-slate-600" />
      </a>
    </div>
  );

  if (files.length === 0) return null;

  const zoomed = zoomIndex !== null ? images[zoomIndex] : null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {files.map((file) => (
          isImageFile(file.fileType) ? renderImage(file)
            : isVideoFile(file.fileType, file.fileName) ? renderVideo(file)
              : renderOther(file)
        ))}
      </div>

      {zoomed && zoomIndex !== null && (
        <ImageLightbox
          file={zoomed}
          open
          onOpenChange={(open) => !open && setZoomIndex(null)}
          onPrev={() => setZoomIndex((i) => (i === null ? i : Math.max(0, i - 1)))}
          onNext={() => setZoomIndex((i) => (i === null ? i : Math.min(images.length - 1, i + 1)))}
          canPrev={zoomIndex > 0}
          canNext={zoomIndex < images.length - 1}
          positionLabel={`${zoomIndex + 1} / ${images.length}`}
        />
      )}

      {player}
    </>
  );
}