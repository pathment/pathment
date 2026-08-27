'use client';

import { useState, use, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link as LinkIcon,
  Send,
  CheckCircle2,
  Calendar,
  Clock,
  AlertCircle,
  ShieldCheck,
  Upload,
  X,
  File as FileIcon,
  Image,
  FileText
} from 'lucide-react';
import RichTextEditor from '@/components/shared/RichTextEditor';
import { FileDragDrop } from '@/components/shared/FileDragDrop';

const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};
import { ResourceLink } from '@/components/shared/ResourceLink';
import { submissionService } from '@/lib/services/submissionService';
import { useTaskDetail } from '@/lib/hooks/mentee';
import { PageHeader } from '@/components/admin/ui';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { looksLikeHtml } from '@/lib/utils/html';
import { useActivityTracker } from '@/lib/hooks/shared/useActivityTracker';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TaskSubmission({ params }: PageProps) {
  const resolvedParams = use(params);
  const router = useRouter();

  const { task, loading, error: taskError } = useTaskDetail(resolvedParams.id);
  const { trackEvent } = useActivityTracker();

  const [submissionText, setSubmissionText] = useState('');
  const [links, setLinks] = useState<string[]>(['']);
  const [files, setFiles] = useState<File[]>([]);
  const [timeSpentHours, setTimeSpentHours] = useState<string>('');
  const [showSuccess, setShowSuccess] = useState(false);
  const [showExtensionForm, setShowExtensionForm] = useState(false);
  const [extensionDays, setExtensionDays] = useState(3);
  const [extensionReason, setExtensionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // If task is completed or cancelled, redirect to the details page
  useEffect(() => {
    if (task && ['completed', 'cancelled', 'submitted'].includes(task.status)) {
      router.replace(`/mentee/tasks/${resolvedParams.id}`);
    }
  }, [task, resolvedParams.id, router]);

  // Interview / quiz tasks are done in their own runner and must NEVER accept a
  // generic "Submit Work" submission (that produced stray text submissions on
  // interview tasks). Bounce them into the right runner regardless of status.
  const taskType = task?.roadmapTask?.type || task?.type;
  useEffect(() => {
    if (taskType === 'interview') router.replace(`/mentee/interviews/${resolvedParams.id}`);
    else if (taskType === 'quiz') router.replace(`/mentee/quizzes/${resolvedParams.id}`);
  }, [taskType, resolvedParams.id, router]);

  const addLink = () => {
    setLinks([...links, '']);
  };

  const updateLink = (index: number, value: string) => {
    const newLinks = [...links];
    newLinks[index] = value;
    setLinks(newLinks);
  };

  const removeLink = (index: number) => {
    setLinks(links.filter((_, i) => i !== index));
  };

  const handleFilesAdded = (newFiles: File[]) => {
    setFiles([...files, ...newFiles]);
  };

  const handleFileRemoved = (index: number) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!submissionText.trim()) {
      setError('Please provide a description of your work');
      return;
    }

    setIsSubmitting(true);

    try {
      const validLinks = links.filter(link => link.trim() !== '');
      
      await submissionService.submitTask(resolvedParams.id, {
        submissionText,
        submissionUrls: validLinks,
        files,
        extensionRequested: false,
        timeSpentHours: timeSpentHours ? parseFloat(timeSpentHours) : undefined,
      });

      trackEvent('submission_completed', {
        eventCategory: 'submission',
        entityType: 'task',
        entityId: resolvedParams.id,
      });

      setShowSuccess(true);
      setTimeout(() => router.push('/mentee/tasks'), 2000);
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Could not submit task'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleExtensionRequest = async () => {
    if (!extensionReason.trim()) {
      setError('Please provide a reason for the extension');
      return;
    }

    setIsSubmitting(true);
    setError('');

    try {
      await submissionService.requestExtension(resolvedParams.id, {
        reason: extensionReason,
        days: extensionDays
      });

      trackEvent('extension_requested', {
        eventCategory: 'task',
        entityType: 'task',
        entityId: resolvedParams.id,
      });

      setShowSuccess(true);
      setTimeout(() => router.push('/mentee/tasks'), 2000);
    } catch (err: unknown) {
      setError(extractApiErrorMessage(err, 'Could not request extension'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-xl">
        <p className="text-red-900">{taskError || 'Task not found'}</p>
      </div>
    );
  }

  const daysUntilDue = Math.ceil(
    (new Date(task.dueDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysUntilDue < 0 && !['completed', 'submitted'].includes(task.status);

  // Get task details from roadmapTask or custom task fields
  const taskTitle = task.roadmapTask?.title || task.title;
  const taskDescription = task.roadmapTask?.description || task.description;
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];

  // The most recent mentor feedback (across versions) so a re-submitting mentee
  // sees exactly what was requested. The API returns feedback with the real
  // TaskFeedback shape: feedbackText / revisionNotes / decision.
  const latestFeedback = (task.submissions || [])
    .flatMap((s: { feedback?: { createdAt?: string }[] }) => s.feedback || [])
    .sort((a: { createdAt?: string }, b: { createdAt?: string }) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())[0] as
      | { feedbackText?: string; revisionNotes?: string; decision?: string; isApproved?: boolean }
      | undefined;
  const showRevisionBanner = task.status === 'revision_needed' && !!latestFeedback;
  const revisionText = latestFeedback?.revisionNotes?.trim() || latestFeedback?.feedbackText?.trim() || '';

  return (
    <div className="space-y-6">
      {/* Header */}
      <PageHeader backHref="/mentee/tasks" backLabel="Back to Tasks" />

      {/* Success Message */}
      {showSuccess && (
        <div role="status" className="p-4 bg-green-50 border border-green-200 rounded-xl flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-green-900">
              {showExtensionForm ? 'Extension request submitted!' : 'Task submitted successfully!'}
            </p>
            <p className="text-green-700 text-sm mt-1">
              {showExtensionForm ? 'Your mentor will review your request.' : 'Your mentor will review it shortly.'}
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div role="alert" className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <p className="text-red-900">{error}</p>
        </div>
      )}

      {/* Changes requested — what the mentee must address before re-submitting */}
      {showRevisionBanner && revisionText && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">Your mentor asked for changes</p>
            <p className="text-sm text-amber-800 mt-1 whitespace-pre-wrap">{revisionText}</p>
            <p className="text-xs text-amber-700 mt-2">Address these, then re-submit below.</p>
          </div>
        </div>
      )}

      {/* Task Details */}
      <div className="bg-card rounded-2xl border border-slate-200 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl text-slate-900">{taskTitle}</h1>
              {task.isCustomTask && (
                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Custom</span>
              )}
              <span className={`px-2 py-1 text-xs rounded ${
                task.difficulty === 'beginner' ? 'bg-green-100 text-green-700' :
                task.difficulty === 'intermediate' ? 'bg-yellow-100 text-yellow-700' :
                'bg-red-100 text-red-700'
              }`}>
                {task.difficulty}
              </span>
            </div>
            {taskDescription && (looksLikeHtml(taskDescription)
              ? <div className="prose prose-sm max-w-none dark:prose-invert text-slate-600 dark:text-slate-300" dangerouslySetInnerHTML={{ __html: taskDescription }} />
              : <p className="text-slate-600 whitespace-pre-wrap">{taskDescription}</p>)}
            {taskDeliverable && (
              <div className="mt-3 p-3 bg-brand-50 dark:bg-brand-500/10 border border-brand-200 dark:border-brand-500/20 rounded-lg">
                <p className="text-sm text-brand-900"><strong>Deliverable:</strong> {taskDeliverable}</p>
              </div>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
            isOverdue 
              ? 'bg-red-100 text-red-700'
              : daysUntilDue <= 2
              ? 'bg-orange-100 text-orange-700'
              : 'bg-brand-100 text-brand-700'
          }`}>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {isOverdue ? 'Overdue' : `${daysUntilDue} days left`}
            </div>
          </div>
        </div>

        {acceptanceCriteria.length > 0 && (() => {
          const reqCount = Math.ceil(acceptanceCriteria.length * 0.6);
          const required = acceptanceCriteria.slice(0, reqCount);
          const optional = acceptanceCriteria.slice(reqCount);
          return (
            <div className="mt-6">
              <h3 className="text-sm font-medium text-slate-900 mb-1 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-brand-500" />What your mentor checks</h3>
              <p className="text-xs text-slate-500 mb-3">Required items must be met to pass. The rest make your work stronger.</p>
              <ul className="space-y-2">
                {required.map((criterion: string, index: number) => (
                  <li key={`r-${index}`} className="flex items-start gap-2 text-slate-700">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-sm">{criterion}<span className="ml-1.5 text-[10px] uppercase tracking-wide text-rose-500 font-semibold">required</span></span>
                  </li>
                ))}
              </ul>
              {optional.length > 0 && (
                <ul className="space-y-2 mt-2">
                  {optional.map((criterion: string, index: number) => (
                    <li key={`o-${index}`} className="flex items-start gap-2 text-slate-500">
                      <CheckCircle2 className="w-4 h-4 text-slate-300 shrink-0 mt-0.5" />
                      <span className="text-sm">{criterion}<span className="ml-1.5 text-[10px] uppercase tracking-wide text-slate-400 font-medium">nice to have</span></span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {resources.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-slate-900 mb-3">Learning Resources</h3>
            <ul className="space-y-2">
              {resources.map((resource: { id: string; url: string; title?: string; type?: string }) => (
                <ResourceLink key={resource.id} url={resource.url} title={resource.title} />
              ))}
            </ul>
          </div>
        )}
      </div>

      {!showExtensionForm ? (
        <>
          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-slate-200 p-6 space-y-6">
            <div>
              <h2 className="text-xl text-slate-900 mb-4">Submit Your Work</h2>
              
              {/* Rich Text Editor */}
              <div className="mb-6">
                <label className="block text-sm text-slate-700 mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <RichTextEditor
                  content={submissionText}
                  onChange={setSubmissionText}
                  placeholder="Describe your work, challenges faced, and what you learned..."
                  minHeight="250px"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Provide a detailed explanation of your implementation, challenges, and learnings
                </p>
              </div>

              {/* Links */}
              <div className="mb-6">
                <label className="block text-sm text-slate-700 mb-2">
                  Project Links
                </label>
                <div className="space-y-3">
                  {links.map((link, index) => (
                    <div key={index} className="flex gap-2">
                      <div className="flex-1 relative">
                        <LinkIcon className="absolute left-3 top-3 w-5 h-5 text-slate-400" />
                        <input
                          type="url"
                          value={link}
                          onChange={(e) => updateLink(index, e.target.value)}
                          placeholder="https://github.com/username/project"
                          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                        />
                      </div>
                      {links.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeLink(index)}
                          className="px-3 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={addLink}
                    className="text-sm text-brand-600 hover:text-brand-700"
                  >
                    + Add another link
                  </button>
                </div>
              </div>

              {/* Time spent */}
              <div className="mb-6">
                <label className="block text-sm text-slate-700 mb-2">
                  Time spent on this task
                  <span className="ml-1.5 text-slate-400 font-normal">Optional, but it helps your mentor understand your effort.</span>
                </label>
                <div className="flex items-center gap-2">
                  <div className="relative w-40">
                    <Clock className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="number"
                      min="0.5"
                      max="200"
                      step="0.5"
                      value={timeSpentHours}
                      onChange={(e) => setTimeSpentHours(e.target.value)}
                      placeholder="e.g. 3"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
                    />
                  </div>
                  <span className="text-sm text-slate-500">hours</span>
                </div>
              </div>

              {/* File Upload */}
              <div className="mb-6">
                <label className="block text-sm text-slate-700 mb-2">
                  File Attachments
                </label>
                <FileDragDrop
                  onFilesSelected={(newFiles) => {
                    const remainingSlots = 5 - files.length;
                    const filesToAdd = newFiles.slice(0, remainingSlots);
                    handleFilesAdded(filesToAdd);
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
                                onClick={() => handleFileRemoved(index)}
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
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t">
              <button
                type="button"
                onClick={() => setShowExtensionForm(true)}
                className="text-slate-600 hover:text-slate-900 text-sm flex items-center gap-2"
              >
                <Clock className="w-4 h-4" />
                Request Extension
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Task
                  </>
                )}
              </button>
            </div>
          </form>
        </>
      ) : (
        <>
          {/* Extension Request Form */}
          <div className="bg-card rounded-2xl border border-slate-200 p-6 space-y-6">
            <h2 className="text-xl text-slate-900">Request Extension</h2>
            
            <div>
              <label className="block text-sm text-slate-700 mb-2">
                Extension Duration
              </label>
              <select
                value={extensionDays}
                onChange={(e) => setExtensionDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500"
              >
                <option value={1}>1 day</option>
                <option value={2}>2 days</option>
                <option value={3}>3 days</option>
                <option value={5}>5 days</option>
                <option value={7}>1 week</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-slate-700 mb-2">
                Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={extensionReason}
                onChange={(e) => setExtensionReason(e.target.value)}
                placeholder="Explain why you need more time..."
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500 min-h-[120px]"
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowExtensionForm(false)}
                className="px-6 py-2 border border-slate-200 text-slate-700 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExtensionRequest}
                disabled={isSubmitting}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Requesting...' : 'Request Extension'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
