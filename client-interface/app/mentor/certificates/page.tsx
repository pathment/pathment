'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Loader2, Award, Calendar, ArrowLeft, Search,
  Users, Send, Eye, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, ShieldOff, Download, ExternalLink, Linkedin, ShieldCheck, X, ShieldAlert, Info,
  ChevronDown, Sparkles, Edit3
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';
import { certificatesApi, CertificateTemplate, CertificateInstance } from '@/lib/services/certificates-api';
import CertificateHistoryLog from '@/components/admin/certificates/CertificateHistoryLog';
import { DuplicateWarnModal } from '@/components/shared';
import { getTierBadgeColor, getTierButtonColor, getTierIconColor } from '@/lib/utils/certificates';
import { Drawer } from '@/components/shared/Drawer';
import { AIDetailDrawer, AIEvaluationBanner, RecipientRosterTable } from '@/components/certificates/shared';
import { useAIEvaluationProgress } from '@/components/admin/certificates/hooks';



type CriteriaTier = {
  id: string;
  name: string;
  taskIds: string[];
};

type MenteeRow = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  completedCount: number;
  totalTasks: number;
  criteriaMatch: number;
  assignedTier?: string;
  tierMatches?: Record<string, number>;
  issuedTiers?: string[];
};

type QualifiedData = Record<string, MenteeRow[]>;


function EligibilityBadge({ match }: { match: number }) {
  if (match === 100) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-600 bg-emerald-500/10">
        <CheckCircle2 className="w-3 h-3" /> Qualifies
      </span>
    );
  }
  if (match >= 50) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-amber-600 bg-amber-500/10">
        <AlertCircle className="w-3.5 h-3.5" /> {match}% match
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold text-red-500 bg-red-500/10">
      <XCircle className="w-3.5 h-3.5" /> {match}% match
    </span>
  );
}


