'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, ExternalLink, FileSpreadsheet, FileText, Loader2, Presentation, X } from 'lucide-react';
import type { MessageAttachment } from '@/lib/types/messaging';
import { useScrollLock } from '@/lib/hooks/useScrollLock';

type Kind = 'pdf' | 'word' | 'excel' | 'powerpoint' | 'text' | 'file';

const extOf = (name: string) => (name.split('.').pop() || '').toLowerCase();

function kindOf(file: MessageAttachment): Kind {
  const type = file.fileType || '';
  const ext = extOf(file.fileName || '');
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (type.includes('wordprocessing') || type === 'application/msword' || ext === 'doc' || ext === 'docx') return 'word';
  if (type.includes('spreadsheet') || type === 'application/vnd.ms-excel' || ext === 'xls' || ext === 'xlsx' || ext === 'csv') return ext === 'csv' ? 'text' : 'excel';
  if (type.includes('presentation') || type === 'application/vnd.ms-powerpoint' || ext === 'ppt' || ext === 'pptx') return 'powerpoint';
  if (type.startsWith('text/') || ext === 'txt') return 'text';
  return 'file';
}

const KIND = {
  pdf: { label: 'PDF', icon: FileText, tone: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-300' },
  word: { label: 'Word', icon: FileText, tone: 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300' },
  excel: { label: 'Excel', icon: FileSpreadsheet, tone: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300' },
  powerpoint: { label: 'PowerPoint', icon: Presentation, tone: 'bg-orange-50 text-orange-600 dark:bg-orange-500/10 dark:text-orange-300' },
  text: { label: 'Text', icon: FileText, tone: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
  file: { label: 'File', icon: FileText, tone: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300' },
} as const;

/** The browser shows these itself; Office files it cannot, so they are opened or downloaded. */
const PREVIEWABLE: Kind[] = ['pdf', 'text'];

function fmtSize(bytes?: number) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * A PDF or text file, opened inside the app the way a chat app opens one: a
 * full-screen viewer with Download and "open in a new tab" at hand.
 *
 * The file is fetched and shown from a local copy with its proper type, so it
 * opens even where its host serves it as a generic download; if that fetch is
 * not allowed, the viewer falls back to the file's own address.
 */
function DocumentViewer({ file, kind, onClose }: { file: MessageAttachment; kind: Kind; onClose: () => void }) {
  useScrollLock();
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let alive = true;
    const type = kind === 'pdf' ? 'application/pdf' : 'text/plain; charset=utf-8';
    fetch(file.fileUrl)
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(new Blob([blob], { type }));
        setSrc(objectUrl);
      })
      .catch(() => { if (alive) setSrc(file.fileUrl); });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.fileUrl, kind]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const action = 'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10';
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-950/95" role="dialog" aria-modal="true" aria-label={file.fileName}>
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-sm font-medium text-white">{file.fileName}</p>
        <a href={file.fileUrl} download={file.fileName} className={action}>
          <Download className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Download</span>
        </a>
        <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" className={action}>
          <ExternalLink className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Open in new tab</span>
        </a>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-300 hover:bg-white/10 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {src ? (
          <iframe src={src} title={file.fileName} className="h-full w-full bg-white" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Opening the file" />
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * A document in a chat bubble: its type, name and size. A PDF or text file
 * opens in the in-app viewer; Word, Excel and PowerPoint open from their link
 * (the browser downloads them, or hands them to the app that reads them).
 */
export function DocumentAttachment({ file, isMine, framed, ignoreTap }: {
  file: MessageAttachment;
  isMine: boolean;
  framed: boolean;
  /** True for the tap that ends a long press: that one opened the reactions. */
  ignoreTap?: () => boolean;
}) {
  const [viewing, setViewing] = useState(false);
  const kind = kindOf(file);
  const meta = KIND[kind];
  const Icon = meta.icon;
  const previewable = PREVIEWABLE.includes(kind);
  const ext = extOf(file.fileName || '').toUpperCase();
  const details = [ext || meta.label, fmtSize(file.fileSizeBytes)].filter(Boolean).join(' · ');

  const cardCls = `flex w-64 max-w-full items-center gap-3 rounded-xl p-2.5 text-left transition-colors ${
    isMine ? 'bg-white/15 hover:bg-white/20' : 'bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10'
  } ${framed ? 'm-1' : ''}`;
  const body = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${isMine ? 'bg-white/20 text-white' : meta.tone}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{file.fileName}</span>
        <span className={`block text-[11px] ${isMine ? 'text-white/75' : 'text-muted-foreground'}`}>
          {details}{previewable ? ' · Tap to open' : ' · Tap to download'}
        </span>
      </span>
    </>
  );

  return (
    <>
      {previewable ? (
        <button type="button" onClick={() => { if (!ignoreTap?.()) setViewing(true); }} className={cardCls} aria-label={`Open ${file.fileName}`}>
          {body}
        </button>
      ) : (
        <a href={file.fileUrl} target="_blank" rel="noopener noreferrer" download={file.fileName} className={cardCls} aria-label={`Download ${file.fileName}`}>
          {body}
        </a>
      )}
      {/* The viewer is portalled, but React still bubbles its events through the
          bubble, whose long press and right click open reactions; stop them here. */}
      {viewing && (
        <span className="contents" onClick={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
          <DocumentViewer file={file} kind={kind} onClose={() => setViewing(false)} />
        </span>
      )}
    </>
  );
}
