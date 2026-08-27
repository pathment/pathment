'use client';

import { useState, useEffect, useRef } from 'react';
import { UploadCloud, FileText, Trash2, Loader2, CheckCircle2, AlertCircle, Bot, BookOpenCheck, HelpCircle, Lightbulb, Circle, KeyRound, Sparkles, Lock, Zap, Plus, Minus } from 'lucide-react';
import { useAutoReply } from '@/lib/hooks/mentor';
import { messagingApi } from '@/lib/services/messaging-api';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/admin/ui';
import { aiConnectionsApi } from '@/lib/services/ai-connections-api';

interface Document {
  id: string;
  fileName: string;
  status: 'processing' | 'completed' | 'failed';
  errorMessage?: string;
  createdAt: string;
}

interface DocumentsTabProps {
  autoReplyEnabled?: boolean;
  onAutoReplyChange?: (enabled: boolean) => Promise<void> | void;
}

/** The icon for each setup step, so the list reads at a glance. */
const STEP_ICON: Record<string, typeof KeyRound> = {
  key: KeyRound,
  documents: FileText,
  style: Sparkles,
};

export function DocumentsTab({ autoReplyEnabled = false, onAutoReplyChange }: DocumentsTabProps = {}) {
  // Readiness comes from the server, which also enforces it. The toggle is not
  // a toggle until auto reply would actually work: switching it on early would
  // leave a mentee answered out of an empty knowledge base, under a name they
  // trust.
  const { status, refetch: refetchStatus } = useAutoReply();
  const canEnable = status?.canEnable ?? false;
  const steps = status?.steps ?? [];
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deleteDocumentId, setDeleteDocumentId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toggling, setToggling] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editingQuota, setEditingQuota] = useState(false);
  const [tempQuotaLimit, setTempQuotaLimit] = useState(100);
  const [updatingLimit, setUpdatingLimit] = useState(false);

  useEffect(() => {
    if (status?.usage) {
      setTempQuotaLimit(status.usage.limit);
    }
  }, [status?.usage]);

  const handleUpdateQuotaLimit = async () => {
    setUpdatingLimit(true);
    try {
      await aiConnectionsApi.setQuotaLimit(tempQuotaLimit);
      toast.success('Quota limit updated');
      await refetchStatus();
      setEditingQuota(false);
    } catch {
      toast.error('Could not update quota limit');
    } finally {
      setUpdatingLimit(false);
    }
  };

  const handleToggleAutoReply = async () => {
    if (!onAutoReplyChange) return;

    // Turning it ON needs the prerequisites. Turning it OFF is always allowed:
    // somebody must be able to stop it whatever state their setup is in.
    if (!autoReplyEnabled && !canEnable) {
      toast.error('Finish the setup below first');
      return;
    }

    setToggling(true);
    try {
      await onAutoReplyChange(!autoReplyEnabled);
      await refetchStatus();
    } finally {
      setToggling(false);
    }
  };

  const fetchDocuments = async () => {
    try {
      const data = await messagingApi.getMentorDocuments();
      setDocuments(data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
    // Poll every 10s if any doc is 'processing'
    const interval = setInterval(() => {
      setDocuments((currentDocs) => {
        if (currentDocs.some((d) => d.status === 'processing')) {
          fetchDocuments();
        }
        return currentDocs;
      });
    }, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleFileDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await uploadFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await uploadFile(e.target.files[0]);
    }
  };

  const uploadFile = async (file: File) => {
    if (file.type !== 'application/pdf') {
      toast.error('Only PDF files are supported.');
      return;
    }

    setUploading(true);
    try {
      await messagingApi.uploadMentorDocument(file);
      toast.success('Document uploaded successfully. It is now processing.');
      await fetchDocuments();
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Failed to upload document.');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteDocumentId) return;
    setDeleting(true);
    try {
      await messagingApi.deleteMentorDocument(deleteDocumentId);
      toast.success('Document deleted');
      setDocuments(documents.filter((d) => d.id !== deleteDocumentId));
    } catch {
      toast.error('Failed to delete document');
    } finally {
      setDeleting(false);
      setDeleteDocumentId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-slate-900 mb-2">Knowledge Base</h2>
        <p className="text-slate-600">
          Upload PDF documents to train your AI on your specific context. The AI will use these to draft better responses for your mentees.
        </p>
      </div>

      {/* AI Auto-Reply Toggle Card */}
      <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-card">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3.5">
            <div className={`p-2.5 rounded-xl shrink-0 ${autoReplyEnabled ? 'bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400' : 'bg-slate-100 text-slate-500'
              }`}>
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-medium text-sm sm:text-base text-slate-900">
                  AI Automatic Replies
                </h3>
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${autoReplyEnabled
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/50'
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${autoReplyEnabled ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {autoReplyEnabled ? 'On' : 'Off'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {autoReplyEnabled
                  ? 'AI will analyze incoming mentee messages against your uploaded documents to automatically send responses or generate drafts for your review.'
                  : 'AI auto-replies and draft generation are turned off. Mentee messages will not trigger automated responses.'}
              </p>
            </div>
          </div>

          {/* The switch is locked until the setup below is done. */}
          <button
            type="button"
            onClick={handleToggleAutoReply}
            disabled={toggling || (!autoReplyEnabled && !canEnable)}
            aria-label="Toggle AI Automatic Replies"
            title={!autoReplyEnabled && !canEnable ? 'Finish the setup below first' : undefined}
            className={`relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 ${!autoReplyEnabled && !canEnable ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
              } ${autoReplyEnabled ? 'bg-brand-600' : 'bg-slate-200'
              }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out flex items-center justify-center ${autoReplyEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
            >
              {toggling && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </span>
          </button>
        </div>
      </div>

      {/* AI Auto-Reply Quota */}
      {status?.usage && (
        <section>
          <h2 className="text-slate-900 flex items-center gap-2 mb-2"><Zap className="w-5 h-5 text-brand-600" /> Auto-Reply Quota</h2>
          <p className="text-slate-500 text-sm mb-4">Control how many automatic AI replies can be sent on your behalf each month.</p>

          <div className="p-4 sm:p-5 rounded-xl border border-slate-200 bg-card">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-slate-800 dark:text-slate-200">
                {status.usage.sent} of {status.usage.limit} messages used this month
              </span>
              <button 
                onClick={() => setEditingQuota(!editingQuota)}
                className="text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                {editingQuota ? 'Cancel' : 'Edit Limit'}
              </button>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 mb-4">
              <div 
                className={`h-2.5 rounded-full ${status.usage.sent >= status.usage.limit ? 'bg-red-500' : 'bg-brand-600'}`}
                style={{ width: `${Math.min(100, (status.usage.sent / Math.max(1, status.usage.limit)) * 100)}%` }}
              ></div>
            </div>

            {editingQuota && (
              <div className="flex flex-col gap-3 mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 max-w-md">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    Monthly Limit: <span className="text-slate-900 dark:text-slate-100 font-bold text-sm">{tempQuotaLimit} messages</span>
                  </span>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    {/* Decrement Button */}
                    <button
                      type="button"
                      onClick={() => setTempQuotaLimit(Math.max(10, tempQuotaLimit - 50))}
                      className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-colors"
                      aria-label="Decrease limit by 50"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    
                    {/* Input Field */}
                    <input 
                      type="number"
                      min="10"
                      value={tempQuotaLimit}
                      onChange={(e) => setTempQuotaLimit(Math.max(0, parseInt(e.target.value) || 0))}
                      onBlur={() => setTempQuotaLimit(Math.max(10, tempQuotaLimit))}
                      className="w-24 text-center bg-background border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-2 text-sm font-semibold text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />

                    {/* Increment Button */}
                    <button
                      type="button"
                      onClick={() => setTempQuotaLimit(tempQuotaLimit + 50)}
                      className="p-2 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 text-slate-600 dark:text-slate-400 transition-colors"
                      aria-label="Increase limit by 50"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>

                  <button 
                    onClick={handleUpdateQuotaLimit}
                    disabled={updatingLimit}
                    className="px-4 py-2 bg-brand-600 hover:bg-brand-750 disabled:bg-brand-400 text-white rounded-lg text-xs font-medium shrink-0 shadow-sm transition-all flex items-center gap-1.5"
                  >
                    {updatingLimit && <Loader2 className="w-3 h-3 animate-spin" />}
                    Save Limit
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      {/* What auto reply needs, in the order it has to happen. Shown while
          anything is outstanding: a locked switch with no explanation is the
          most frustrating thing a settings page can do. */}
      {steps.length > 0 && !canEnable && (
        <div className="p-4 sm:p-5 rounded-xl border border-amber-200 dark:border-amber-900/30 bg-amber-50/60 dark:bg-amber-950/10">
          <div className="flex items-start gap-3">
            <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-slate-900">Set this up first</h4>
              <p className="text-xs text-slate-600 mt-0.5 mb-3">
                Auto reply sends messages to your mentees under your name without you reading them
                first. It stays off until it can do that properly.
              </p>

              <ol className="space-y-3">
                {steps.map((step) => {
                  const Icon = STEP_ICON[step.key] ?? Circle;
                  return (
                    <li key={step.key} className="flex items-start gap-2.5">
                      {step.done ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                      ) : (
                        <Icon className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className={`text-sm ${step.done ? 'text-slate-500 line-through' : 'text-slate-900 font-medium'}`}>
                          {step.title}
                          {!step.blocking && !step.done && (
                            <span className="ml-2 text-[11px] font-normal text-slate-500">optional</span>
                          )}
                        </p>
                        {!step.done && (
                          <>
                            <p className="text-xs text-slate-600 mt-0.5">{step.why}</p>
                            {step.progress && (
                              <div className="mt-1.5 flex items-center gap-2 max-w-xs">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-amber-200 dark:border-amber-900/30">
                                  <div
                                    className="h-full bg-amber-400 rounded-full"
                                    style={{ width: `${Math.min(100, (step.progress.current / step.progress.needed) * 100)}%` }}
                                  />
                                </div>
                                <span className="text-[11px] text-slate-500 tabular-nums">
                                  {step.progress.current}/{step.progress.needed}
                                </span>
                              </div>
                            )}
                            <p className="text-[11px] text-slate-500 mt-1">{step.action}</p>
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </div>
      )}

      {/* Upload Dropzone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleFileDrop}
        className="border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center bg-slate-50 hover:bg-slate-100 transition-colors cursor-pointer"
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept="application/pdf"
          onChange={handleFileSelect}
        />
        {uploading ? (
          <Loader2 className="w-8 h-8 animate-spin text-brand-600 mb-4" />
        ) : (
          <UploadCloud className="w-10 h-10 text-slate-400 mb-4" />
        )}
        <h3 className="text-slate-900 font-medium mb-1">
          {uploading ? 'Uploading...' : 'Click or drag to upload'}
        </h3>
        <p className="text-slate-500 text-sm">
          Supports PDF only (Max 10MB)
        </p>
      </div>

      {/* Documents List */}
      <div>
        <h3 className="font-medium text-slate-900 mb-4">Your Documents</h3>
        {loading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-brand-600" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center p-8 bg-slate-50 rounded-xl border border-slate-100 text-slate-500">
            No documents uploaded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 sm:p-4 bg-card border border-slate-200 rounded-xl min-w-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-2.5 sm:p-3 bg-brand-50 dark:bg-brand-500/10 rounded-lg shrink-0">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-brand-600 dark:text-brand-400" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h4 className="text-slate-900 font-medium text-sm truncate" title={doc.fileName}>
                      {doc.fileName}
                    </h4>
                    <p className="text-slate-500 text-xs mt-0.5">
                      Uploaded on {new Date(doc.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                  {doc.status === 'processing' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 rounded-full text-xs font-medium">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Processing
                    </span>
                  )}
                  {doc.status === 'completed' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-400 rounded-full text-xs font-medium">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Ready
                    </span>
                  )}
                  {doc.status === 'failed' && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-400 rounded-full text-xs font-medium" title={doc.errorMessage}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Failed
                    </span>
                  )}

                  <button
                    onClick={() => setDeleteDocumentId(doc.id)}
                    className="p-1.5 sm:p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    title="Delete document"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RAG PDF Best Practices & Formatting Guide */}
      <div className="p-4 sm:p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
        <div className="flex items-center gap-2 text-slate-900 font-medium">
          <Lightbulb className="w-5 h-5 text-brand-600 shrink-0" />
          <h4 className="text-sm sm:text-base">PDF Optimization Guide for AI Auto-Replies</h4>
        </div>
        <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
          The AI reads your uploaded PDFs to automatically answer mentee questions with high accuracy. Follow these practical tips when creating your PDFs:
        </p>
        <div className="grid sm:grid-cols-2 gap-3 text-xs sm:text-sm pt-1">
          <div className="p-3 bg-card border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              Clear Headings & Sections
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Use distinct section titles (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">Proposal Guidelines</code>, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">Office Hours Policy</code>) so the AI retrieves exact relevant paragraphs.
            </p>
          </div>
          <div className="p-3 bg-card border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-brand-600 dark:text-brand-400 shrink-0" />
              Direct Q&A / FAQ Format
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Include explicit Q&A blocks (e.g. <em className="text-slate-700">{"\"Q: How long should proposals be? A: Keep proposals between 3-5 pages focusing on architecture.\""}</em>).
            </p>
          </div>
          <div className="p-3 bg-card border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              Digital Selectable Text (No Scans)
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Export PDFs directly from Word, Google Docs, or Notion. Scanned photos or flattened images cannot be converted into searchable text chunks.
            </p>
          </div>
          <div className="p-3 bg-card border border-slate-200 rounded-lg space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1.5">
              <Bot className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              Explicit Rules & Specific Details
            </div>
            <p className="text-slate-500 text-xs leading-normal">
              Provide exact numbers, submission links, deadlines, and requirements so the AI can provide definitive answers without guessing.
            </p>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteDocumentId}
        title="Delete Document"
        description="Are you sure you want to delete this document? The AI will no longer use it as context for drafting responses."
        confirmLabel="Delete"
        variant="danger"
        loading={deleting}
        onConfirm={handleDeleteConfirm}
        onCancel={() => !deleting && setDeleteDocumentId(null)}
      />
    </div>
  );
}
