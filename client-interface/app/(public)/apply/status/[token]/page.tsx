'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock, FileUp, Loader2, Upload } from 'lucide-react';
import { toast } from 'sonner';

import { publicApi, type AssessmentAnswer, type PublicAssessmentQuestion } from '@/lib/services/public-api';
import { extractApiErrorMessage } from '@/lib/utils/api-error';

interface StatusData {
  application: { id: string; email: string; firstName?: string; lastName?: string; status: string; assessmentSubmittedAt?: string; createdAt: string };
  program: { id: string; name: string } | null;
  cohort: { id: string; name: string } | null;
  assessment: { id: string; title: string; description?: string; instructions?: string; required: boolean; questions: PublicAssessmentQuestion[] } | null;
  submission: { status: string; submittedAt?: string } | null;
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Received', cls: 'bg-slate-100 text-slate-700' },
  assessment_sent: { label: 'Assessment pending', cls: 'bg-amber-100 text-amber-800' },
  under_review: { label: 'Under review', cls: 'bg-brand-50 text-brand-700' },
  accepted: { label: 'Accepted 🎉', cls: 'bg-emerald-100 text-emerald-800' },
  rejected: { label: 'Not selected', cls: 'bg-rose-100 text-rose-700' },
  waitlisted: { label: 'Waitlisted', cls: 'bg-violet-100 text-violet-700' },
};

export default function ApplicationStatusPage() {
  const params = useParams();
  const token = decodeURIComponent(String(params?.token || ''));

  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, AssessmentAnswer>>({});
  const [submitting, setSubmitting] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    publicApi
      .getStatus(token)
      .then((d) => setData(d))
      .catch((e) => setError(extractApiErrorMessage(e, 'This link is not valid or has expired.')))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => { if (token) load(); }, [token, load]);

  const setAnswer = (qId: string, patch: AssessmentAnswer) =>
    setAnswers((prev) => ({ ...prev, [qId]: { ...prev[qId], ...patch } }));

  const toggleOption = (q: PublicAssessmentQuestion, optId: string) => {
    setAnswers((prev) => {
      const current = prev[q.id]?.optionIds || [];
      if (q.type === 'mcq') return { ...prev, [q.id]: { optionIds: [optId] } };
      const next = current.includes(optId) ? current.filter((x) => x !== optId) : [...current, optId];
      return { ...prev, [q.id]: { optionIds: next } };
    });
  };

  const handleUpload = async (qId: string, file: File) => {
    setUploadingId(qId);
    try {
      const res = await publicApi.uploadFile(token, file);
      setAnswer(qId, { fileUrl: res.url, fileName: res.fileName });
      toast.success('File uploaded');
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Upload failed'));
    } finally {
      setUploadingId(null);
    }
  };

  const handleSubmitAssessment = async () => {
    setSubmitting(true);
    try {
      await publicApi.submitAssessment(token, answers);
      toast.success('Assessment submitted');
      load();
    } catch (e) {
      toast.error(extractApiErrorMessage(e, 'Could not submit your assessment'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div className="py-24 flex justify-center"><Loader2 className="w-7 h-7 animate-spin text-brand-600" /></div>;

  if (error || !data) {
    return (
      <div className="max-w-xl mx-auto px-4 py-20 text-center">
        <p className="text-slate-600">{error || 'Application not found.'}</p>
        <Link href="/programs" className="mt-4 inline-flex items-center gap-1 text-brand-700 font-medium">
          <ArrowLeft className="w-4 h-4" /> Browse programs
        </Link>
      </div>
    );
  }

  const { application, program, assessment, submission } = data;
  const meta = STATUS_META[application.status] || STATUS_META.pending;
  const assessmentDone = Boolean(submission && submission.status !== 'in_progress');
  const showRunner = assessment && !assessmentDone;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-2xl font-semibold text-slate-900">Your application</h1>
      <p className="mt-1 text-slate-600">{program?.name}{data.cohort ? ` · ${data.cohort.name}` : ''}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-500">Status</p>
            <span className={`mt-1 inline-block text-sm font-medium rounded-full px-3 py-1 ${meta.cls}`}>{meta.label}</span>
          </div>
          <div className="text-right text-sm text-slate-500">
            <p>{application.firstName} {application.lastName}</p>
            <p>{application.email}</p>
          </div>
        </div>
        {assessmentDone && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-emerald-700">
            <CheckCircle2 className="w-4 h-4" /> Assessment submitted{submission?.submittedAt ? ` on ${new Date(submission.submittedAt).toLocaleDateString()}` : ''}.
          </p>
        )}
      </div>

      {showRunner && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-card p-6">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-brand-600" />
            <h2 className="font-semibold text-slate-900">{assessment!.title}</h2>
          </div>
          {assessment!.description && <p className="mt-2 text-sm text-slate-600">{assessment!.description}</p>}
          {assessment!.instructions && (
            <p className="mt-2 text-sm text-slate-500 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">{assessment!.instructions}</p>
          )}

          <div className="mt-6 space-y-6">
            {assessment!.questions.map((q, idx) => (
              <div key={q.id}>
                <p className="font-medium text-slate-800">
                  <span className="text-slate-400 mr-1">{idx + 1}.</span>{q.prompt}
                  {q.required && <span className="text-rose-500"> *</span>}
                </p>

                <div className="mt-2">
                  {(q.type === 'mcq' || q.type === 'multi_select') && (
                    <div className="space-y-2">
                      {q.options.map((opt) => {
                        const checked = (answers[q.id]?.optionIds || []).includes(opt.id);
                        return (
                          <label key={opt.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 cursor-pointer text-sm ${checked ? 'border-brand-400 bg-brand-50 dark:bg-brand-500/15' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <input
                              type={q.type === 'mcq' ? 'radio' : 'checkbox'}
                              name={q.id}
                              checked={checked}
                              onChange={() => toggleOption(q, opt.id)}
                              className="accent-brand-600"
                            />
                            {opt.label}
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {q.type === 'short_text' && (
                    <input
                      value={answers[q.id]?.text || ''}
                      onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                    />
                  )}

                  {q.type === 'long_text' && (
                    <textarea
                      rows={4}
                      value={answers[q.id]?.text || ''}
                      onChange={(e) => setAnswer(q.id, { text: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                    />
                  )}

                  {q.type === 'external_link' && (
                    <input
                      type="url"
                      placeholder="https://…"
                      value={answers[q.id]?.link || ''}
                      onChange={(e) => setAnswer(q.id, { link: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-card"
                    />
                  )}

                  {q.type === 'file_upload' && (
                    <div>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50">
                        {uploadingId === q.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                        {answers[q.id]?.fileName ? 'Replace file' : 'Upload file'}
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(q.id, f); }}
                        />
                      </label>
                      {answers[q.id]?.fileName && (
                        <p className="mt-2 inline-flex items-center gap-1.5 text-sm text-slate-600">
                          <FileUp className="w-4 h-4 text-brand-600" /> {answers[q.id]?.fileName}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleSubmitAssessment}
            disabled={submitting}
            className="mt-8 w-full h-11 bg-brand-600 hover:bg-brand-700 text-white rounded-lg font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            Submit assessment
          </button>
          <p className="mt-2 text-center text-xs text-slate-400">You can only submit once — review your answers first.</p>
        </div>
      )}
    </div>
  );
}
