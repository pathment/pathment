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
  ShieldCheck
} from 'lucide-react';
import RichTextEditor from '@/components/shared/RichTextEditor';
import FileUploader from '@/components/shared/FileUploader';
import { submissionService } from '@/lib/services/submissionService';
import { useTaskDetail } from '@/lib/hooks/mentee';
import { PageHeader } from '@/components/admin/ui';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
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
      setError(extractApiErrorMessage(err, 'Failed to submit task'));
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
      setError(extractApiErrorMessage(err, 'Failed to request extension'));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
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
  const isOverdue = daysUntilDue < 0;

  // Get task details from roadmapTask or custom task fields
  const taskTitle = task.roadmapTask?.title || task.title;
  const taskDescription = task.roadmapTask?.description || task.description;
  const taskDeliverable = task.roadmapTask?.deliverable || task.deliverable;
  const acceptanceCriteria = task.roadmapTask?.acceptanceCriteria || task.acceptanceCriteria || [];
  const resources = task.roadmapTask?.resources || [];

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

      {/* Task Details */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
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
            <p className="text-slate-600">{taskDescription}</p>
            {taskDeliverable && (
              <div className="mt-3 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-sm text-indigo-900"><strong>Deliverable:</strong> {taskDeliverable}</p>
              </div>
            )}
          </div>
          <div className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
            isOverdue 
              ? 'bg-red-100 text-red-700'
              : daysUntilDue <= 2
              ? 'bg-orange-100 text-orange-700'
              : 'bg-indigo-100 text-indigo-700'
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
              <h3 className="text-sm font-medium text-slate-900 mb-1 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-indigo-500" />What your mentor checks</h3>
              <p className="text-xs text-slate-500 mb-3">Required items must be met to pass — the rest make your work stronger.</p>
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
                <li key={resource.id}>
                  <a 
                    href={resource.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-indigo-600 hover:underline flex items-center gap-2"
                  >
                    <LinkIcon className="w-4 h-4" />
                    {resource.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {!showExtensionForm ? (
        <>
          {/* Submission Form */}
          <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
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
                          className="w-full pl-10 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                    className="text-sm text-indigo-600 hover:text-indigo-700"
                  >
                    + Add another link
                  </button>
                </div>
              </div>

              {/* Time spent */}
              <div className="mb-6">
                <label className="block text-sm text-slate-700 mb-2">
                  Time spent on this task
                  <span className="ml-1.5 text-slate-400 font-normal">(optional — helps your mentor understand your effort)</span>
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
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                <FileUploader
                  files={files}
                  onFilesAdded={handleFilesAdded}
                  onFileRemoved={handleFileRemoved}
                  maxFiles={5}
                  maxSize={10 * 1024 * 1024}
                />
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
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
          <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
            <h2 className="text-xl text-slate-900">Request Extension</h2>
            
            <div>
              <label className="block text-sm text-slate-700 mb-2">
                Extension Duration
              </label>
              <select
                value={extensionDays}
                onChange={(e) => setExtensionDays(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 min-h-[120px]"
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
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