export default function MentorCertificatesPage() {
  const { user } = useAuth();

  const getLinkedInShareUrl = (c: CertificateInstance) => {
    const url = c.imageUrl || c.pdfUrl || (typeof window !== 'undefined' ? window.location.href : '');
    const title = `Awarded: ${c.template?.name || 'Certificate of Mastery'} from Pathment`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  };

  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(true);

  const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
  const [workspaceTab, setWorkspaceTab] = useState<'issue' | 'history'>('issue');

  const [qualifiedData, setQualifiedData] = useState<QualifiedData>({});
  const [loadingQualifications, setLoadingQualifications] = useState(false);
  const [isRulesDrawerOpen, setIsRulesDrawerOpen] = useState(false);
  const [criteriaTasks, setCriteriaTasks] = useState<Array<{ id: string; title: string }>>([]);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [badgeFilter, setBadgeFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'none' | 'score_desc' | 'score_asc'>('none');
  const [personalNote, setPersonalNote] = useState('');
  const [issuing, setIssuing] = useState(false);

  const [mentorTiers, setMentorTiers] = useState<Record<string, string>>({});
  const [aiDetailMentee, setAiDetailMentee] = useState<any | null>(null);

  const {
    aiResults, setAiResults, aiRanAt, setAiRanAt, runningAI,
    aiProgressCount, aiTotalCount, runAIEvaluation
  } = useAIEvaluationProgress({
    templateId: activeTemplateId,
    onSingleProgress: (result) => {
      setMentorTiers(prev => ({ ...prev, [result.mentee_id]: result.certificate_tier }));
      setSelectedIds(prev => new Set(prev).add(result.mentee_id));
    },
    onBatchComplete: (results) => {
      const newTiers: Record<string, string> = {};
      const autoSelected = new Set<string>();
      for (const r of results) {
        newTiers[r.mentee_id] = r.certificate_tier;
        autoSelected.add(r.mentee_id);
      }
      setMentorTiers(prev => ({ ...prev, ...newTiers }));
      setSelectedIds(autoSelected);
    }
  });



  const getTierName = (tierId: string) => {
    if (!tierId || typeof tierId !== 'string') return '';
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const match = activeTemplate?.criteria?.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  const [duplicateWarnState, setDuplicateWarnState] = useState<{
    isOpen: boolean;
    duplicates: Array<{ id: string; name: string; email: string; tier: string }>;
    allSelectedRecipients: Array<{ menteeId: string; tier: string }>;
  }>({
    isOpen: false,
    duplicates: [],
    allSelectedRecipients: []
  });

  const [refreshKey, setRefreshKey] = useState(0);

  const [activeTab, setActiveTab] = useState<'issue' | 'my'>('issue');

  const [myCertificates, setMyCertificates] = useState<CertificateInstance[]>([]);
  const [loadingMyCertificates, setLoadingMyCertificates] = useState(true);
  const [previewCert, setPreviewCert] = useState<CertificateInstance | null>(null);

  const currentTemplate = templates.find(t => t.id === activeTemplateId) ?? null;
  const criteria = currentTemplate?.criteria ?? [];

  const fetchMyCertificates = async () => {
    if (!user?.id) return;
    try {
      setLoadingMyCertificates(true);
      const res = await certificatesApi.listMenteeCertificates(user.id);
      if (res.success && res.data) {
        setMyCertificates(res.data);
      }
    } catch (err: any) {
      toast.error('Failed to load your certificates');
      console.error(err);
    } finally {
      setLoadingMyCertificates(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'my') {
      fetchMyCertificates();
    }
  }, [activeTab, user?.id]);

  useEffect(() => {
    certificatesApi.listTemplates()
      .then(res => { if (res.success) setTemplates((res.data ?? []).filter(t => t.status === 'active')); })
      .catch(() => toast.error('Failed to load templates'))
      .finally(() => setLoadingTemplates(false));
  }, []);

  useEffect(() => {
    if (!activeTemplateId || !user) {
      setQualifiedData({});
      setMentorTiers({});
      return;
    }

    setLoadingQualifications(true);
    setSearch('');
    setSelectedIds(new Set());

    certificatesApi.getQualification(activeTemplateId, { mentorId: user.id })
      .then(res => {
        if (res.success && res.data) {
          const data = res.data as QualifiedData;
          setQualifiedData(data);
          if (res.criteriaTasks) {
            setCriteriaTasks(res.criteriaTasks);
          } else {
            setCriteriaTasks([]);
          }

          const activeTemplate = templates.find(t => t.id === activeTemplateId);
          const criteria = activeTemplate?.criteria ?? [];

          const activeList: any[] = [];
          const seenIds = new Set<string>();

          criteria.forEach(c => {
            const list = data[c.id] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          Object.keys(data).forEach(key => {
            if (key === 'mentors' || key === 'paused') return;
            const list = data[key] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          const initialTiers: Record<string, string> = {};
          const autoSelected = new Set<string>();

          activeList.forEach(m => {
            let defTier = m.assignedTier;
            if (!defTier || !criteria.some(c => c.id === defTier)) {
              let maxMatch = -1;
              let bestTierId = criteria[criteria.length - 1]?.id || 'participation';
              criteria.forEach(c => {
                const match = m.tierMatches?.[c.id] ?? 0;
                if (match > maxMatch) {
                  maxMatch = match;
                  bestTierId = c.id;
                }
              });
              defTier = bestTierId;
            }
            initialTiers[m.id] = defTier;

            const matchPercent = m.tierMatches?.[defTier] ?? 0;
            if (matchPercent >= 90) {
              autoSelected.add(m.id);
            }
          });

          if (activeTemplate?.aiEvaluation?.results) {
            const aiRes = activeTemplate.aiEvaluation.results;
            setAiResults(aiRes);
            setAiRanAt(activeTemplate.aiEvaluation.ranAt ?? null);
            aiRes.forEach((r: any) => {
              if (r.mentee_id && r.certificate_tier && seenIds.has(r.mentee_id)) {
                initialTiers[r.mentee_id] = r.certificate_tier;
                autoSelected.add(r.mentee_id);
              }
            });
          } else {
            setAiResults([]);
            setAiRanAt(null);
          }

          setMentorTiers(initialTiers);
          setSelectedIds(autoSelected);
        }
      })
      .catch(() => toast.error('Failed to load qualification details'))
      .finally(() => setLoadingQualifications(false));
  }, [activeTemplateId, user, refreshKey]);

  const activeMentees = useMemo<MenteeRow[]>(() => {
    const list: MenteeRow[] = [];
    const seen = new Set<string>();
    Object.keys(qualifiedData).forEach(key => {
      if (key !== 'paused' && key !== 'mentors') {
        const arr = qualifiedData[key] || [];
        arr.forEach((m: MenteeRow) => {
          if (!seen.has(m.id)) {
            seen.add(m.id);
            list.push(m);
          }
        });
      }
    });
    return list;
  }, [qualifiedData]);

  const mentorAIResults = useMemo(() => {
    const activeIds = new Set(activeMentees.map(m => m.id));
    return aiResults.filter((r: any) => activeIds.has(r.mentee_id));
  }, [aiResults, activeMentees]);

  const aiEvalMap = useMemo(() => {
    const map: Record<string, any> = {};
    mentorAIResults.forEach((r: any) => { map[r.mentee_id] = r; });
    return map;
  }, [mentorAIResults]);

  const getEffectiveTier = useCallback((mOrId: any): string => {
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const criteria = activeTemplate?.criteria ?? [];
    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const id = typeof mOrId === 'string' ? mOrId : mOrId?.id;
    if (!id) return defaultTier;

    if (mentorTiers[id]) return mentorTiers[id];
    if (aiEvalMap[id]?.certificate_tier) return aiEvalMap[id].certificate_tier;

    const m = typeof mOrId === 'object' ? mOrId : activeMentees.find((x: any) => x.id === id);
    if (m?.assignedTier) return m.assignedTier;

    return defaultTier;
  }, [mentorTiers, aiEvalMap, activeMentees, templates, activeTemplateId]);

  const filtered = useMemo(() => {
    let result = [...activeMentees];

    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(m =>
        `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q)
      );
    }

    if (badgeFilter !== 'all') {
      result = result.filter((m: any) => {
        const assignedTier = getEffectiveTier(m);
        return assignedTier === badgeFilter;
      });
    }

    if (sortBy === 'score_desc') {
      result.sort((a: any, b: any) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));
    } else if (sortBy === 'score_asc') {
      result.sort((a: any, b: any) => (a.normalizedScore ?? 0) - (b.normalizedScore ?? 0));
    }

    return result;
  }, [activeMentees, search, badgeFilter, sortBy, getEffectiveTier]);

  const allSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));

  const selectedSummary = useMemo(() => {
    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const criteria = activeTemplate?.criteria ?? [];

    const counts: Record<string, number> = {};
    criteria.forEach(c => {
      counts[c.id] = 0;
    });

    selectedIds.forEach(id => {
      const tier = getEffectiveTier(id);
      if (counts[tier] !== undefined) {
        counts[tier]++;
      } else {
        counts[tier] = 1;
      }
    });

    return {
      total: selectedIds.size,
      counts
    };
  }, [selectedIds, getEffectiveTier, templates, activeTemplateId]);

  const toggleAll = useCallback(() => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      allSelected ? filtered.forEach(m => next.delete(m.id)) : filtered.forEach(m => next.add(m.id));
      return next;
    });
  }, [allSelected, filtered]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const bulkSetBadge = (badge: string) => {
    const updatedTiers = { ...mentorTiers };
    const nextSelected = new Set(selectedIds);

    filtered.forEach(m => {
      updatedTiers[m.id] = badge;
      const match = m.tierMatches?.[badge] ?? 0;
      if (match >= 90) {
        nextSelected.add(m.id);
      } else {
        nextSelected.delete(m.id);
      }
    });

    setMentorTiers(updatedTiers);
    setSelectedIds(nextSelected);
    toast.info(`Set all filtered mentees to ${getTierName(badge)}`);
  };

  const resetToAIRecommendations = () => {
    if (!aiResults || aiResults.length === 0) return;
    const updatedTiers = { ...mentorTiers };
    const nextSelected = new Set(selectedIds);
    const aiMap: Record<string, string> = {};
    aiResults.forEach(r => {
      if (r.mentee_id && r.certificate_tier) {
        aiMap[r.mentee_id] = r.certificate_tier;
      }
    });

    filtered.forEach(m => {
      const aiTier = aiMap[m.id];
      if (aiTier) {
        updatedTiers[m.id] = aiTier;
        const match = m.tierMatches?.[aiTier] ?? 0;
        if (match >= 90) {
          nextSelected.add(m.id);
        } else {
          nextSelected.delete(m.id);
        }
      }
    });

    setMentorTiers(updatedTiers);
    setSelectedIds(nextSelected);
    toast.success('Reset all filtered mentees to AI recommendations.');
  };

  const handleTierChange = (menteeId: string, value: string) => {
    setMentorTiers(prev => ({ ...prev, [menteeId]: value }));

    const mentee = activeMentees.find(m => m.id === menteeId);
    if (mentee) {
      const match = mentee.tierMatches?.[value] ?? 0;
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (match >= 90) {
          next.add(menteeId);
        } else {
          next.delete(menteeId);
        }
        return next;
      });
    }
  };

  const handleRunAIEvaluation = () => {
    if (activeTemplateId) runAIEvaluation(activeTemplateId);
  };

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: activeTemplateId!,
        recipients: recipientsList,
        mentorId: user?.id
      });
      if (res.success) {
        toast.success(`Queued ${recipientsList.length} certificate(s) for issuance`);
        setSelectedIds(new Set());
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue certificates');
    } finally {
      setIssuing(false);
    }
  };

  const handleIssue = async () => {
    if (!activeTemplateId || selectedIds.size === 0) {
      toast.error('Select at least one mentee');
      return;
    }

    const activeTemplate = templates.find(t => t.id === activeTemplateId);
    const criteria = activeTemplate?.criteria ?? [];
    const defaultTier = criteria[criteria.length - 1]?.id || 'participation';

    const recipients = Array.from(selectedIds).map(id => ({
      menteeId: id,
      tier: mentorTiers[id] ?? defaultTier
    }));

    const duplicateInstances = recipients.filter(r => {
      const m = activeMentees.find(item => item.id === r.menteeId);
      return m && m.issuedTiers && m.issuedTiers.includes(r.tier);
    }).map(r => {
      const m = activeMentees.find(item => item.id === r.menteeId);
      return {
        id: r.menteeId,
        name: m ? `${m.firstName} ${m.lastName}` : 'Recipient',
        email: m?.email ?? '',
        tier: getTierName(r.tier)
      };
    });

    if (duplicateInstances.length > 0) {
      setDuplicateWarnState({
        isOpen: true,
        duplicates: duplicateInstances,
        allSelectedRecipients: recipients
      });
    } else {
      await executeIssuance(recipients);
    }
  };


  if (!activeTemplateId) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <h1 className="text-xl font-bold text-foreground">Certificates</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Manage certifications and view your achievements.
            </p>
          </div>
          {}
          <div className="flex bg-muted/40 border border-border p-1 rounded-2xl gap-1">
            <button
              onClick={() => setActiveTab('issue')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'issue'
                ? 'bg-background border border-border shadow-2xs text-brand-600'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              Issue Certificates
            </button>
            <button
              onClick={() => setActiveTab('my')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all ${activeTab === 'my'
                ? 'bg-background border border-border shadow-2xs text-brand-600'
                : 'text-muted-foreground hover:text-foreground'
                }`}
            >
              My Certificates
            </button>
          </div>
        </div>

        {activeTab === 'my' ? (
          loadingMyCertificates ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
              <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
              <span className="text-sm text-muted-foreground font-medium">Loading your certificates...</span>
            </div>
          ) : myCertificates.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
              <Award className="w-12 h-12 text-brand-500 mb-3 opacity-60" />
              <h3 className="text-sm font-bold text-foreground mb-1">No Certificates Yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm">
                Your accomplishments will appear here as certificates are issued by admins.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myCertificates.map((cert) => {
                const dateStr = new Date(cert.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                });

                const isPending = !cert.pdfUrl || !cert.imageUrl;

                return (
                  <div
                    key={cert.id}
                    className="group bg-card border border-border rounded-2xl overflow-hidden shadow-2xs hover:shadow-xs transition-all flex flex-col cursor-pointer"
                    onClick={() => !isPending && setPreviewCert(cert)}
                  >
                    {}
                    <div className="relative aspect-[1.777] bg-muted overflow-hidden border-b border-border flex items-center justify-center">
                      {isPending ? (
                        <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center" onClick={e => e.stopPropagation()}>
                          <Loader2 className="animate-spin w-6 h-6 text-brand-500" />
                          <span className="text-[11px] font-semibold">Generating document...</span>
                          <span className="text-[9px] text-muted-foreground/60">Takes less than a minute</span>
                        </div>
                      ) : (
                        <>
                          <img
                            src={cert.imageUrl}
                            className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]"
                            alt="Certificate Awarded"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="bg-white/90 dark:bg-black/90 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm">
                              <Eye className="w-4 h-4 text-brand-500" />
                              View Certificate
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {}
                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4" onClick={e => e.stopPropagation()}>
                      <div className="space-y-1">
                        <h3
                          className="text-xs font-bold text-foreground line-clamp-1 hover:text-brand-500 transition-colors cursor-pointer"
                          onClick={() => !isPending && setPreviewCert(cert)}
                        >
                          {cert.template?.name || 'Certificate of Completion'}
                        </h3>

                        <div className="space-y-1 pt-1">
                          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold">
                            <Calendar className="w-3 h-3 text-brand-500" />
                            Issued: {dateStr}
                          </div>
                          <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground font-semibold">
                            <ShieldCheck className="w-3 h-3 text-brand-500" />
                            Verified by: {cert.mentor ? `${cert.mentor.firstName} ${cert.mentor.lastName}` : 'Pathment Admin'}
                          </div>
                        </div>
                      </div>

                      {}
                      {!isPending && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => setPreviewCert(cert)}
                            className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-bold transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View
                          </button>

                          {cert.imageUrl && (
                            <a
                              href={cert.imageUrl.replace('/upload/', '/upload/fl_attachment/')}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors flex items-center justify-center"
                              title="Download PNG"
                            >
                              <Download className="w-3.5 h-3.5" />
                              <span className="text-[9px] ml-0.5 font-bold">PNG</span>
                            </a>
                          )}

                          <a
                            href={getLinkedInShareUrl(cert)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 bg-[#0a66c2]/10 hover:bg-[#0a66c2]/20 text-[#0a66c2] rounded-xl transition-colors border border-transparent flex items-center justify-center"
                            title="Share on LinkedIn"
                          >
                            <Linkedin className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          loadingTemplates ? (
            <div className="flex items-center justify-center min-h-[300px] gap-2">
              <Loader2 className="animate-spin h-5 w-5 text-brand-500" />
              <span className="text-sm text-muted-foreground">Loading templates...</span>
            </div>
          ) : templates.length === 0 ? (
            <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-3xl p-10 bg-card text-center gap-3">
              <Award className="w-10 h-10 text-brand-500 opacity-40" />
              <p className="text-sm font-bold text-foreground">No Templates Available</p>
              <p className="text-xs text-muted-foreground max-w-xs">
                Templates shared by administrators will appear here.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {templates.map(t => (
                <div
                  key={t.id}
                  className="group bg-card border border-border hover:border-brand-500/30 rounded-2xl overflow-hidden shadow-2xs hover:shadow-sm transition-all flex flex-col"
                >
                  <div className="relative aspect-[1.414] bg-muted overflow-hidden border-b border-border">
                    {t.bgImageUrl
                      ? <img src={t.bgImageUrl} className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300" alt={t.name} />
                      : <div className="w-full h-full flex items-center justify-center"><Award className="w-10 h-10 text-muted-foreground/30" /></div>
                    }
                    {t.logoUrl && (
                      <img src={t.logoUrl} className="absolute top-3 right-3 w-7 h-7 rounded-full border border-white/60 bg-white object-contain shadow" alt="logo" />
                    )}
                  </div>
                  <div className="p-4 flex flex-col gap-3 flex-1">
                    <div>
                      <p className="text-sm font-bold text-foreground line-clamp-1">{t.name}</p>
                      <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-medium mt-0.5">
                        <Calendar className="w-3 h-3" />{new Date(t.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTemplateId(t.id)}
                      className="mt-auto w-full flex items-center justify-center gap-1.5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-colors"
                    >
                      <Award className="w-3.5 h-3.5" /> Issue Certificates
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {}
        {previewCert && (
          <div
            className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 animate-fade-in"
            onClick={() => setPreviewCert(null)}
          >
            <button
              onClick={() => setPreviewCert(null)}
              className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/5"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="w-full max-w-4xl flex flex-col items-center gap-5 mt-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="w-full aspect-[1.777] bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
                <img
                  src={previewCert.imageUrl}
                  className="w-full h-full object-contain select-none"
                  alt="Certificate Full Preview"
                />
              </div>

              <div className="text-center space-y-1">
                <h2 className="text-white text-base font-bold">{previewCert.template?.name || 'Certificate of Mastery'}</h2>
                <p className="text-white/60 text-[11px] font-medium font-semibold">
                  Issued by {previewCert.mentor ? `${previewCert.mentor.firstName} ${previewCert.mentor.lastName}` : 'Pathment Admin'}
                </p>
              </div>

              <div className="flex gap-3 bg-white/5 border border-white/10 px-5 py-3 rounded-2xl backdrop-blur-xs select-none">
                {previewCert.imageUrl && (
                  <a
                    href={previewCert.imageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-bold transition-all shadow-sm"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Image
                  </a>
                )}

                {previewCert.imageUrl && (
                  <a
                    href={previewCert.imageUrl.replace('/upload/', '/upload/fl_attachment/')}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded-xl text-xs font-semibold transition-all"
                  >
                    <Download className="w-4 h-4" />
                    Download PNG
                  </a>
                )}

                <a
                  href={getLinkedInShareUrl(previewCert)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 bg-[#0a66c2] hover:bg-[#0a66c2]/90 text-white rounded-xl text-xs font-bold transition-all"
                >
                  <Linkedin className="w-4 h-4" />
                  Share
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }


  return (
    <div className="space-y-5">
      {}
      <div className="flex items-center justify-between border-b border-border pb-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { setActiveTemplateId(null); setWorkspaceTab('issue'); }}
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-base font-bold text-foreground">Issue Certificate</h1>
            <p className="text-[11px] text-muted-foreground font-medium">{currentTemplate?.name}</p>
          </div>
        </div>

        {}
        <div className="flex items-center gap-3">
          {workspaceTab === 'issue' && (
            <button
              type="button"
              onClick={() => setIsRulesDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-border bg-card hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all shadow-2xs"
            >
              <Info className="w-3.5 h-3.5 text-brand-500" />
              View Rules
            </button>
          )}

          <div className="flex bg-muted/40 border border-border p-1 rounded-2xl gap-1">
          <button
            type="button"
            onClick={() => setWorkspaceTab('issue')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${workspaceTab === 'issue'
              ? 'bg-background border border-border shadow-2xs text-brand-600'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            Issue Credentials
          </button>
          <button
            type="button"
            onClick={() => setWorkspaceTab('history')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${workspaceTab === 'history'
              ? 'bg-background border border-border shadow-2xs text-brand-600'
              : 'text-muted-foreground hover:text-foreground'
              }`}
          >
            History & Logs
          </button>
        </div>
      </div>
    </div>

      {}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 mb-6">
        {}
        <div className="md:col-span-7 bg-card border border-border/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Certificate Template</p>
              <h3 className="text-sm font-extrabold text-foreground mt-0.5">{currentTemplate?.name || 'Certificate Template'}</h3>
            </div>
            {currentTemplate?.bgImageUrl && (
              <span className="px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-extrabold">Active</span>
            )}
          </div>
          {currentTemplate?.bgImageUrl && (
            <div className="aspect-[2.4] rounded-2xl overflow-hidden border border-border/80 bg-muted/20">
              <img src={currentTemplate.bgImageUrl} className="w-full h-full object-cover" alt="Preview" />
            </div>
          )}
        </div>

        {}
        <div className="md:col-span-5 bg-card border border-border/80 rounded-3xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Selected Summary</p>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-brand-500/5 border border-brand-500/15 mb-3">
              <span className="text-xs font-bold text-foreground">Total Selected Mentees</span>
              <span className="text-base font-black text-brand-600 dark:text-brand-400 tabular-nums">{selectedSummary.total}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {criteria.map((c: any) => {
                const iconColor = getTierIconColor(c.id);
                return (
                  <div key={c.id} className="p-2.5 rounded-xl border border-border/60 bg-muted/20 flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
                      <Award className={`w-3.5 h-3.5 ${iconColor}`} />
                      {getTierName(c.id).replace(/\s*certificate\s*/i, '')}
                    </span>
                    <span className="tabular-nums font-bold text-foreground">{selectedSummary.counts[c.id] ?? 0}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {}
      <div className="w-full">
        {workspaceTab === 'history' ? (
          <div className="bg-card border border-border/80 rounded-3xl p-6 shadow-2xs flex flex-col min-h-[560px]">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Template History Logs</p>
            </div>
            <CertificateHistoryLog templateId={activeTemplateId!} userRole="mentor" />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-3xl p-6 shadow-xs flex flex-col min-h-[580px]">
            {}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/60 mb-5 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">Mentees Eligibility & Issuance</h3>
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    <TrendingUp className="w-3 h-3" />
                    {activeMentees.length} Active
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Evaluate eligibility with AI and assign certificate tiers</p>
              </div>

              <button
                type="button"
                onClick={handleRunAIEvaluation}
                disabled={runningAI || !activeTemplateId}
                className="flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-xs self-start sm:self-auto"
              >
                {runningAI ? (
                  <><Loader2 className="animate-spin w-3.5 h-3.5" /> Evaluating…</>
                ) : (
                  <><Sparkles className="w-3.5 h-3.5" /> {aiRanAt ? 'Re-run AI Evaluation' : 'Run AI Evaluation'}</>
                )}
              </button>
            </div>




              {}
                <AIEvaluationBanner
                  count={mentorAIResults.length}
                  ranAt={aiRanAt}
                  runningAI={runningAI}
                  progressCount={aiProgressCount}
                  totalCount={aiTotalCount}
                />

              {}
              <AIDetailDrawer
                mentee={aiDetailMentee}
                onClose={() => setAiDetailMentee(null)}
                criteria={criteria}
                selectedTier={aiDetailMentee ? (mentorTiers[aiDetailMentee.mentee_id] ?? aiDetailMentee.certificate_tier) : undefined}
                onTierChange={handleTierChange}
                overrideLabel="Override Tier (Mentor)"
              />


              {}
              <div className="flex flex-col sm:flex-row gap-3 mb-5">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search mentees by name or email..."
                    className="w-full pl-10 pr-10 py-2.5 text-xs bg-background hover:bg-muted/30 border border-border/70 focus:border-brand-500 rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/50 transition-all shadow-3xs"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-muted rounded-full transition-colors"
                      type="button"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                </div>

                {}
                <div className="relative min-w-[150px]">
                  <select
                    value={badgeFilter}
                    onChange={e => setBadgeFilter(e.target.value)}
                    className="w-full px-3.5 py-2.5 pr-8 text-xs bg-background hover:bg-muted/30 border border-border/70 focus:border-brand-500 rounded-xl text-foreground font-semibold focus:outline-none transition-all cursor-pointer appearance-none shadow-3xs"
                  >
                    <option value="all">All Badges</option>
                    {criteria.map((c: any) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
                </div>

                {}
                <div className="relative min-w-[150px]">
                  <select
                    value={sortBy}
                    onChange={e => setSortBy(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 pr-8 text-xs bg-background hover:bg-muted/30 border border-border/70 focus:border-brand-500 rounded-xl text-foreground font-semibold focus:outline-none transition-all cursor-pointer appearance-none shadow-3xs"
                  >
                    <option value="none">Sort: Default</option>
                    <option value="score_desc">High Score first</option>
                    <option value="score_asc">Low Score first</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
                </div>
              </div>

              {}
              {selectedIds.size > 0 && filtered.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/20 dark:border-brand-500/30 rounded-xl p-3.5 text-xs mb-5 animate-in fade-in slide-in-from-top-2 duration-200 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    <span className="font-semibold text-foreground">
                      <strong className="font-extrabold">{selectedIds.size}</strong> {selectedIds.size === 1 ? 'mentee' : 'mentees'} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    <span className="text-[9px] font-bold text-muted-foreground uppercase tracking-wider">Set Selected to:</span>
                    {criteria.map((c: any) => {
                      const badgeColor = getTierButtonColor(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => bulkSetBadge(c.id)}
                          className={`px-2.5 py-1 rounded-lg text-[9px] font-extrabold transition-all border shadow-3xs uppercase tracking-wider ${badgeColor}`}
                        >
                          {getTierName(c.id).replace(/\s*certificate\s*/i, '')}
                        </button>
                      );
                    })}
                    {aiResults && aiResults.length > 0 && (
                      <button
                        type="button"
                        onClick={resetToAIRecommendations}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-extrabold bg-violet-600 hover:bg-violet-700 text-white shadow-3xs uppercase tracking-wider transition-colors border border-transparent"
                      >
                        <Sparkles className="w-2.5 h-2.5 text-white animate-pulse" /> Reset to AI
                      </button>
                    )}
                  </div>
                </div>
              )}

              {}
              <div className="flex-1 flex flex-col min-h-0">
                <RecipientRosterTable
                  filtered={filtered}
                  criteria={criteria}
                  aiEvalMap={aiEvalMap}
                  selectedIds={selectedIds}
                  toggleOne={toggleOne}
                  toggleAll={toggleAll}
                  allSelected={allSelected}
                  assignedTiers={mentorTiers}
                  handleTierChange={handleTierChange}
                  onInspectAI={setAiDetailMentee}
                  loading={loadingQualifications}
                  getTierName={getTierName}
                  userRole="mentor"
                  recipientTypeLabel="Mentee"
                  emptyMessage={search ? 'No mentees match your search.' : 'No active mentees found.'}
                />
              </div>

              {}
              <div className="flex items-center justify-between border-t border-border/60 pt-4 mt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                  <Users className="w-4 h-4 text-brand-500" />
                  <span>
                    <span className="text-foreground font-extrabold">{selectedIds.size}</span> / {filtered.length} selected
                  </span>
                </div>
                <button
                  onClick={handleIssue}
                  disabled={issuing || selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed rounded-xl text-xs font-bold transition-all shadow-sm"
                >
                  {issuing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                  Issue Certificates
                </button>
              </div>
            </div>
          )}
        </div>
      <Drawer
        open={isRulesDrawerOpen}
        onClose={() => setIsRulesDrawerOpen(false)}
        title="Certificate Criteria & Rules"
        subtitle={`Requirements configured for the template: ${currentTemplate?.name}`}
        width="md"
      >
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The rules below define the AI evaluation criteria for each tier. The AI evaluates keywords, score percentage, and open blockers to assign tiers.
          </p>

          <div className="space-y-4">
            {criteria.map((c: any) => {
              const iconColor = getTierIconColor(c.id);
              const isParticipation = c.id === 'participation';
              const kws: string[] = c.keywords || [];
              const minScore      = c.minScorePercent    ?? 0;
              const maxB          = (c.maxOpenBlockers ?? -1) === -1 ? 'Unlimited' : c.maxOpenBlockers;
              const minCompletion = c.minCompletionRate  ?? 0;
              const minOnTime     = c.minOnTimeRate      ?? 0;
              const minRating     = c.minAvgRating       ?? 0;
              const customRule    = c.customRule?.trim() ?? '';

              return (
                <div key={c.id} className="p-4 rounded-2xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                    <Award className={`w-5 h-5 ${iconColor}`} />
                    <span className="text-xs font-bold text-foreground">{c.name}</span>
                  </div>
                  <div className="space-y-3">
                    {isParticipation && kws.length === 0 && minScore === 0 ? (
                      <p className="text-xs text-muted-foreground font-semibold italic">Awarded to all active participants (no minimum requirements).</p>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Keywords / Tech Stack</p>
                          {kws.length === 0 ? (
                            <p className="text-[11px] text-amber-600 font-semibold italic">No keywords — AI uses hard constraints only.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {kws.map((kw: string) => (
                                <span key={kw} className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-bold border border-brand-500/20">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Hard Constraints (AI cannot bypass)</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[9px] text-muted-foreground font-semibold">Min Score</p>
                              <p className="text-xs font-extrabold text-foreground">{minScore > 0 ? `${minScore}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[9px] text-muted-foreground font-semibold">Max Blockers</p>
                              <p className="text-xs font-extrabold text-foreground">{maxB}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[9px] text-muted-foreground font-semibold">Min Completion</p>
                              <p className="text-xs font-extrabold text-foreground">{minCompletion > 0 ? `${minCompletion}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[9px] text-muted-foreground font-semibold">Min On-Time</p>
                              <p className="text-xs font-extrabold text-foreground">{minOnTime > 0 ? `${minOnTime}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center col-span-2">
                              <p className="text-[9px] text-muted-foreground font-semibold">Min Avg Rating</p>
                              <p className="text-xs font-extrabold text-foreground">{minRating > 0 ? `${minRating} / 5` : '—'}</p>
                            </div>
                          </div>
                        </div>
                        {customRule && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Custom AI Rule</p>
                            <p className="text-[11px] text-foreground italic bg-muted/30 rounded-xl px-3 py-2 leading-relaxed">"{customRule}"</p>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Drawer>

      <DuplicateWarnModal
        isOpen={duplicateWarnState.isOpen}
        duplicates={duplicateWarnState.duplicates}
        onCancel={() => setDuplicateWarnState(prev => ({ ...prev, isOpen: false }))}
        onIssueAnyway={async () => {
          const allSelected = duplicateWarnState.allSelectedRecipients;
          setDuplicateWarnState(prev => ({ ...prev, isOpen: false }));
          await executeIssuance(allSelected);
        }}
        onSkipDuplicates={async () => {
          const dupIds = new Set(duplicateWarnState.duplicates.map(d => d.id));
          const cleanRecipients = duplicateWarnState.allSelectedRecipients.filter(r => !dupIds.has(r.menteeId));
          setDuplicateWarnState(prev => ({ ...prev, isOpen: false }));
          if (cleanRecipients.length === 0) {
            toast.info('No remaining recipients left after skipping duplicates.');
            return;
          }
          await executeIssuance(cleanRecipients);
        }}
      />
    </div>
  );
}
