'use client';

import { useConfirm } from '@/lib/context/ConfirmContext';
import { AWARDED_CERTIFICATES, NO_CERTIFICATE, reviewSelection, aiSelection, decisionPayload } from '@/lib/utils/certificate-decision';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2, Award, Calendar, ArrowLeft, Users, Send, Eye, CheckCircle2, XCircle, AlertCircle,
  TrendingUp, Download, Linkedin, ShieldCheck, X, Info,
  Sparkles, Edit3, Clock, Lock
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { certificatesApi, CertificateTemplate, CertificateInstance, type ReviewerClanState, type CertificateVerification } from '@/lib/services/certificates-api';
import CertificateHistoryLog from '@/components/admin/certificates/CertificateHistoryLog';
import { DuplicateWarnModal } from '@/components/shared';
import { getTierBadgeColor, getTierButtonColor, getTierIconColor } from '@/lib/utils/certificates';
import { Drawer } from '@/components/shared/Drawer';
import { MenteeEvidenceDrawer, RecipientRosterTable, CertificatePreview, RosterFilterBar, type CertificateRenderData, type ReviewFilter, type RosterSort } from '@/components/certificates/shared';
import { scopeCertificateReviews } from '@/lib/utils/certificate-review-scope';
import { downloadCertificateAsPng } from '@/lib/utils/certificate-renderer';



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
  /** Which clan they sit in, so the roster can be worked one clan at a time. */
  clanId?: string | null;
  clanName?: string | null;
  completedCount: number;
  totalTasks: number;
  criteriaMatch: number;
  assignedTier?: string;
  assignedDecision?: string;
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
  const confirm = useConfirm();
  const { user } = useAuth();
  const searchParams = useSearchParams();

  const getLinkedInShareUrl = (c: CertificateInstance) => {
    const title = `Awarded: ${c.template?.name || 'Certificate of Mastery'} from Pathment`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(typeof window !== 'undefined' ? window.location.href : '')}&title=${encodeURIComponent(title)}`;
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
  const [clanFilter, setClanFilter] = useState('all');
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const [sortBy, setSortBy] = useState<RosterSort>('none');
  const [personalNote, setPersonalNote] = useState('');
  const [issuing, setIssuing] = useState(false);
  /**
   * Whether the admin has released this template for the mentor's clans.
   *
   * Sending is gated server-side, so without this the button was simply a way
   * to earn a 403: the mentor pressed Issue and got an error instead of being
   * told the admin has not approved yet. `null` = not loaded.
   */
  const [release, setRelease] = useState<ReviewerClanState[] | null>(null);

  /**
   * The open review round, keyed by mentee, or null before it has loaded.
   *
   * Reviewing and issuing are the same roster of people, so they are the same
   * table: the mentor changes a grade in the row they are already looking at
   * and signs it off there. A separate review screen meant holding one list in
   * your head while reading another.
   */
  const [reviewRows, setReviewRows] = useState<Record<string, CertificateVerification> | null>(null);
  const [reviewDeadline, setReviewDeadline] = useState<string | null>(null);
  /**
   * Whether the mentor has opened the round for editing. Grades sit locked
   * until then — this table is also the issuing screen, and a stray click on a
   * badge dropdown must not quietly re-grade somebody on the way past.
   */
  const [reviewing, setReviewing] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /** Changed grades held back until the mentor says why. */
  const [reasonDraft, setReasonDraft] = useState<
    { decisions: Array<{ menteeId: string; finalTier: string }>; reasons: Record<string, string> } | null
  >(null);

  const [mentorTiers, setMentorTiers] = useState<Record<string, string>>({});
  const [inspectedRecipient, setInspectedRecipient] = useState<any | null>(null);
  const [inspectionQueue, setInspectionQueue] = useState<string[]>([]);

  const [aiResults, setAiResults] = useState<any[]>([]);


  const getTierName = (tierId: string) => {
    if (tierId === NO_CERTIFICATE) return 'No certificate';
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
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const buildRenderData = (cert: CertificateInstance): CertificateRenderData => ({
    menteeName:    cert.mentee ? `${cert.mentee.firstName} ${cert.mentee.lastName}`.trim() : (user ? `${user.firstName} ${user.lastName}`.trim() : 'Recipient'),
    programName:   cert.template?.program?.name || cert.template?.name,
    fellowshipName: cert.template?.program?.name || cert.template?.name,
    dateIssued:    new Date(cert.createdAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    issuerName:    cert.mentor ? `${cert.mentor.firstName} ${cert.mentor.lastName}`.trim() : 'Pathment Admin',
    issuerTitle:   cert.mentor ? 'Mentor' : 'Pathment Admin',
    // The tier the certificate was actually awarded at. Tier-aware layers —
    // per-tier wording, per-tier badges, layers only the top tier gets —
    // resolve against this, so it has to travel with the render data.
    tier:        cert.tier,
    tierName:    cert.template?.criteria?.find(c => c.id === cert.tier)?.name || cert.tier,
    certificateNumber: cert.certificateNumber,
  });

  const getBadgeUrl = (cert: CertificateInstance): string | null => {
    const crit = cert.template?.criteria;
    if (!Array.isArray(crit)) return null;
    return crit.find(c => c.id === cert.tier)?.badgeUrl ?? null;
  };

  const handleDownload = async (cert: CertificateInstance) => {
    if (!cert.template) { toast.error('Template not loaded'); return; }
    if (downloadingId) return;
    setDownloadingId(cert.id);
    try {
      const data  = buildRenderData(cert);
      const badge = getBadgeUrl(cert);
      const name  = (cert.template.name || 'certificate').replace(/[^a-z0-9-_]+/gi, '-').toLowerCase();
      await downloadCertificateAsPng(cert.template, data, `${name}.png`, badge);
      toast.success('Certificate downloaded!');
    } catch {
      toast.error('Download failed — please try again');
    } finally {
      setDownloadingId(null);
    }
  };

  const currentTemplate = templates.find(t => t.id === activeTemplateId) ?? null;

  /**
   * The review round and the release gate come from one call, because they are
   * one fact: who still needs signing off, and whether the admin has released
   * the clan that follows from it. Refreshed on template change and after every
   * decision, so an approval landing while this page is open shows up.
   */
  const reviewRequestId = useRef(0);
  const loadReview = useCallback(async () => {
    const requestId = ++reviewRequestId.current;
    if (!activeTemplateId) { setRelease(null); setReviewRows(null); return; }
    try {
      const res = await certificatesApi.listVerifications(activeTemplateId);
      if (requestId !== reviewRequestId.current) return;
      if (!res.success) throw new Error('Failed to load certificate review');
      setRelease(res.data?.clans ?? []);
      setReviewDeadline(res.data?.template?.verificationDeadline ?? null);
      const byMentee: Record<string, CertificateVerification> = {};
      for (const row of res.data?.rows ?? []) byMentee[row.menteeId] = row;
      setReviewRows(byMentee);
    } catch {
      if (requestId !== reviewRequestId.current) return;
      // Unknown approval is not the same as having no review round.
      setRelease(null);
      setReviewRows(null);
      toast.error('Could not load certificate review. Please retry.');
    }
  }, [activeTemplateId]);

  useEffect(() => {
    setRelease(null);
    setReviewRows(null);
    loadReview();
    return () => { reviewRequestId.current++; };
  }, [loadReview]);

  /**
   * A clan is releasable when the admin has approved it. With no review round
   * at all (`release` empty) the template predates this flow, so the old
   * behaviour stands rather than locking a mentor out of a cycle already
   * under way.
   */
  const noReviewRound = release !== null && release.length === 0;
  const approvedClans = (release ?? []).filter(c => c.canSend);
  const canIssue = noReviewRound || approvedClans.length > 0;
  const awaitingApproval = (release ?? []).filter(c => !c.canSend);
  const criteria = currentTemplate?.criteria ?? [];

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

  const { rows: reviewList, clans: reviewClans } = useMemo(
    () => scopeCertificateReviews(activeMentees, Object.values(reviewRows ?? {}), release ?? []),
    [activeMentees, reviewRows, release],
  );
  /** There is something to sign off on for this template. */
  const reviewOpen = reviewList.length > 0;
  const pendingReviewCount = reviewList.filter(r => r.status !== 'verified').length;
  /**
   * Locked whenever a round exists and the mentor has not opened it. Issuing is
   * NOT gated on this — an approved clan can still be sent while the grades sit
   * locked, which is the normal state once everything is signed off.
   */
  const tableLocked = reviewOpen && !reviewing;

  const reviewDaysLeft = useMemo(() => {
    if (!reviewDeadline) return null;
    return Math.ceil((new Date(reviewDeadline).getTime() - Date.now()) / 86_400_000);
  }, [reviewDeadline]);

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

  /**
   * The reminder notification links here with ?verify=<templateId>. Open that
   * template with its grades already unlocked — the mentor followed a link that
   * asked them to review, so make that the thing in front of them. Applied once
   * so navigating back to the list does not snap them forward again.
   */
  const deepLinkApplied = useRef(false);
  useEffect(() => {
    if (deepLinkApplied.current) return;
    const fromLink = searchParams.get('verify');
    if (!fromLink) return;
    deepLinkApplied.current = true;
    setActiveTemplateId(fromLink);
    setWorkspaceTab('issue');
    setReviewing(true);
  }, [searchParams]);

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

    let cancelled = false;
    setLoadingQualifications(true);
    setSearch('');
    setSelectedIds(new Set());

    certificatesApi.getQualification(activeTemplateId, { mentorId: user.id })
      .then(res => {
        if (!cancelled && res.success && res.data) {
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
            const defTier = m.assignedDecision === 'no_certificate' ? NO_CERTIFICATE : (criteria.some(c => c.id === m.assignedTier) ? m.assignedTier! : '');
            initialTiers[m.id] = defTier;

            const matchPercent = m.tierMatches?.[defTier] ?? 0;
            if (matchPercent >= 90) {
              autoSelected.add(m.id);
            }
          });

          if (activeTemplate?.aiEvaluation?.results) {
            const aiRes = activeTemplate.aiEvaluation.results;
            setAiResults(aiRes);
            aiRes.forEach((r: any) => {
              if (r.mentee_id && aiSelection(r) && seenIds.has(r.mentee_id)) {
                if (!initialTiers[r.mentee_id]) initialTiers[r.mentee_id] = aiSelection(r);
                autoSelected.add(r.mentee_id);
              }
            });
          } else {
            setAiResults([]);
          }

          setMentorTiers(initialTiers);
          setSelectedIds(autoSelected);
        }
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load qualification details'); })
      .finally(() => { if (!cancelled) setLoadingQualifications(false); });
    return () => { cancelled = true; };
  }, [activeTemplateId, user, refreshKey]);

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
    const defaultTier = '';
    const id = typeof mOrId === 'string' ? mOrId : mOrId?.id;
    if (!id) return defaultTier;

    const review = reviewRows?.[id];
    if (review?.clanId && release?.some(c => c.clanId === review.clanId && c.approved)) return reviewSelection(review);
    if (mentorTiers[id] !== undefined) return mentorTiers[id];
    if (aiSelection(aiEvalMap[id])) return aiSelection(aiEvalMap[id]);

    const m = typeof mOrId === 'object' ? mOrId : activeMentees.find((x: any) => x.id === id);
    if (m?.assignedTier) return m.assignedTier;

    return defaultTier;
  }, [mentorTiers, aiEvalMap, activeMentees, reviewRows, release]);

  const filtered = useMemo(() => {
    let result = [...activeMentees];

    const q = search.toLowerCase().trim();
    if (q) {
      result = result.filter(m =>
        `${m.firstName} ${m.lastName} ${m.email}`.toLowerCase().includes(q)
      );
    }

    if (clanFilter !== 'all') {
      result = result.filter(m => m.clanId === clanFilter);
    }

    if (reviewFilter !== 'all') {
      result = result.filter(m => {
        const row = reviewRows?.[m.id];
        switch (reviewFilter) {
          case 'pending':  return !row || row.status !== 'verified';
          case 'verified': return row?.status === 'verified';
          case 'changed':  return Boolean(row?.overridden);
          // "Approved to send" is a property of the clan, not the person: the
          // admin releases a clan, and everyone in it becomes sendable.
          case 'sendable': return (release ?? []).some(c => c.clanId === m.clanId && c.canSend);
          default: return true;
        }
      });
    }

    if (badgeFilter !== 'all') {
      result = result.filter((m: any) => {
        const assignedTier = getEffectiveTier(m);
        return badgeFilter === AWARDED_CERTIFICATES ? Boolean(assignedTier && assignedTier !== NO_CERTIFICATE) : assignedTier === badgeFilter;
      });
    }

    if (sortBy === 'score_desc') {
      result.sort((a: any, b: any) => (b.normalizedScore ?? 0) - (a.normalizedScore ?? 0));
    } else if (sortBy === 'score_asc') {
      result.sort((a: any, b: any) => (a.normalizedScore ?? 0) - (b.normalizedScore ?? 0));
    }

    return result;
  }, [activeMentees, search, badgeFilter, clanFilter, reviewFilter, sortBy, getEffectiveTier, reviewRows, release]);

  /** The clans this mentor actually has people in, for the filter. */
  const rosterClans = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const m of activeMentees) {
      if (m.clanId && !byId.has(m.clanId)) byId.set(m.clanId, { id: m.clanId, name: m.clanName || 'Unnamed clan' });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [activeMentees]);

  const allSelected = filtered.length > 0 && filtered.every(m => selectedIds.has(m.id));
  const inspectedIndex = inspectionQueue.indexOf(inspectedRecipient?.mentee_id);

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
      if (r.mentee_id && aiSelection(r)) {
        aiMap[r.mentee_id] = aiSelection(r);
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

  const isApprovedRecipient = (id: string) => {
    const clanId = reviewRows?.[id]?.clanId || activeMentees.find(m => m.id === id)?.clanId;
    return Boolean(clanId && (release ?? []).some(c => c.clanId === clanId && c.approved));
  };
  const handleTierChange = (menteeId: string, value: string) => {
    if (isApprovedRecipient(menteeId)) { toast.error('Admin approved — only an admin can change this decision.'); return; }
    setMentorTiers(prev => ({ ...prev, [menteeId]: value }));

    const mentee = activeMentees.find(m => m.id === menteeId);
    if (mentee) {
      const match = mentee.tierMatches?.[value] ?? 0;
      setSelectedIds(prev => {
        const next = new Set(prev);
        if (value === NO_CERTIFICATE || match >= 90) {
          next.add(menteeId);
        } else {
          next.delete(menteeId);
        }
        return next;
      });
    }
  };

  /**
   * Seed the roster from the dispatched review, including pending decisions.
   * New AI suggestions do not overwrite the mentor's unsaved edits.
   */
  useEffect(() => {
    if (!reviewRows) return;
    setMentorTiers(prev => {
      const next = { ...prev };
      for (const row of Object.values(reviewRows)) {
        next[row.menteeId] = reviewSelection(row);
      }
      return next;
    });
  }, [reviewRows, loadingQualifications]);

  /**
   * Sign off the selected rows at the grades currently shown in the table.
   *
   * Anything the mentor moved away from the AI's pick is an override, and the
   * server requires a reason for each — so those are held back and asked for
   * rather than failing the whole batch on submit.
   */
  const handleVerify = () => {
    if (!activeTemplateId || !pendingDecisions.length) return;
    const decisions = pendingDecisions;
    if (decisions.some(decision => !decision.finalTier)) {
      toast.error('Choose a certificate for every selected mentee before verifying.');
      return;
    }

    const changed = decisions.filter(d => {
      const row = reviewRows?.[d.menteeId];
      return d.finalTier === NO_CERTIFICATE || d.finalTier !== (row?.aiDecision === 'no_certificate' ? NO_CERTIFICATE : row?.aiTier) || (row?.status === 'verified' && d.finalTier !== reviewSelection(row));
    });

    if (changed.length) {
      setReasonDraft({ decisions, reasons: Object.fromEntries(changed.map(d => [d.menteeId, ''])) });
      return;
    }
    submitVerification(decisions);
  };

  const submitVerification = async (
    decisions: Array<{ menteeId: string; finalTier: string }>,
    reasons: Record<string, string> = {}
  ) => {
    try {
      setVerifying(true);
      await certificatesApi.verifyMany(
        activeTemplateId!,
        decisions.map(d => ({ menteeId: d.menteeId, ...decisionPayload(d.finalTier), reason: reasons[d.menteeId]?.trim() || undefined }))
      );
      toast.success(`Verified ${decisions.length} decision(s). The admin is notified when the clan review is complete.`);
      setReasonDraft(null);
      await loadReview();
    } catch (err) {
      toast.error(extractApiErrorMessage(err, 'Could not save those decisions'));
    } finally {
      setVerifying(false);
    }
  };

  const unchangedPending = useMemo(() => reviewList.filter((row) =>
    row.status === 'pending' && row.aiDecision !== 'no_certificate' && Boolean(row.aiTier)
  ), [reviewList]);

  const acceptUnchangedRecommendations = () => {
    if (!unchangedPending.length) return;
    submitVerification(unchangedPending.map((row) => ({ menteeId: row.menteeId, finalTier: row.aiTier! })));
  };

  const startFocusedReview = () => {
    const pendingIds = reviewList.filter((row) => row.status === 'pending').map((row) => row.menteeId);
    setReviewing(true);
    setReviewFilter('pending');
    setInspectionQueue(pendingIds);
    if (pendingIds[0]) setInspectedRecipient({ mentee_id: pendingIds[0] });
  };

  /**
   * The selected rows whose grade is not already recorded as shown: still
   * pending, or signed off at a tier the mentor has since changed. Re-sending a
   * decision that has not moved writes nothing new and would re-announce the
   * clan as complete, so it is left out and the button counts honestly.
   */
  const pendingDecisions = useMemo(() => {
    if (!reviewRows) return [];
    return Array.from(selectedIds)
      .filter(id => {
        const row = reviewRows[id];
        if (!row || isApprovedRecipient(id)) return false;
        return row.status !== 'verified' || reviewSelection(row) !== getEffectiveTier(id);
      })
      .map(id => ({ menteeId: id, finalTier: getEffectiveTier(id) }));
  }, [selectedIds, reviewRows, getEffectiveTier, release, activeMentees]);

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: activeTemplateId!,
        recipients: recipientsList,
        mentorId: user?.id
      });
      if (res.success) {
        // Report what the server actually did. Some of the selection may
        // already hold this certificate — those are skipped, not sent — and
        // claiming "queued 20" when 18 were duplicates is a lie the mentor
        // only discovers by counting.
        const issued = res.data?.count ?? recipientsList.length;
        const skipped = res.data?.skipped ?? 0;
        const excluded = res.data?.skippedNoCertificate ?? 0;
        if (issued === 0 && !excluded) {
          toast.info(`Everyone selected already has this certificate.`);
        } else {
          toast.success(
            skipped > 0
              ? `Sent ${issued} certificate(s) — ${excluded} no certificate, ${skipped - excluded} already issued`
              : `Sent ${issued} certificate(s)`
          );
        }
        setSelectedIds(new Set());
        setRefreshKey(prev => prev + 1);
        loadReview();
      }
    } catch (err) {
      // The server's own words matter here: a refusal explains that the clan
      // has not been approved yet, which a generic message would throw away.
      toast.error(extractApiErrorMessage(err, 'Failed to issue certificates'));
    } finally {
      setIssuing(false);
    }
  };

  const handleIssue = async () => {
    if (!activeTemplateId || selectedIds.size === 0) {
      toast.error('Select at least one mentee');
      return;
    }

    const recipients = Array.from(selectedIds).map(id => ({
      menteeId: id,
      tier: getEffectiveTier(id)
    }));

    if (recipients.some(recipient => !recipient.tier)) {
      toast.error('Choose a certificate for every selected mentee before issuing.');
      return;
    }

    if (recipients.some(r => r.tier === NO_CERTIFICATE && reviewRows?.[r.menteeId]?.decision !== 'no_certificate')) {
      toast.error('Verify your No certificate decisions before issuing.');
      return;
    }
    const excludedCount = recipients.filter(r => reviewRows?.[r.menteeId]?.decision === 'no_certificate').length;
    if (excludedCount && !(await confirm({ title: 'Exclude recipients with no certificate?', description: `${excludedCount} selected mentee(s) will receive no certificate. Only awarded certificates will be sent.` }))) return;
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
            <h1 className="text-slate-900 mb-2">Certificates</h1>
            <p className="text-slate-600">
              Review your clan&apos;s grades, issue their credentials, and see your own.
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
                  year: 'numeric', month: 'long', day: 'numeric',
                });
                const renderData    = buildRenderData(cert);
                const badgeUrl      = getBadgeUrl(cert);
                const isDownloading = downloadingId === cert.id;

                return (
                  <div
                    key={cert.id}
                    className="group bg-card border border-border rounded-2xl overflow-hidden shadow-2xs hover:shadow-xs transition-all flex flex-col cursor-pointer"
                    onClick={() => setPreviewCert(cert)}
                  >
                    {/* Live preview */}
                    <div className="relative bg-muted overflow-hidden border-b border-border">
                      {cert.template ? (
                        <CertificatePreview
                          template={cert.template}
                          recipientData={renderData}
                          badgeUrlOverride={badgeUrl}
                        />
                      ) : (
                        <div className="aspect-[1.777] flex items-center justify-center text-muted-foreground text-xs">No preview</div>
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                        <span className="bg-white/90 dark:bg-black/90 text-foreground text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1.5 shadow-sm">
                          <Eye className="w-4 h-4 text-brand-500" /> View Certificate
                        </span>
                      </div>
                    </div>

                    <div className="p-4 flex-1 flex flex-col justify-between space-y-4" onClick={e => e.stopPropagation()}>
                      <div className="space-y-1">
                        <h3
                          className="text-xs font-bold text-foreground line-clamp-1 hover:text-brand-500 transition-colors cursor-pointer"
                          onClick={() => setPreviewCert(cert)}
                        >
                          {cert.template?.name || 'Certificate of Completion'}
                        </h3>
                        <div className="space-y-1 pt-1">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                            <Calendar className="w-3 h-3 text-brand-500" /> Issued: {dateStr}
                          </div>
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-semibold">
                            <ShieldCheck className="w-3 h-3 text-brand-500" />
                            Verified by: {cert.mentor ? `${cert.mentor.firstName} ${cert.mentor.lastName}` : 'Pathment Admin'}
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => setPreviewCert(cert)}
                          className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-bold transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" /> View
                        </button>

                        <button
                          onClick={() => handleDownload(cert)}
                          disabled={isDownloading}
                          className="p-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-0.5 disabled:opacity-60"
                          title="Download PNG"
                        >
                          {isDownloading
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Download className="w-3.5 h-3.5" />}
                          <span className="text-[10px] font-bold">PNG</span>
                        </button>

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
            <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-10 bg-card text-center gap-3">
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
                      onClick={() => { setActiveTemplateId(t.id); setReviewing(false); }}
                      className="mt-auto w-full flex items-center justify-center gap-1.5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-sm font-medium transition-colors"
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
            className="fixed inset-0 z-50 flex flex-col items-center justify-start md:justify-center overflow-y-auto bg-black/90 backdrop-blur-md p-4 md:p-6 animate-fade-in"
            onClick={() => setPreviewCert(null)}
          >
            <button
              onClick={() => setPreviewCert(null)}
              className="fixed top-4 right-4 z-50 p-2.5 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/10 shadow-lg cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div
              className="w-full max-w-3xl lg:max-w-4xl flex flex-col items-center gap-4 my-auto py-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Live full-screen preview */}
              <div className="w-full border border-white/10 rounded-2xl overflow-hidden shadow-2xl bg-black/40">
                {previewCert.template ? (
                  <CertificatePreview
                    template={previewCert.template}
                    recipientData={buildRenderData(previewCert)}
                    badgeUrlOverride={getBadgeUrl(previewCert)}
                  />
                ) : (
                  <div className="aspect-[1.777] flex items-center justify-center text-white/40 text-sm">Template not available</div>
                )}
              </div>

              {/* Combined Title & Action Bar */}
              <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-3 bg-white/10 border border-white/15 p-4 rounded-2xl backdrop-blur-md shadow-xl select-none">
                <div className="text-center sm:text-left space-y-0.5">
                  <h2 className="text-white text-sm md:text-base font-bold">{previewCert.template?.name || 'Certificate of Mastery'}</h2>
                  <p className="text-white/70 text-[11px] font-medium font-semibold">
                    Issued by {previewCert.mentor ? `${previewCert.mentor.firstName} ${previewCert.mentor.lastName}` : 'Pathment Admin'}
                  </p>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <button
                    onClick={() => handleDownload(previewCert)}
                    disabled={!!downloadingId}
                    className="flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-white/90 text-black rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-60 cursor-pointer"
                  >
                    {downloadingId === previewCert.id
                      ? <Loader2 className="w-4 h-4 animate-spin" />
                      : <Download className="w-4 h-4" />}
                    Download PNG
                  </button>

                  <a
                    href={getLinkedInShareUrl(previewCert)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-4 py-2 bg-[#0a66c2] hover:bg-[#0b74de] text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 cursor-pointer"
                  >
                    <Linkedin className="w-4 h-4" /> Share
                  </a>
                </div>
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
            onClick={() => { setActiveTemplateId(null); setWorkspaceTab('issue'); setReviewing(false); }}
            className="p-2 rounded-xl border border-border hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h1 className="text-slate-900">{currentTemplate?.name || 'Certificate'}</h1>
            <p className="text-slate-600 text-sm">Review grades, then issue credentials.</p>
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
        <div className="md:col-span-7 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Certificate Template</p>
              <h3 className="text-sm font-bold text-foreground mt-0.5">{currentTemplate?.name || 'Certificate Template'}</h3>
            </div>
            {currentTemplate?.bgImageUrl && (
              <span className="px-2.5 py-1 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-bold">Active</span>
            )}
          </div>
          {currentTemplate?.bgImageUrl && (
            <div className="aspect-[2.4] rounded-2xl overflow-hidden border border-border/80 bg-muted/20">
              <img src={currentTemplate.bgImageUrl} className="w-full h-full object-cover" alt="Preview" />
            </div>
          )}
        </div>

        {}
        <div className="md:col-span-5 bg-card border border-border/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between">
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Selected Summary</p>
            <p className="text-xs text-muted-foreground mb-2">No certificate: {selectedSummary.counts[NO_CERTIFICATE] ?? 0} · excluded from sending</p>
            <div className="flex items-center justify-between p-3 rounded-2xl bg-brand-500/5 border border-brand-500/15 mb-3">
              <span className="text-xs font-bold text-foreground">Total Selected Mentees</span>
              <span className="text-base font-bold text-brand-600 dark:text-brand-400 tabular-nums">{selectedSummary.total}</span>
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
          <div className="bg-card border border-border/80 rounded-2xl p-6 shadow-2xs flex flex-col min-h-[560px]">
            <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Template History Logs</p>
            </div>
            <CertificateHistoryLog templateId={activeTemplateId!} userRole="mentor" />
          </div>
        ) : (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-xs flex flex-col min-h-[580px]">
            {}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-border/60 mb-5 gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold text-foreground uppercase tracking-wider">Review & issue certificates</h3>
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    <TrendingUp className="w-3 h-3" />
                    {activeMentees.length} Active
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground mt-0.5">Review your mentees’ grades and sign off. Send certificates after admin approval.</p>
              </div>

            </div>

              <MenteeEvidenceDrawer
                templateId={activeTemplateId}
                menteeId={inspectedRecipient?.mentee_id ?? null}
                onClose={() => setInspectedRecipient(null)}
                onTierChange={handleTierChange}
                onDecided={loadReview}
                navigation={inspectedIndex >= 0 && inspectionQueue.length > 1 ? {
                  position: inspectedIndex + 1,
                  total: inspectionQueue.length,
                  onPrevious: inspectedIndex > 0
                    ? () => setInspectedRecipient({ mentee_id: inspectionQueue[inspectedIndex - 1] })
                    : undefined,
                  onNext: inspectedIndex < inspectionQueue.length - 1
                    ? () => setInspectedRecipient({ mentee_id: inspectionQueue[inspectedIndex + 1] })
                    : undefined,
                } : undefined}
              />


              {}
              {reviewOpen && (
                <ReviewRoundBanner
                  clans={reviewClans}
                  pending={pendingReviewCount}
                  total={reviewList.length}
                  daysLeft={reviewDaysLeft}
                  reviewing={reviewing}
                  unchangedCount={unchangedPending.length}
                  verifying={verifying}
                  onStartReview={startFocusedReview}
                  onAcceptUnchanged={acceptUnchangedRecommendations}
                />
              )}

              {}
              <RosterFilterBar
                search={search} onSearch={setSearch}
                clan={clanFilter} onClan={setClanFilter}
                clans={rosterClans} clanStates={reviewClans}
                badge={badgeFilter} onBadge={setBadgeFilter}
                criteria={criteria}
                sort={sortBy} onSort={setSortBy}
                review={reviewOpen ? reviewFilter : undefined}
                onReview={reviewOpen ? setReviewFilter : undefined}
              />

              {}
              {selectedIds.size > 0 && filtered.length > 0 && !tableLocked && (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between bg-brand-500/5 dark:bg-brand-500/10 border border-brand-500/20 dark:border-brand-500/30 rounded-xl p-3.5 text-xs mb-5 animate-in fade-in slide-in-from-top-2 duration-200 gap-3">
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
                    <span className="font-semibold text-foreground">
                      <strong className="font-bold">{selectedIds.size}</strong> {selectedIds.size === 1 ? 'mentee' : 'mentees'} selected
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:justify-end">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Set Selected to:</span>
                    {criteria.map((c: any) => {
                      const badgeColor = getTierButtonColor(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => bulkSetBadge(c.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold transition-all border shadow-3xs uppercase tracking-wider ${badgeColor}`}
                        >
                          {getTierName(c.id).replace(/\s*certificate\s*/i, '')}
                        </button>
                      );
                    })}
                    {aiResults && aiResults.length > 0 && (
                      <button
                        type="button"
                        onClick={resetToAIRecommendations}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold bg-brand-600 hover:bg-brand-700 text-white shadow-3xs uppercase tracking-wider transition-colors border border-transparent"
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
                  onInspectRecipient={(recipient) => {
                    setInspectionQueue(filtered.map((row) => row.id));
                    setInspectedRecipient(recipient);
                  }}
                  loading={loadingQualifications}
                  getTierName={getTierName}
                  userRole="mentor"
                  recipientTypeLabel="Mentee"
                  emptyMessage={search ? 'No mentees match your search.' : 'No active mentees found.'}
                  reviewRows={reviewRows ?? undefined}
                  reviewRoundOpen={reviewOpen}
                  locked={tableLocked}
                  isRecipientLocked={isApprovedRecipient}
                />
              </div>

              {}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4 mt-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground font-semibold">
                  <Users className="w-4 h-4 text-brand-500" />
                  <span>
                    <span className="text-foreground font-bold">{selectedIds.size}</span> / {filtered.length} selected
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {/* Unlocking the grades and sending them out are separate
                      controls, because they are separate decisions and a clan
                      that is fully signed off still needs to be able to send. */}
                  {reviewOpen && (
                    reviewing ? (
                      <button
                        type="button"
                        onClick={() => setReviewing(false)}
                        className="flex items-center gap-1.5 rounded-xl border border-border bg-card px-3.5 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
                      >
                        <Lock className="w-3.5 h-3.5" /> Lock grades
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setReviewing(true)}
                        className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2.5 text-xs font-bold transition-colors ${
                          pendingReviewCount > 0
                            ? 'border-amber-500/40 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20'
                            : 'border-border bg-card text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {pendingReviewCount > 0
                          ? `Review ${pendingReviewCount} grade${pendingReviewCount === 1 ? '' : 's'}`
                          : 'Review grades again'}
                      </button>
                    )
                  )}

                  {reviewing ? (
                    <button
                      type="button"
                      onClick={handleVerify}
                      disabled={verifying || pendingDecisions.length === 0}
                      title={pendingDecisions.length === 0
                        ? 'Every selected grade is already signed off at the badge shown.'
                        : undefined}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all shadow-sm"
                    >
                      {verifying ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                      {pendingDecisions.length === 0
                        ? 'All selected signed off'
                        : `Verify ${pendingDecisions.length} grade${pendingDecisions.length === 1 ? '' : 's'}`}
                    </button>
                  ) : canIssue ? (
                    /* Sending is unlocked by the admin approving the clan, after
                       its grades are verified. Showing the button regardless
                       just produced a 403 — the mentor pressed it and got an
                       error rather than an explanation. */
                    <button
                      onClick={handleIssue}
                      disabled={issuing || selectedIds.size === 0 || selectedSummary.counts[NO_CERTIFICATE] === selectedIds.size}
                      className="flex items-center gap-1.5 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all shadow-sm"
                    >
                      {issuing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                      Issue Certificates
                    </button>
                  ) : (
                    <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/5 px-3.5 py-2.5">
                      <Clock className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                      <span className="text-[11px] font-semibold text-foreground">
                        {pendingReviewCount > 0
                          ? `${pendingReviewCount} grade${pendingReviewCount === 1 ? '' : 's'} still need your sign-off.`
                          : 'Signed off — waiting for an admin to approve your clan.'}
                      </span>
                    </div>
                  )}
                </div>
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
            These are the criteria for each certificate tier. Use them alongside each mentee’s evidence when reviewing grades.
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
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Keywords / Tech Stack</p>
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
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Hard Constraints (AI cannot bypass)</p>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[10px] text-muted-foreground font-semibold">Min Score</p>
                              <p className="text-xs font-bold text-foreground">{minScore > 0 ? `${minScore}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[10px] text-muted-foreground font-semibold">Max Blockers</p>
                              <p className="text-xs font-bold text-foreground">{maxB}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[10px] text-muted-foreground font-semibold">Min Completion</p>
                              <p className="text-xs font-bold text-foreground">{minCompletion > 0 ? `${minCompletion}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center">
                              <p className="text-[10px] text-muted-foreground font-semibold">Min On-Time</p>
                              <p className="text-xs font-bold text-foreground">{minOnTime > 0 ? `${minOnTime}%` : '—'}</p>
                            </div>
                            <div className="p-2 rounded-xl bg-muted/30 text-center col-span-2">
                              <p className="text-[10px] text-muted-foreground font-semibold">Min Avg Rating</p>
                              <p className="text-xs font-bold text-foreground">{minRating > 0 ? `${minRating} / 5` : '—'}</p>
                            </div>
                          </div>
                        </div>
                        {customRule && (
                          <div className="space-y-1">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Custom AI Rule</p>
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

      {/* Changing a grade is a mentor overruling the evidence. The admin
          reading this in a month — and the mentor themselves — need to know
          why, so the reason is asked for rather than merely invited. */}
      <Drawer
        open={reasonDraft !== null}
        onClose={() => setReasonDraft(null)}
        title="Explain these certificate decisions"
        subtitle="A reason is required for No certificate and changed decisions."
        width="md"
      >
        {reasonDraft && (
          <div className="space-y-5">
            {Object.keys(reasonDraft.reasons).map(menteeId => {
              const mentee = activeMentees.find(m => m.id === menteeId);
              const row = reviewRows?.[menteeId];
              const finalTier = reasonDraft.decisions.find(d => d.menteeId === menteeId)?.finalTier ?? '';
              return (
                <div key={menteeId} className="space-y-2 rounded-2xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      {mentee ? `${mentee.firstName} ${mentee.lastName}` : 'Mentee'}
                    </span>
                    <span className="text-[10px] font-semibold text-muted-foreground line-through">
                      {getTierName(row?.aiDecision === 'no_certificate' ? NO_CERTIFICATE : row?.aiTier || '')}
                    </span>
                    <span aria-hidden className="text-[10px] font-bold text-amber-500">&rarr;</span>
                    <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-600">
                      {getTierName(finalTier)}
                    </span>
                  </div>
                  <textarea
                    rows={2}
                    value={reasonDraft.reasons[menteeId]}
                    onChange={e => setReasonDraft(d => d && ({
                      ...d, reasons: { ...d.reasons, [menteeId]: e.target.value }
                    }))}
                    placeholder="e.g. mentored two juniors all season on top of their own track"
                    className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                </div>
              );
            })}

            <div className="flex items-center gap-2 border-t border-border pt-4">
              <button
                type="button"
                onClick={() => submitVerification(reasonDraft.decisions, reasonDraft.reasons)}
                disabled={verifying || Object.values(reasonDraft.reasons).some(r => !r.trim())}
                className="flex items-center gap-1.5 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed"
              >
                {verifying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                Verify {reasonDraft.decisions.length} grade{reasonDraft.decisions.length === 1 ? '' : 's'}
              </button>
              <button
                type="button"
                onClick={() => setReasonDraft(null)}
                disabled={verifying}
                className="rounded-xl border border-border px-4 py-2.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              {Object.values(reasonDraft.reasons).some(r => !r.trim()) && (
                <span className="text-[10px] font-semibold text-amber-600">Every change needs a reason.</span>
              )}
            </div>
          </div>
        )}
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

/**
 * Where this round stands, in the mentor's own terms.
 *
 * A mentor who has finished reviewing and sees no send button will assume
 * something is broken. It is not — the admin releases each clan once the grades
 * are checked, and the mentor sends after that. Saying so is this strip's whole
 * job, and it says it above the table the work happens in.
 */
function ReviewRoundBanner({
  clans, pending, total, daysLeft, reviewing, unchangedCount, verifying, onStartReview, onAcceptUnchanged,
}: {
  clans: ReviewerClanState[];
  pending: number;
  total: number;
  daysLeft: number | null;
  reviewing: boolean;
  unchangedCount: number;
  verifying: boolean;
  onStartReview: () => void;
  onAcceptUnchanged: () => void;
}) {
  const done = pending === 0;
  const verified = Math.max(0, total - pending);
  const percent = total ? Math.round((verified / total) * 100) : 0;
  const tone = reviewing
    ? 'border-brand-500/30 bg-brand-500/5'
    : done
      ? 'border-emerald-500/25 bg-emerald-500/5'
      : 'border-amber-500/30 bg-amber-500/5';

  return (
    <div className={`mb-5 space-y-2 rounded-2xl border px-4 py-3 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2">
        {reviewing
          ? <Edit3 className="w-4 h-4 shrink-0 text-brand-500" />
          : done
            ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500" />
            : <Lock className="w-4 h-4 shrink-0 text-amber-500" />}
        <span className="text-xs font-bold text-foreground">
          {reviewing
            ? 'Grades unlocked — change any badge below, then verify the ones you have checked'
            : done
              ? `All ${total} grades signed off`
              : `${pending} of ${total} grades need your review`}
        </span>
        {!reviewing && !done && (
          <span className="text-[11px] text-muted-foreground">
            · badges locked until you open them for review
          </span>
        )}
        {daysLeft !== null && !done && (
          <span className={`inline-flex items-center gap-1 text-[11px] font-semibold ${
            daysLeft < 0 ? 'text-red-600' : daysLeft <= 2 ? 'text-amber-600' : 'text-muted-foreground'
          }`}>
            <Clock className="w-3 h-3" />
            {daysLeft < 0
              ? `${Math.abs(daysLeft)} day${Math.abs(daysLeft) === 1 ? '' : 's'} overdue`
              : `${daysLeft} day${daysLeft === 1 ? '' : 's'} left`}
          </span>
        )}
      </div>

      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-brand-500 transition-[width]" style={{ width: `${percent}%` }} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{verified} complete · {pending} remaining · {percent}%</span>
        {!done && (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={onStartReview} className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">
              Review next pending
            </button>
            {unchangedCount > 0 && (
              <button type="button" onClick={onAcceptUnchanged} disabled={verifying} className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 font-semibold text-foreground hover:border-brand-500/40 disabled:opacity-50">
                {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                Sign off {unchangedCount} unchanged
              </button>
            )}
          </div>
        )}
      </div>

      <ul className="grid gap-2 pt-1 sm:grid-cols-2">
        {clans.map(clan => (
          <li key={clan.clanId} className="rounded-xl border border-border/70 bg-card p-3 text-[11px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-semibold text-foreground">{clan.clanName || 'Your clan'}</span>
              <span className="text-muted-foreground">
              {clan.pending === 0
                ? `all ${clan.verified} signed off`
                : `${clan.pending} of ${clan.pending + clan.verified} outstanding`}
              </span>
            </div>
            <div className="mt-2">
            {clan.canSend ? (
              <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-500/10 px-2 py-0.5 font-bold text-emerald-600">
                <CheckCircle2 className="w-2.5 h-2.5" /> Approved — you can send
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                <Clock className="w-2.5 h-2.5" /> {clan.pending > 0 ? 'Needs mentor sign-off' : 'Waiting on admin approval'}
              </span>
            )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
