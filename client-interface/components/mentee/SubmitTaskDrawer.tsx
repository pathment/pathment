'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Send, Loader2, Link as LinkIcon, ShieldCheck, CheckCircle2, Upload, X, File as FileIcon, Image, FileText } from 'lucide-react';
import { Drawer } from '@/components/shared/Drawer';
import { FileDragDrop } from '@/components/shared/FileDragDrop';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { submissionService } from '@/lib/services/submissionService';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { cleanHtml, isBlankHtml } from '@/lib/utils/html';

// Helper to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

export interface SubmitTaskTarget {
  id: string;
  title: string;
  status?: string;
  deliverable?: string | null;
  acceptanceCriteria?: string[];
}

/**
 * In-context task submission - opens as the shared side Drawer right where the
 * mentee is (no navigating away). Shows the same "what your mentor checks"
 * required/nice-to-have split they'll be graded on, then collects work.
 */
export function SubmitTaskDrawer({
  open,
  task,
  onClose,
  onSubmitted,
}: {
  open: boolean;
  task: SubmitTaskTarget | null;
  onClose: () => void;
  onSubmitted?: () => void;
}) {
  const [description, setDescription] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [timeSpent, setTimeSpent] = useState('');
  const [saving, setSaving] = useState(false);

  const reset = () => { setDescription(''); setLinks(['']); setFiles([]); setTimeSpent(''); };

  const criteria = task?.acceptanceCriteria ?? [];
  const reqCount = Math.ceil(criteria.length * 0.6);
  const required = criteria.slice(0, reqCount);
  const optional = criteria.slice(reqCount);

  const validLinks = links.map((l) => l.trim()).filter(Boolean);
  const canSubmit = !isBlankHtml(description) || validLinks.length > 0 || files.length > 0;
  const isResubmit = task?.status === 'revision_needed';

  const submit = async () => {
    if (!task) return;
    if (!canSubmit) { toast.error('Add a note, a link, or a file before submitting'); return; }
    try {
      setSaving(true);
      await submissionService.submitTask(task.id, {
        submissionText: cleanHtml(description),
        submissionUrls: validLinks,
        files,
        extensionRequested: false,
        timeSpentHours: timeSpent ? parseFloat(timeSpent) : undefined,
      });
      toast.success(isResubmit ? 'Re-submitted - your mentor will take another look' : 'Submitted! Your mentor will review it shortly');
      reset();
      onSubmitted?.();
      onClose();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not submit your work'));
    } finally {
      setSaving(false);
    }
  };

  const field = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <Drawer
      open={open && !!task}
      onClose={onClose}
      title={`${isResubmit ? 'Re-submit' : 'Submit'} · ${task?.title ?? 'Task'}`}
      subtitle="Share your work - link, notes, or files."
      width="md"
      footer={
        <>
          <button onClick={onClose} className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-sm hover:bg-slate-50">Cancel</button>
          <button onClick={submit} disabled={saving || !canSubmit} className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}{isResubmit ? 'Re-submit' : 'Submit'}
          </button>
        </>
      }
    >
      <div className="space-y-5">
        {/* What passes - same bar the mentor grades against */}
        {criteria.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <h3 className="text-sm font-medium text-slate-900 mb-1 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-brand-500" />What your mentor checks</h3>
            <p className="text-xs text-slate-500 mb-2">Required items must be met to pass.</p>
            <ul className="space-y-1.5">
              {required.map((c, i) => (
                <li key={`r-${i}`} className="flex items-start gap-2 text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <span className="text-sm">{c}<span className="ml-1.5 text-[10px] uppercase tracking-wide text-rose-500 font-semibold">required</span></span>
                </li>
              ))}
              {optional.map((c, i) => (
                <li key={`o-${i}`} className="flex items-start gap-2 text-slate-500">
                  <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                  <span className="text-sm">{c}<span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400 font-medium">nice to have</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Notes <span className="text-slate-400 font-normal">(what you did, challenges, learnings)</span></label>
          <RichTextEditor content={description} onChange={setDescription} placeholder="Describe your work, challenges, and what you learned…" minHeight="150px" />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Project links</label>
          <div className="space-y-2">
            {links.map((link, i) => (
              <div key={i} className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                  <input type="url" value={link} onChange={(e) => setLinks((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))}
                    placeholder="https://github.com/you/project" className={`${field} pl-9`} />
                </div>
                {links.length > 1 && (
                  <button type="button" onClick={() => setLinks((prev) => prev.filter((_, j) => j !== i))} className="px-3 text-slate-500 hover:bg-slate-100 rounded-lg text-sm">Remove</button>
                )}
              </div>
            ))}
            <button type="button" onClick={() => setLinks((prev) => [...prev, ''])} className="text-sm text-brand-600 hover:text-brand-700">+ Add another link</button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Files <span className="text-slate-400 font-normal">(optional)</span></label>
          <FileDragDrop
            onFilesSelected={(newFiles) => {
              setFiles((p) => {
                const remainingSlots = 5 - p.length;
                const filesToAdd = newFiles.slice(0, remainingSlots);
                return [...p, ...filesToAdd];
              });
            }}
            multiple={true}
            maxSize={10 * 1024 * 1024}
            enablePaste={true}
            disabled={files.length >= 5}
          >
            {({ isDragging, openFilePicker }) => (
              <div className="space-y-4">
                <div
                  onClick={openFilePicker}
                  className={`
                    border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                    ${isDragging ? 'border-brand-500 bg-brand-50' : 'border-slate-300 hover:border-slate-400'}
                    ${files.length >= 5 ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''}
                  `}
                >
                  <Upload className={`w-12 h-12 mx-auto mb-4 ${isDragging ? 'text-brand-500' : 'text-slate-400'}`} />
                  <p className="text-slate-700 mb-2">
                    {isDragging ? 'Drop files here...' : 'Drag & drop files here, or click to select'}
                  </p>
                  <p className="text-sm text-slate-500">
                    Max 5 files, up to 10MB each
                  </p>
                </div>

                {/* Selected Files List */}
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg"
                      >
                        {file.type.startsWith('image/') ? (
                          <Image className="w-5 h-5 text-blue-600" aria-label="Image file" />
                        ) : file.type === 'application/pdf' ? (
                          <FileText className="w-5 h-5 text-red-600" aria-label="PDF file" />
                        ) : (
                          <FileIcon className="w-5 h-5 text-slate-600" aria-label="File" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-900 truncate">{file.name}</p>
                          <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setFiles((p) => p.filter((_, j) => j !== index))}
                          className="p-1 hover:bg-slate-200 rounded transition-colors"
                          title="Remove file"
                        >
                          <X className="w-4 h-4 text-slate-600" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </FileDragDrop>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Time spent <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="flex items-center gap-2">
            <input type="number" min="0.5" max="200" step="0.5" value={timeSpent} onChange={(e) => setTimeSpent(e.target.value)} placeholder="e.g. 3" className={`${field} w-32`} />
            <span className="text-sm text-slate-500">hours</span>
          </div>
        </div>
      </div>
    </Drawer>
  );
}

export default SubmitTaskDrawer;
