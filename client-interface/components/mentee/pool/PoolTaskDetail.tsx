'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle2, ExternalLink, FileText, Loader2, Paperclip, Plus, RotateCcw, Send, X } from 'lucide-react';
import { qk, useApiQuery, useInvalidate } from '@/lib/query';
import { StatusBadge } from '@/components/admin/ui';
import { RichContent } from '@/components/shared/RichContent';
import { candidateApi } from '@/lib/services/pool-api';
import { workspacePath } from '@/lib/services/workspace-scope';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { CourseProgressCard } from '@/components/shared/CourseProgressCard';
import { POOL_WORK_STATUS, poolField as field } from './poolUi';

/**
 * One piece of qualifying work, in the learner workspace.
 *
 * The clan task screen next door cannot serve this: pool work is excluded
 * from every ordinary task query by the `AssignedTask` default scope (that
 * fence is what keeps a round out of a clan's screens), so it is read through
 * the candidate's own endpoint. The chrome, the wording and the submit flow
 * are the mentee ones, so it does not read as a different product.
 */
export function PoolTaskDetail({ id }: { id: string }) {
  const invalidate = useInvalidate();
  const { data: task, loading, error, refetch } = useApiQuery({
    queryKey: qk.candidate.task(id),
    queryFn: () => candidateApi.task(id),
    errorMessage: 'Could not load this work',
  });
  const [text, setText] = useState('');
  const [urls, setUrls] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const started = useRef(false);

  // Opening the work marks it started (assigned → in progress), once.
  useEffect(() => {
    if (!task || started.current || task.readOnly) return;
    if (['assigned', 'not_started'].includes(task.status) && task.kind === 'task') {
      started.current = true;
      candidateApi.start(id).then(() => invalidate(qk.candidate.all)).catch(() => {});
    }
  }, [task, id, invalidate]);

  if (loading) return <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-brand-600" /></div>;
  if (error || !task) return <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || 'Not found'}</p>;

  const latest = task.submissions[0];
  const latestFeedback = latest?.feedback?.[0];
  const canSubmit = task.kind === 'task' && !task.readOnly && ['assigned', 'not_started', 'in_progress', 'revision_needed'].includes(task.status);

  const submit = async () => {
    const links = urls.map((u) => u.trim()).filter(Boolean);
    if (!text.trim() && !links.length && !files.length) {
      toast.error('Add a note, a link or a file before handing in');
      return;
    }
    const form = new FormData();
    form.append('submissionText', text.trim());
    links.forEach((u) => form.append('submissionUrls[]', u));
    files.forEach((f) => form.append('files', f));
    setSending(true);
    try {
      await candidateApi.submit(id, form);
      toast.success('Handed in. A reviewer will look at it.');
      setText(''); setUrls(['']); setFiles([]);
      await refetch();
      invalidate(qk.candidate.all);
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not hand this in'));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <Link href={workspacePath('/mentee/tasks')} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
        <ArrowLeft className="h-4 w-4" /> Your qualifying work
      </Link>

      <div className="mentee-page-heading">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-brand-600">{task.pool?.name}</p>
            <h1 className="mt-1 text-2xl text-slate-900">{task.title}</h1>
            <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-slate-500">
              <span className="capitalize">{task.kind === 'task' ? task.type.replace('_', ' ') : task.kind}</span>
              {!task.required && <><span className="text-slate-300">·</span><span>Optional</span></>}
              {task.dueDate && (
                <><span className="text-slate-300">·</span><span>Due {new Date(task.dueDate).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span></>
              )}
            </p>
          </div>
          <StatusBadge status={task.status} config={POOL_WORK_STATUS} />
        </div>
        {/* The brief is written in the rich-text editor; old plain-text briefs render as before. */}
        {task.description && <RichContent html={task.description} className="mt-4 text-slate-700" />}
        {task.deliverable && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-900">What to hand in</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">{task.deliverable}</p>
          </div>
        )}
        {task.acceptanceCriteria?.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-slate-900">It is reviewed against</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-slate-600">
              {task.acceptanceCriteria.map((c, i) => <li key={i}>{c}</li>)}
            </ul>
          </div>
        )}
        {task.resources?.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {task.resources.map((r) => (
              <a key={r.id} href={r.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-brand-700 hover:bg-brand-50">
                <ExternalLink className="h-3.5 w-3.5" /> {r.title}
              </a>
            ))}
          </div>
        )}

        {/* Studied on Edorax: where it is, how far along, and the way in. */}
        {task.kind === 'course' && task.status !== 'cancelled' && (
          <div className="mt-6"><CourseProgressCard taskId={task.id} viewer="mentee" onTaskStatusChange={refetch} /></div>
        )}

        {(task.kind === 'quiz' || task.kind === 'interview') && !task.readOnly && !['submitted', 'completed'].includes(task.status) && (
          <Link
            href={workspacePath(`/mentee/${task.kind === 'quiz' ? 'quizzes' : 'interviews'}/${task.id}`)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
          >
            {task.status === 'in_progress' ? 'Continue' : 'Start'} the {task.kind}
          </Link>
        )}
      </div>

      {task.status === 'submitted' && (
        <p className="flex items-center gap-2 rounded-2xl border border-purple-200 bg-purple-50 px-5 py-4 text-sm text-purple-800">
          <Send className="h-4 w-4" /> Handed in. It is waiting for a reviewer.
        </p>
      )}
      {task.status === 'completed' && (
        <p className="flex items-center gap-2 rounded-2xl border border-green-200 bg-green-50 px-5 py-4 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" /> Approved.
        </p>
      )}
      {task.status === 'revision_needed' && latestFeedback && (
        <div className="rounded-2xl border border-orange-200 bg-orange-50 px-5 py-4 text-sm text-orange-800">
          <p className="flex items-center gap-2 font-medium"><RotateCcw className="h-4 w-4" /> Changes requested</p>
          {(latestFeedback.revisionNotes || latestFeedback.feedbackText) && (
            <p className="mt-1 whitespace-pre-wrap">{latestFeedback.revisionNotes || latestFeedback.feedbackText}</p>
          )}
        </div>
      )}

      {canSubmit && (
        <div className="mentee-page-heading">
          <h2 className="text-base font-semibold text-slate-900">{task.status === 'revision_needed' ? 'Hand in again' : 'Hand in your work'}</h2>
          <div className="mt-4 space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Notes</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={5} className={field} placeholder="What you did, and anything the reviewer should know" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Links</label>
              <div className="space-y-2">
                {urls.map((u, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={u} onChange={(e) => setUrls(urls.map((x, j) => (j === i ? e.target.value : x)))} className={field} placeholder="https://github.com/…" />
                    {urls.length > 1 && (
                      <button onClick={() => setUrls(urls.filter((_, j) => j !== i))} className="rounded-lg px-2 text-slate-400 hover:bg-slate-50" aria-label="Remove link"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
                {urls.length < 10 && (
                  <button onClick={() => setUrls([...urls, ''])} className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><Plus className="h-3.5 w-3.5" /> Add a link</button>
                )}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Files <span className="font-normal text-slate-400">(up to 5, 10 MB each)</span></label>
              <input
                type="file"
                multiple
                onChange={(e) => setFiles(Array.from(e.target.files || []).slice(0, 5))}
                className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-slate-200"
              />
              {files.length > 0 && (
                <ul className="mt-2 space-y-1 text-sm text-slate-600">
                  {files.map((f) => <li key={f.name} className="flex items-center gap-1.5"><Paperclip className="h-3.5 w-3.5" /> {f.name}</li>)}
                </ul>
              )}
            </div>
            <button onClick={submit} disabled={sending} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-brand-400">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Hand in
            </button>
          </div>
        </div>
      )}

      {task.submissions.length > 0 && (
        <div className="mentee-page-heading">
          <h2 className="text-base font-semibold text-slate-900">History</h2>
          <ol className="mt-4 space-y-4">
            {task.submissions.map((s) => (
              <li key={s.id} className="rounded-2xl border border-slate-100 bg-slate-50/50 p-4">
                <p className="text-xs text-slate-400">Version {s.version} · {new Date(s.submittedAt).toLocaleString()}</p>
                {s.submissionText && <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{s.submissionText}</p>}
                {(s.submissionUrls?.length > 0 || s.files?.length > 0) && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {s.submissionUrls?.map((u) => (
                      <a key={u} href={u} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><ExternalLink className="h-3.5 w-3.5" /> {u}</a>
                    ))}
                    {s.files?.map((f) => (
                      <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline"><FileText className="h-3.5 w-3.5" /> {f.fileName}</a>
                    ))}
                  </div>
                )}
                {s.feedback?.map((f) => (
                  <div key={f.id} className={`mt-3 rounded-lg px-3 py-2 text-sm ${f.isApproved ? 'bg-green-50 text-green-800' : 'bg-orange-50 text-orange-800'}`}>
                    <p className="font-medium">{f.isApproved ? 'Approved' : 'Changes requested'}</p>
                    {f.feedbackText && <p className="mt-0.5 whitespace-pre-wrap">{f.feedbackText}</p>}
                    {f.revisionNotes && f.revisionNotes !== f.feedbackText && <p className="mt-0.5 whitespace-pre-wrap">{f.revisionNotes}</p>}
                  </div>
                ))}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
