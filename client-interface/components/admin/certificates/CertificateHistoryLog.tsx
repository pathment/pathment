'use client';

import { useState, useEffect, useMemo } from 'react';
import { 
  Search, Loader2, Award, Calendar, RotateCw, Trash2,
  CheckCircle2, XCircle, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';

type HistoryItem = {
  id: string;
  pdfUrl: string | null;
  imageUrl: string | null;
  tier: string;
  createdAt: string;
  recipient: { id: string; firstName: string; lastName: string; email: string; role: string } | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error: string | null;
};

interface CertificateHistoryLogProps {
  templateId: string;
  userRole: 'admin' | 'mentor';
}

export default function CertificateHistoryLog({ templateId, userRole }: CertificateHistoryLogProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [criteria, setCriteria] = useState<Array<{ id: string; name: string }>>([]);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    type?: 'warning' | 'danger' | 'info';
    onConfirm: () => void;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });

  const fetchHistory = async (showLoading = false) => {
    try {
      if (showLoading) setLoading(true);
      const res = await certificatesApi.getTemplateHistory(templateId);
      if (res.success && res.data) {
        setHistory(res.data);
      }
    } catch (err) {
      console.error('Failed to load certificate history:', err);
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const fetchTemplateCriteria = async () => {
    try {
      const res = await certificatesApi.getTemplate(templateId);
      if (res.success && res.data && res.data.criteria) {
        setCriteria(res.data.criteria);
      }
    } catch (err) {
      console.error('Failed to load criteria', err);
    }
  };

  useEffect(() => {
    fetchHistory(true);
    if (templateId) {
      fetchTemplateCriteria();
    }
  }, [templateId]);

  useEffect(() => {
    const hasActiveJobs = history.some(item => item.status === 'pending' || item.status === 'processing');
    if (!hasActiveJobs) return;

    const interval = setInterval(() => {
      fetchHistory(false);
    }, 5000);

    return () => clearInterval(interval);
  }, [history]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return history.filter(item => {
      const recipientName = item.recipient ? `${item.recipient.firstName} ${item.recipient.lastName}`.toLowerCase() : '';
      const recipientEmail = item.recipient?.email?.toLowerCase() ?? '';
      
      const matchesSearch = recipientName.includes(q) || recipientEmail.includes(q);
      const matchesStatus = statusFilter === 'all' || item.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [history, search, statusFilter]);

  const stats = useMemo(() => {
    const total = history.length;
    const completed = history.filter(item => item.status === 'completed').length;
    const pending = history.filter(item => item.status === 'pending').length;
    const processing = history.filter(item => item.status === 'processing').length;
    const failed = history.filter(item => item.status === 'failed').length;
    const activeJobs = pending + processing;
    const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0;

    return { total, completed, pending, processing, failed, activeJobs, progressPercent };
  }, [history]);

  const handleResend = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Regenerate Certificate?',
      message: 'Are you sure you want to regenerate and resend this certificate? This will re-run the layout generator.',
      confirmLabel: 'Regenerate',
      cancelLabel: 'Keep Current',
      type: 'warning',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          const res = await certificatesApi.resendCertificateInstance(id);
          if (res.success) {
            toast.success('Certificate queued for regeneration successfully!');
            setHistory(prev => prev.map(item => 
              item.id === id ? { ...item, status: 'pending', pdfUrl: null, imageUrl: null } : item
            ));
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend certificate');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevoke = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Revoke Certificate?',
      message: 'Are you sure you want to revoke and delete this certificate? This action is permanent.',
      confirmLabel: 'Revoke',
      cancelLabel: 'Keep Certificate',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setActioningId(id);
          const res = await certificatesApi.deleteCertificateInstance(id);
          if (res.success) {
            toast.success('Certificate revoked and deleted successfully!');
            setHistory(prev => prev.filter(item => item.id !== id));
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificate');
        } finally {
          setActioningId(null);
        }
      }
    });
  };

  const handleRevokeAll = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'REVOKE ALL CERTIFICATES?',
      message: 'WARNING: Are you sure you want to revoke and delete ALL certificates issued under this template? This will delete all generated credentials and is completely permanent.',
      confirmLabel: 'Revoke All',
      cancelLabel: 'Cancel',
      type: 'danger',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          const res = await certificatesApi.revokeAllTemplateCertificates(templateId);
          if (res.success) {
            toast.success('Successfully revoked and deleted all certificates for this template!');
            setHistory([]);
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to revoke certificates');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const handleResendAll = (failedOnly = false) => {
    const actionText = failedOnly ? 'retry all FAILED' : 'regenerate and resend ALL';
    setConfirmConfig({
      isOpen: true,
      title: failedOnly ? 'Retry Failed Certificates?' : 'Regenerate All Certificates?',
      message: `Are you sure you want to ${actionText} certificates issued under this template? This will queue them back to the rendering pipeline.`,
      confirmLabel: failedOnly ? 'Retry Failed' : 'Regenerate All',
      cancelLabel: 'Cancel',
      type: 'warning',
      onConfirm: async () => {
        setConfirmConfig(prev => ({ ...prev, isOpen: false }));
        try {
          setLoading(true);
          const res = await certificatesApi.resendAllTemplateCertificates(templateId, failedOnly);
          if (res.success) {
            toast.success(res.message);
            await fetchHistory(false);
          }
        } catch (err: any) {
          toast.error(err.message || 'Failed to resend certificates');
        } finally {
          setLoading(false);
        }
      }
    });
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'gold': return 'text-amber-500 bg-amber-500/10 border-amber-500/20';
      case 'silver': return 'text-slate-400 bg-slate-500/10 border-slate-500/20';
      case 'bronze': return 'text-amber-700 bg-amber-700/10 border-amber-700/20';
      default: return 'text-blue-500 bg-blue-500/10 border-blue-500/20';
    }
  };

  const getTierName = (tierId: string) => {
    const match = criteria.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  return (
    <div className="space-y-4">
      {}
      {stats.total > 0 && (
        <div className="bg-muted/30 border border-border/80 rounded-2xl p-4.5 space-y-3.5 shadow-3xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <div className="relative flex h-2 w-2">
                {stats.activeJobs > 0 ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                )}
              </div>
              <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                Generation Pipeline
                {stats.activeJobs > 0 && (
                  <span className="text-[10px] text-brand-600 bg-brand-500/10 px-1.5 py-0.5 rounded font-extrabold uppercase animate-pulse">
                    Live processing
                  </span>
                )}
              </h4>
            </div>
            <div className="text-[11px] font-bold text-muted-foreground">
              Progress: <span className="text-foreground font-extrabold">{stats.completed}</span> / {stats.total} ({stats.progressPercent}%)
            </div>
          </div>

          {}
          <div className="w-full bg-border rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-brand-500 via-indigo-500 to-emerald-500 h-1.5 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${stats.progressPercent}%` }}
            />
          </div>

          {}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
            <div className="bg-background border border-border p-2.5 rounded-xl flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Completed</p>
                <p className="text-sm font-extrabold text-emerald-600">{stats.completed}</p>
              </div>
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            </div>

            <div className="bg-background border border-border p-2.5 rounded-xl flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Processing</p>
                <p className="text-sm font-extrabold text-blue-500">{stats.processing}</p>
              </div>
              <Loader2 className={`w-4 h-4 text-blue-500 ${stats.processing > 0 ? 'animate-spin' : ''}`} />
            </div>

            <div className="bg-background border border-border p-2.5 rounded-xl flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Queued</p>
                <p className="text-sm font-extrabold text-slate-500">{stats.pending}</p>
              </div>
              <Calendar className="w-4 h-4 text-slate-400" />
            </div>

            <div className="bg-background border border-border p-2.5 rounded-xl flex items-center justify-between shadow-3xs">
              <div>
                <p className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Failed</p>
                <p className="text-sm font-extrabold text-red-500">{stats.failed}</p>
              </div>
              <XCircle className="w-4 h-4 text-red-500" />
            </div>
          </div>
        </div>
      )}

      {}
      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients by name or email..."
            className="w-full pl-8 pr-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/60"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="px-3.5 py-2.5 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="completed">Completed / Sent</option>
            <option value="pending">Generating / Pending</option>
            <option value="failed">Failed</option>
          </select>
          <button
            type="button"
            onClick={() => fetchHistory(false)}
            className="p-2.5 bg-background border border-border hover:bg-muted text-foreground rounded-xl transition-colors"
            title="Refresh Log"
          >
            <RefreshCw className="w-4 h-4 text-muted-foreground" />
          </button>
          {stats.failed > 0 && (
            <button
              type="button"
              onClick={() => handleResendAll(true)}
              className="px-3.5 py-2.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-600 border border-amber-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Retry All Failed Generations"
            >
              <RotateCw className="w-4 h-4" />
              Retry Failed
            </button>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={() => handleResendAll(false)}
              className="px-3.5 py-2.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-600 border border-indigo-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Regenerate and Resend All Certificates"
            >
              <RefreshCw className="w-4 h-4" />
              Resend All
            </button>
          )}
          {history.length > 0 && (
            <button
              type="button"
              onClick={handleRevokeAll}
              className="px-3.5 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5"
              title="Revoke All Certificates"
            >
              <Trash2 className="w-4 h-4" />
              Revoke All
            </button>
          )}
        </div>
      </div>

      {}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-xs text-muted-foreground font-semibold">
          {search || statusFilter !== 'all' ? 'No certificate instances match your filters.' : 'No certificates issued under this template yet.'}
        </div>
      ) : (
        <div className="border border-border rounded-2xl overflow-hidden divide-y divide-border">
          {}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 bg-muted/40 text-[10px] font-bold text-muted-foreground uppercase tracking-wider items-center">
            <div className="col-span-4">Recipient</div>
            <div className="col-span-2 text-center">Badge Tier</div>
            <div className="col-span-2 text-center">Issued Date</div>
            <div className="col-span-2 text-center">Status</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {}
          <div className="max-h-[350px] overflow-y-auto divide-y divide-border">
            {filtered.map(item => {
              const dateStr = new Date(item.createdAt).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
              });

              return (
                <div key={item.id} className="grid grid-cols-12 gap-2 px-4 py-3.5 items-center text-xs hover:bg-muted/10 transition-colors">
                  {}
                  <div className="col-span-4 min-w-0">
                    <div className="font-bold text-foreground flex items-center gap-1.5 flex-wrap">
                      <span className="truncate">{item.recipient ? `${item.recipient.firstName} ${item.recipient.lastName}` : 'Deleted User'}</span>
                      {userRole === 'admin' && item.recipient && (
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase tracking-wider ${
                          item.recipient.role === 'mentor' ? 'bg-indigo-500/10 text-indigo-600' : 'bg-brand-500/10 text-brand-600'
                        }`}>
                          {item.recipient.role}
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.recipient?.email || 'N/A'}</div>
                  </div>

                  {}
                  <div className="col-span-2 flex justify-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 border rounded-full text-[10px] font-bold uppercase tracking-wider ${getTierColor(item.tier)}`}>
                      <Award className="w-3.5 h-3.5" /> {getTierName(item.tier)}
                    </span>
                  </div>

                  {}
                  <div className="col-span-2 text-center text-muted-foreground font-semibold text-[11px]">
                    {dateStr}
                  </div>

                  {}
                  <div className="col-span-2 flex justify-center">
                    {item.status === 'completed' && item.imageUrl ? (
                      <a
                        href={item.imageUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20 transition-all border border-emerald-500/20"
                        title="Click to view full image"
                      >
                        <CheckCircle2 className="w-3 h-3" /> Completed
                      </a>
                    ) : item.status === 'failed' ? (
                      <span 
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-red-500 bg-red-500/10 cursor-help border border-red-500/20"
                        title={item.error || 'Rendering job failed. Click Resend to retry.'}
                      >
                        <XCircle className="w-3 h-3" /> Failed
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold text-blue-500 bg-blue-500/10 border border-blue-500/20">
                        <Loader2 className="animate-spin w-3.5 h-3.5" /> Generating...
                      </span>
                    )}
                  </div>

                  {}
                  <div className="col-span-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleResend(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-brand-500/30 hover:bg-brand-500/5 text-muted-foreground hover:text-brand-600 rounded-xl transition-all disabled:opacity-50"
                      title="Resend / Regenerate Certificate"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(item.id)}
                      disabled={actioningId !== null}
                      className="p-1.5 bg-background border border-border hover:border-red-500/30 hover:bg-red-500/5 text-muted-foreground hover:text-red-500 rounded-xl transition-all disabled:opacity-50"
                      title="Revoke / Delete Certificate"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <ConfirmModal
        {...confirmConfig}
        onCancel={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
