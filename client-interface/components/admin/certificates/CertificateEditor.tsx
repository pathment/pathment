'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft, Save, Plus, Trash2, Move, Type, Edit,
  Image as ImageIcon, AlignLeft, AlignCenter, AlignRight,
  Bold, Loader2, ZoomIn, ZoomOut, Award,
  CheckCircle, Users, Trash, Search, Send, Info,
  ChevronDown, X, Sparkles, CheckCircle2, XCircle, Edit3
} from 'lucide-react';
import Link from 'next/link';
import { certificatesApi, CertificateElement, CertificateTemplate } from '@/lib/services/certificates-api';
import { FileDragDrop } from '@/components/shared/FileDragDrop';
import { DuplicateWarnModal } from '@/components/shared';
import { Drawer } from '@/components/shared/Drawer';
import { orgRoadmapApi } from '@/lib/services/roadmap-api';
import { programsApi } from '@/lib/services/program-api';
import { getTierButtonColor, getTierIconColor } from '@/lib/utils/certificates';
import { AIDetailDrawer, AIEvaluationBanner, CriteriaTable, RecipientRosterTable } from '@/components/certificates/shared';
import CertificateHistoryLog from './CertificateHistoryLog';
import {
  TierCriteria, FONTS, DYNAMIC_SHORTCUTS, BACKGROUND_PRESETS,
  DEFAULT_CRITERIA, GOOGLE_FONTS_URL
} from './certificate-constants';
import { TierCriteriaModal } from './TierCriteriaModal';
import { useAIEvaluationProgress, useRecipientSelection } from './hooks';



interface CertificateEditorProps {
  templateId?: string; 
}

export default function CertificateEditor({ templateId }: CertificateEditorProps) {
  const router = useRouter();
  const canvasRef = useRef<HTMLDivElement>(null);

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const [uploadingBg, setUploadingBg] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingTierBadge, setUploadingTierBadge] = useState(false);

  const [zoom, setZoom] = useState(1.0);

  const [name, setName] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('https://res.cloudinary.com/djctfho31/image/upload/v1724683050/pathment/templates/default-cert-bg.jpg');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [isPresetsDrawerOpen, setIsPresetsDrawerOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoConfig, setLogoConfig] = useState({ xPercent: 50, yPercent: 20, widthPercent: 12 });

  const [elements, setElements] = useState<CertificateElement[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | 'logo' | null>(null);

  const [criteria, setCriteria] = useState<TierCriteria[]>(DEFAULT_CRITERIA);

  const [qualifiedData, setQualifiedData] = useState<Record<string, any[]>>({});
  const [loadingQualifications, setLoadingQualifications] = useState(false);

  const [aiDetailMentee, setAiDetailMentee] = useState<any | null>(null);
  const [expandedAIRows, setExpandedAIRows] = useState<Set<string>>(new Set());

  const {
    aiResults, setAiResults, aiRanAt, setAiRanAt, runningAI,
    aiProgressCount, aiTotalCount, aiEvalMap, runAIEvaluation
  } = useAIEvaluationProgress({
    templateId,
    onSingleProgress: (result) => {
      setAdminTiers(prev => ({ ...prev, [result.mentee_id]: result.certificate_tier }));
      const menteeObj = [...recipientMenteesList, ...recipientMentorsList, ...recipientPausedList].find(m => m.id === result.mentee_id);
      if (menteeObj && !menteeObj.isPaused) {
        setSelectedMenteeIds(prev => new Set(prev).add(result.mentee_id));
      }
    },
    onBatchComplete: (results) => {
      const newTiers: Record<string, string> = {};
      const autoSelected = new Set<string>();
      const pausedSet = new Set(recipientPausedList.map(m => m.id));
      for (const r of results) {
        if (r.mentee_id) {
          newTiers[r.mentee_id] = r.certificate_tier;
          if (!pausedSet.has(r.mentee_id)) {
            autoSelected.add(r.mentee_id);
          }
        }
      }
      setAdminTiers(prev => ({ ...prev, ...newTiers }));
      setSelectedMenteeIds(autoSelected);
    }
  });

  const {
    recipientSearch, setRecipientSearch,
    badgeFilter, setBadgeFilter,
    sortBy, setSortBy,
    recipientType, setRecipientType,
    selectedMenteeIds, setSelectedMenteeIds,
    assignedTiers: adminTiers, setAssignedTiers: setAdminTiers,
    recipientMenteesList, recipientMentorsList, recipientPausedList, filtered, allSelected,
    selectedSummary, toggleAll, toggleOne, handleTierChange,
    bulkSetBadge: bulkSetBadgeHook, resetToAIRecommendations: resetToAIRecommendationsHook
  } = useRecipientSelection({ criteria, qualifiedData, aiResults: aiEvalMap });

  const [availableTasks, setAvailableTasks] = useState<Array<{ id: string; title: string }>>([]);
  const [allRoadmaps, setAllRoadmaps] = useState<any[]>([]);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProgramId, setSelectedProgramId] = useState<string>('');

  const [issuing, setIssuing] = useState(false);
  const [sendingToMentors, setSendingToMentors] = useState(false);
  const [isRulesDrawerOpen, setIsRulesDrawerOpen] = useState(false);
  const [criteriaTasks, setCriteriaTasks] = useState<Array<{ id: string; title: string }>>([]);

  const handleProgramChange = (val: string) => {
    if (criteria.some(c => (c.keywords?.length ?? 0) > 0)) {
      if (window.confirm("Changing the program will clear the keyword criteria. Do you want to proceed?")) {
        setSelectedProgramId(val);
        setCriteria(prev => prev.map(c => ({ ...c, keywords: [] })));
        setAiResults([]);
        setAiRanAt(null);
      }
    } else {
      setSelectedProgramId(val);
    }
  };

  const getTierName = (tierId: string) => {
    if (!tierId || typeof tierId !== 'string') return '';
    const match = criteria.find(c => c.id === tierId);
    return match ? match.name : tierId.charAt(0).toUpperCase() + tierId.slice(1);
  };

  const bulkSetBadge = (badge: string) => bulkSetBadgeHook(badge, getTierName);
  const resetToAIRecommendations = () => resetToAIRecommendationsHook(aiResults);

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



  const [isTierModalOpen, setIsTierModalOpen] = useState(false);
  const [editingTier, setEditingTier] = useState<TierCriteria | null>(null);


  useEffect(() => {
    const loadData = async () => {
      try {
        const [roadmapRes, programsRes] = await Promise.all([
          orgRoadmapApi.list(),
          programsApi.getAll({ limit: 100 })
        ]);

        if (roadmapRes.data && Array.isArray(roadmapRes.data.roadmaps)) {
          setAllRoadmaps(roadmapRes.data.roadmaps);
        }

        if (programsRes.success && programsRes.data) {
          setPrograms(programsRes.data);
          if (programsRes.data.length > 0 && !templateId) {
            setSelectedProgramId(programsRes.data[0].id);
          }
        }
      } catch (err) {
        console.error('Failed to load initial data:', err);
      }
    };
    loadData();
  }, [templateId]);

  useEffect(() => {
    if (!selectedProgramId || allRoadmaps.length === 0) {
      setAvailableTasks([]);
      return;
    }

    const flat: Array<{ id: string; title: string }> = [];
    const programRoadmaps = allRoadmaps.filter((r: any) => r.programId === selectedProgramId);
    programRoadmaps.forEach((rm: any) => {
      if (Array.isArray(rm.steps)) {
        rm.steps.forEach((step: any) => {
          if (step.id && step.title) {
            if (!flat.some(f => f.id === step.id)) {
              flat.push({ id: step.id, title: step.title });
            }
          }
        });
      }
    });
    setAvailableTasks(flat);
  }, [selectedProgramId, allRoadmaps]);

  useEffect(() => {
    if (!templateId) return;

    const fetchTemplate = async () => {
      try {
        setFetching(true);
        const res = await certificatesApi.getTemplate(templateId);
        if (res.success && res.data) {
          const t = res.data;
          setName(t.name);
          if (t.programId) {
            setSelectedProgramId(t.programId);
          }
          const bg = t.bgImageUrl || '';
          setBgImageUrl(bg);
          const matchPreset = BACKGROUND_PRESETS.find(p => bg === p.imageUrl);
          if (matchPreset) {
            setActivePresetId(matchPreset.id);
          }
          setLogoUrl(t.logoUrl || '');
          if (t.logoConfig) setLogoConfig(t.logoConfig);
          setElements(t.config || []);
          if (Array.isArray(t.criteria)) {
            const loaded = t.criteria.map((c: any, fallbackIdx: number) => ({
              id:                c.id,
              name:              c.name,
              priority:          c.priority ?? fallbackIdx + 1,
              badgeUrl:          c.badgeUrl ?? '',
              keywords:          Array.isArray(c.keywords) ? c.keywords : [],
              minScorePercent:   c.minScorePercent ?? null,
              maxOpenBlockers:   c.maxOpenBlockers ?? null,
              minCompletionRate: c.minCompletionRate ?? null,
              minOnTimeRate:     c.minOnTimeRate ?? null,
              minAvgRating:      c.minAvgRating ?? null,
              minAttendanceRate: c.minAttendanceRate ?? null,
              customRule:        c.customRule ?? ''
            }));
            loaded.sort((a: any, b: any) => (a.priority ?? Infinity) - (b.priority ?? Infinity));
            setCriteria(loaded);
          }
          if (t.aiEvaluation?.results) {
            setAiResults(t.aiEvaluation.results);
            setAiRanAt(t.aiEvaluation.ranAt ?? null);
          }
        }
      } catch (err: any) {
        toast.error('Failed to load certificate template');
        console.error(err);
      } finally {
        setFetching(false);
      }
    };

    fetchTemplate();
  }, [templateId]);

  useEffect(() => {
    if (!templateId || !selectedProgramId) return;

    const fetchQualifications = async () => {
      try {
        setLoadingQualifications(true);
        const res = await certificatesApi.getQualification(templateId, { programId: selectedProgramId });
        if (res.success && res.data) {
          setQualifiedData(res.data);
          if (res.criteriaTasks) {
            setCriteriaTasks(res.criteriaTasks);
          } else {
            setCriteriaTasks([]);
          }

          const activeList: any[] = [];
          const seenIds = new Set<string>();

          criteria.forEach(c => {
            const list = res.data[c.id] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          Object.keys(res.data).forEach(key => {
            if (key === 'mentors' || key === 'paused') return;
            const list = res.data[key] || [];
            list.forEach((m: any) => {
              if (!seenIds.has(m.id)) {
                seenIds.add(m.id);
                activeList.push(m);
              }
            });
          });

          const mentorsList = res.data.mentors ?? [];

          const initialTiers: Record<string, string> = {};
          const autoSelected = new Set<string>();

          activeList.forEach(m => {
            const defTier = m.assignedTier || aiEvalMap[m.id]?.certificate_tier || criteria[criteria.length - 1]?.id || 'participation';
            initialTiers[m.id] = defTier;
            autoSelected.add(m.id);
          });

          const mentorDefaultTier = criteria[criteria.length - 1]?.id || 'participation';
          mentorsList.forEach(m => {
            initialTiers[m.id] = mentorDefaultTier;
            autoSelected.add(m.id);
          });

          setAdminTiers(initialTiers);
          setSelectedMenteeIds(autoSelected);
        }
      } catch (err) {
        console.error('Failed to calculate qualification counts:', err);
      } finally {
        setLoadingQualifications(false);
      }
    };

    fetchQualifications();
  }, [templateId, selectedProgramId, refreshKey]);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDragId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let xPercent = Math.round((x / rect.width) * 100);
    let yPercent = Math.round((y / rect.height) * 100);

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    if (activeDragId === 'logo') {
      setLogoConfig(prev => ({ ...prev, xPercent, yPercent }));
    } else {
      setElements(prev => prev.map(el =>
        el.id === activeDragId ? { ...el, xPercent, yPercent } : el
      ));
    }
  };

  const handleMouseUp = () => {
    setActiveDragId(null);
  };

  const handleBgUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingBg(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setBgImageUrl(res.url);
        setActivePresetId(null);
        toast.success('Background image uploaded successfully!');
      }
    } catch (err: any) {
      toast.error('Failed to upload background image');
    } finally {
      setUploadingBg(false);
    }
  };

  const applyPresetBackground = (presetId: string, imageUrl: string) => {
    try {
      setBgImageUrl(imageUrl);
      setActivePresetId(presetId);
      toast.success('Preset layout applied! Remember to click "Save Template" to persist your changes.');
    } catch (err) {
      console.error(err);
      toast.error('Failed to apply preset background');
    }
  };

  const handleLogoUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingLogo(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setLogoUrl(res.url);
        toast.success('Logo uploaded successfully!');
      }
    } catch (err: any) {
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(false);
    }
  };

  const addVariableElement = (key: string, label: string) => {
    if (elements.some(el => el.dynamicKey === key)) {
      const match = elements.find(el => el.dynamicKey === key);
      if (match) setSelectedId(match.id);
      toast.info(`${label} variable is already added to workspace`);
      return;
    }

    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'dynamic',
      dynamicKey: key as any,
      text: `{{${key}}}`,
      xPercent: 50,
      yPercent: 40 + elements.length * 5,
      fontSizePercent: 3.0,
      color: '#1e293b',
      fontWeight: 'bold',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };

    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success(`Added ${label} variable to template canvas!`);
  };

  const addStaticTextElement = () => {
    const id = `text-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'static',
      text: 'Double click to edit text',
      xPercent: 50,
      yPercent: 50,
      fontSizePercent: 2.5,
      color: '#1e293b',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addBadgeElement = () => {
    if (elements.some(el => el.type === 'badge')) {
      toast.warning('A dynamic badge element is already added to canvas layout.');
      return;
    }
    const id = `badge-${Date.now()}`;
    const newEl: CertificateElement = {
      id,
      type: 'badge',
      text: 'Badge Layer',
      xPercent: 50,
      yPercent: 75,
      widthPercent: 12,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center',
      fontStyle: 'Montserrat, sans-serif'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
  };

  const addPathmentLogoElement = () => {
    const id = `img-pathment-${Date.now()}`;
    const origin = (process.env.CLIENT_URL || 'http://localhost:3000').split(',')[0].replace(/\/$/, '');
    const newEl: CertificateElement = {
      id,
      type: 'image',
      text: 'Pathment Logo',
      xPercent: 50,
      yPercent: 30,
      widthPercent: 12,
      imageUrl: `${origin}/icon-192.png`,
      fontSizePercent: 1,
      color: '#000000',
      fontWeight: 'normal',
      alignment: 'center'
    };
    setElements(prev => [...prev, newEl]);
    setSelectedId(id);
    toast.success('Pathment Logo added to canvas!');
  };

  const handleCustomImageUpload = async (files: File[]) => {
    if (files.length === 0) return;
    const file = files[0];
    try {
      toast.info('Uploading custom image...');
      const res = await certificatesApi.uploadAsset(file);
      if (res.success && res.url) {
        const id = `img-custom-${Date.now()}`;
        const newEl: CertificateElement = {
          id,
          type: 'image',
          text: 'Custom Image',
          xPercent: 50,
          yPercent: 40,
          widthPercent: 15,
          imageUrl: res.url,
          fontSizePercent: 1,
          color: '#000000',
          fontWeight: 'normal',
          alignment: 'center'
        };
        setElements(prev => [...prev, newEl]);
        setSelectedId(id);
        toast.success('Custom image uploaded and added to canvas!');
      }
    } catch (err: any) {
      toast.error('Failed to upload custom image');
    }
  };

  const deleteElement = (id: string) => {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedElement = (key: keyof CertificateElement, val: any) => {
    if (!selectedId) return;
    setElements(prev => prev.map(el =>
      el.id === selectedId ? { ...el, [key]: val } : el
    ));
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('Please enter a template name');
      return;
    }
    if (!selectedProgramId) {
      toast.error('Please select a program');
      return;
    }

    try {
      setLoading(true);
      const payload: Partial<CertificateTemplate> = {
        name: name.trim(),
        bgImageUrl,
        logoUrl: undefined,
        logoConfig: undefined,
        criteria,
        config: elements,
        programId: selectedProgramId
      };

      let res;
      if (templateId) {
        res = await certificatesApi.updateTemplate(templateId, payload);
      } else {
        res = await certificatesApi.createTemplate(payload);
      }

      if (res.success && res.data) {
        toast.success(templateId ? 'Template updated successfully' : 'Template created successfully');
        setRefreshKey(prev => prev + 1);
        if (!templateId) {
          router.push(`/admin/certificates/${res.data.id}/edit`);
        }
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to save template configuration');
    } finally {
      setLoading(false);
    }
  };

  const executeIssuance = async (recipientsList: Array<{ menteeId: string; tier: string }>) => {
    try {
      setIssuing(true);
      const res = await certificatesApi.issueCertificates({
        templateId: templateId!,
        recipients: recipientsList
      });
      if (res.success) {
        toast.success(`Successfully enqueued ${recipientsList.length} certificate(s) for rendering!`);
        setSelectedMenteeIds(new Set());
        setRefreshKey(prev => prev + 1);
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to issue certificates');
    } finally {
      setIssuing(false);
    }
  };

  const handleIssue = async () => {
    if (selectedMenteeIds.size === 0) {
      toast.error('Please select at least one mentee to issue certificates');
      return;
    }

    const defaultTier = criteria[criteria.length - 1]?.id ?? 'participation';
    const recipients = Array.from(selectedMenteeIds).map(id => ({
      menteeId: id,
      tier: adminTiers[id] ?? defaultTier
    }));

    const allMentees: any[] = [];
    const seenIds = new Set<string>();
    Object.keys(qualifiedData).forEach(key => {
      if (key === 'mentors' || key === 'paused') return;
      (qualifiedData[key] ?? []).forEach((m: any) => {
        if (!seenIds.has(m.id)) { seenIds.add(m.id); allMentees.push(m); }
      });
    });
    const allMentors: any[] = qualifiedData.mentors ?? [];
    const allActiveRecipients = [...allMentees, ...allMentors];

    const duplicateInstances = recipients.filter(r => {
      const m = allActiveRecipients.find(item => item.id === r.menteeId);
      return m && m.issuedTiers && m.issuedTiers.includes(r.tier);
    }).map(r => {
      const m = allActiveRecipients.find(item => item.id === r.menteeId);
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

  const handleSendToMentors = async () => {
    if (!templateId || !selectedProgramId) return;
    try {
      setSendingToMentors(true);
      const res = await certificatesApi.sendToMentors(templateId, selectedProgramId);
      if (res.success) toast.success(res.message);
    } catch (err: any) {
      toast.error(err.message || 'Failed to send to mentors');
    } finally {
      setSendingToMentors(false);
    }
  };

  const openTierModal = (tier?: TierCriteria) => {
    setEditingTier(tier || null);
    setIsTierModalOpen(true);
  };

  const handleSaveTier = (savedFields: Partial<TierCriteria>, editingTierId?: string) => {
    setCriteria(prev => {
      if (editingTierId) {
        return prev.map(t => t.id === editingTierId ? { ...t, ...savedFields } : t);
      } else {
        const newTier: TierCriteria = {
          id: `tier-${Date.now()}`,
          name: savedFields.name || 'New Tier',
          priority: prev.length + 1,
          ...savedFields,
        };
        return [...prev, newTier];
      }
    });
  };

  const handleRunAIEvaluation = () => {
    if (templateId) runAIEvaluation(templateId);
  };

  const deleteTier = (tierId: string) => {
    setCriteria(prev => prev.filter(t => t.id !== tierId));
    toast.success('Certificate type removed.');
  };

  const selectedElement = elements.find(el => el.id === selectedId) || null;


  if (fetching) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3">
        <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
        <span className="text-xs text-muted-foreground font-semibold">Loading certificate builder...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8 select-none" onMouseUp={handleMouseUp}>
      <style dangerouslySetInnerHTML={{
        __html: `@import url('${GOOGLE_FONTS_URL}');`
      }} />

      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-5 border-b border-border/60 pb-5">
        {}
        <div className="space-y-2 flex-1 max-w-2xl">
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
            <span>Certificates</span>
            <span className="text-muted-foreground/45">&gt;</span>
            <span className="text-brand-600">{templateId ? 'Edit Certificate Cycle' : 'Create Certificate Cycle'}</span>
          </div>
          <div className="relative">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter Template / Cycle Name..."
              className="w-full text-2xl font-extrabold text-foreground bg-transparent border-0 focus:ring-0 focus:outline-none placeholder:text-muted-foreground/30 transition-all p-0 focus:border-b focus:border-brand-500 pb-1"
            />
          </div>
          <p className="text-xs text-muted-foreground font-medium">Create, customize and issue certificates for this fellowship cycle.</p>
        </div>

        {}
        <div className="flex items-center gap-3 flex-wrap md:justify-end shrink-0">
          {}
          <div className="relative inline-flex items-center shadow-3xs rounded-xl border border-border/80 bg-background hover:bg-muted/30 transition-colors">
            <span className="pl-3.5 pr-1.5 text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider select-none border-r border-border/60 py-2">
              Program
            </span>
            <select
              value={selectedProgramId}
              onChange={(e) => handleProgramChange(e.target.value)}
              disabled={!!templateId}
              className="appearance-none pr-8 pl-3 py-2 text-xs font-bold text-foreground bg-transparent cursor-pointer focus:outline-none min-w-[140px] max-w-[200px] disabled:opacity-70 disabled:cursor-not-allowed"
            >
              <option value="" disabled className="text-foreground bg-card">Select Program</option>
              {programs.map(p => (
                <option key={p.id} value={p.id} className="text-foreground bg-card">{p.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2.5 w-3 h-3 pointer-events-none text-muted-foreground/60" />
          </div>

          <Link
            href="/admin/certificates"
            className="flex items-center gap-1.5 px-4 py-2 border border-border/80 hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all shadow-3xs"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back
          </Link>

          <button
            onClick={handleSave}
            disabled={loading}
            className="flex items-center gap-2 px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="animate-spin w-4 h-4" /> : <Save className="w-4 h-4" />}
            Save Template
          </button>
        </div>
      </div>

      {}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-start gap-3.5 border-b border-border pb-4">
          <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">
            1
          </div>
          <div>
            <h2 className="text-sm font-bold text-foreground">Certificate Template</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Upload your certificate background and design placement layers.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {}
          <div className="xl:col-span-8 flex flex-col items-center gap-4">
            {}
            <div className="flex items-center gap-2 bg-muted/40 border border-border px-3 py-1.5 rounded-2xl text-[10px] font-bold text-muted-foreground">
              <button type="button" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))} className="p-1 hover:bg-muted text-foreground rounded-lg transition-colors">
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="min-w-[36px] text-center">{Math.round(zoom * 100)}%</span>
              <button type="button" onClick={() => setZoom(z => Math.min(1.5, z + 0.1))} className="p-1 hover:bg-muted text-foreground rounded-lg transition-colors">
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
              <div className="h-3 w-px bg-border mx-1" />
              <button type="button" onClick={() => setZoom(1.0)} className="px-1.5 py-0.5 hover:bg-muted text-foreground rounded-lg transition-colors text-[9px]">
                Reset
              </button>
            </div>

            {}
            <div className="w-full bg-muted/30 border border-border rounded-3xl p-6 flex items-center justify-center overflow-auto min-h-[480px]">
              <div
                ref={canvasRef}
                onMouseMove={handleMouseMove}
                style={{
                  width: '848px',
                  height: '600px',
                  backgroundImage: bgImageUrl ? `url('${bgImageUrl}')` : 'none',
                  backgroundSize: '100% 100%',
                  backgroundPosition: 'center',
                  backgroundColor: '#ffffff',
                  transform: `scale(${zoom})`,
                  transformOrigin: 'center center',
                  transition: 'transform 0.1s ease-out'
                }}
                className="relative rounded-lg shadow-lg overflow-hidden cursor-default select-none border border-border shrink-0"
              >
                {}
                {elements.map((el) => {
                  const isSelected = selectedId === el.id;

                  if (el.type === 'badge') {
                    const badgePreview = criteria.find(t => t.badgeUrl)?.badgeUrl || 'https://res.cloudinary.com/djctfho31/image/upload/v1724716800/pathment/placeholders/default-badge.png';
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                          setActiveDragId(el.id);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${el.xPercent}%`,
                          top: `${el.yPercent}%`,
                          width: `${el.widthPercent || 12}%`,
                          transform: 'translate(-50%, -50%)',
                          boxSizing: 'border-box'
                        }}
                        className={`group cursor-move p-1 border transition-all rounded ${isSelected
                          ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500 shadow-md'
                          : 'border-transparent hover:border-brand-500/30'
                          }`}
                      >
                        <img src={badgePreview} className="w-full h-auto pointer-events-none" alt="Badge Preview" />
                        <div className="hidden group-hover:flex absolute -top-5 left-1/2 -translate-x-1/2 bg-brand-600 text-[8px] text-white px-1 py-0.5 rounded shadow-sm gap-1 items-center font-bold whitespace-nowrap">
                          <Move className="w-3 h-3" /> Badge Component
                        </div>
                      </div>
                    );
                  }

                  if (el.type === 'image') {
                    return (
                      <div
                        key={el.id}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setSelectedId(el.id);
                          setActiveDragId(el.id);
                        }}
                        style={{
                          position: 'absolute',
                          left: `${el.xPercent}%`,
                          top: `${el.yPercent}%`,
                          width: `${el.widthPercent || 12}%`,
                          transform: 'translate(-50%, -50%)',
                          boxSizing: 'border-box'
                        }}
                        className={`group cursor-move p-1 border transition-all rounded ${isSelected
                          ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500 shadow-md'
                          : 'border-transparent hover:border-brand-500/30'
                          }`}
                      >
                        <img src={el.imageUrl} className="w-full h-auto pointer-events-none" alt={el.text} />
                        <div className="hidden group-hover:flex absolute -top-5 left-1/2 -translate-x-1/2 bg-brand-600 text-[8px] text-white px-1 py-0.5 rounded shadow-sm gap-1 items-center font-bold whitespace-nowrap">
                          <Move className="w-3 h-3" /> {el.text}
                        </div>
                      </div>
                    );
                  }

                  const fontSize = el.fontSizePercent * 6;
                  const fontFamily = el.fontStyle || 'Montserrat, sans-serif';

                  return (
                    <div
                      key={el.id}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        setSelectedId(el.id);
                        setActiveDragId(el.id);
                      }}
                      style={{
                        position: 'absolute',
                        left: `${el.xPercent}%`,
                        top: `${el.yPercent}%`,
                        width: '90%',
                        fontFamily,
                        fontSize: `${fontSize}px`,
                        color: el.color || '#1e293b',
                        fontWeight: el.fontWeight || 'normal',
                        textAlign: el.alignment || 'center',
                        transform: 'translate(-50%, -50%)',
                        lineHeight: 1.4,
                        boxSizing: 'border-box'
                      }}
                      className={`cursor-move p-2 border transition-all rounded ${isSelected
                        ? 'border-brand-500 bg-brand-500/5 ring-1 ring-brand-500'
                        : 'border-transparent hover:border-brand-500/30 hover:bg-brand-500/2'
                        }`}
                    >
                      {el.type === 'dynamic' ? `{{${el.dynamicKey}}}` : el.text}
                    </div>
                  );
                })}
              </div>
            </div>

            {}
            <div className="space-y-3 w-full animate-fade-in">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Background template paper</label>
                <span className="text-[9px] font-bold text-brand-600 bg-brand-500/10 px-2 py-0.5 rounded-full uppercase tracking-wider select-none">Design Setup</span>
              </div>

              {}
              <div className="w-full">
                <button
                  type="button"
                  onClick={() => setIsPresetsDrawerOpen(true)}
                  className={`w-full px-3 py-2.5 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${activePresetId
                    ? 'border-brand-500 bg-brand-500/5 text-brand-700'
                    : 'border-border bg-background hover:bg-muted/40 text-foreground'
                    }`}
                >
                  <Award className="w-3.5 h-3.5 text-brand-500" />
                  {activePresetId
                    ? BACKGROUND_PRESETS.find(p => p.id === activePresetId)?.name || 'Preset Selected'
                    : 'Browse Presets & Custom Backgrounds'
                  }
                </button>
              </div>
            </div>
          </div>

          {}
          <div className="xl:col-span-4 space-y-5">
            {}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3.5 shadow-2xs">
              <div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Variables</h3>
                <p className="text-[10px] text-muted-foreground mt-0.5">Click variables tags below to add them to certificate.</p>
              </div>

              <div className="flex flex-col gap-2">
                {DYNAMIC_SHORTCUTS.map(shortcut => {
                  const alreadyAdded = elements.some(el => el.dynamicKey === shortcut.key);
                  return (
                    <button
                      key={shortcut.key}
                      type="button"
                      onClick={() => addVariableElement(shortcut.key, shortcut.label)}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-xl border text-[11px] font-bold transition-all text-left ${alreadyAdded
                        ? 'border-brand-500 bg-brand-500/5 text-brand-600'
                        : 'border-border bg-background hover:bg-muted/50 text-foreground'
                        }`}
                    >
                      <span>{shortcut.label}</span>
                      <span className="font-mono text-[9px] bg-muted px-1.5 py-0.5 rounded border border-border/40">{shortcut.tag}</span>
                    </button>
                  );
                })}
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border">
                <button
                  type="button"
                  onClick={addStaticTextElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <Type className="w-3.5 h-3.5" /> Static Text
                </button>

                <button
                  type="button"
                  onClick={addBadgeElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <Award className="w-3.5 h-3.5" /> Dynamic Badge
                </button>

                <button
                  type="button"
                  onClick={addPathmentLogoElement}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                >
                  <ImageIcon className="w-3.5 h-3.5 text-brand-500" /> Pathment Logo
                </button>

                <FileDragDrop onFilesSelected={handleCustomImageUpload} accept="image/*" multiple={false}>
                  {({ openFilePicker }) => (
                    <button
                      type="button"
                      onClick={openFilePicker}
                      className="flex items-center justify-center gap-1.5 py-2 px-3 bg-muted hover:bg-muted/70 text-foreground rounded-xl text-[10px] font-bold border border-border"
                    >
                      <ImageIcon className="w-3.5 h-3.5 text-emerald-500" /> Custom Image
                    </button>
                  )}
                </FileDragDrop>
              </div>
            </div>

            {}
            {selectedElement ? (
              <div className="bg-card border border-border rounded-2xl p-5 space-y-4 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <h3 className="text-xs font-bold text-foreground uppercase tracking-wide">Layer Settings</h3>
                  <button
                    type="button"
                    onClick={() => deleteElement(selectedElement.id)}
                    className="p-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {selectedElement.type === 'static' ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Text Content</label>
                    <textarea
                      rows={2}
                      value={selectedElement.text}
                      onChange={e => updateSelectedElement('text', e.target.value)}
                      className="w-full px-3 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                ) : (selectedElement.type === 'badge' || selectedElement.type === 'image') ? (
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Image Width: {selectedElement.widthPercent || 15}%</label>
                    <input
                      type="range"
                      min="5"
                      max="40"
                      value={selectedElement.widthPercent || 15}
                      onChange={e => updateSelectedElement('widthPercent', Number(e.target.value))}
                      className="w-full accent-brand-500"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="text-[10px] font-bold text-muted-foreground uppercase">Dynamic Variable</label>
                    <div className="text-xs font-bold text-brand-600 dark:text-brand-400 bg-brand-500/10 px-3 py-2 rounded-xl mt-1 border border-brand-500/20">
                      {selectedElement.dynamicKey}
                    </div>
                  </div>
                )}

                {(selectedElement.type !== 'badge' && selectedElement.type !== 'image') && (
                  <>
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-muted-foreground uppercase">Font Family</label>
                      <select
                        value={selectedElement.fontStyle || 'sans'}
                        onChange={e => updateSelectedElement('fontStyle', e.target.value)}
                        className="w-full px-3 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none"
                      >
                        {FONTS.map(f => (
                          <option key={f.value} value={f.value}>{f.label}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Size: {selectedElement.fontSizePercent}%</label>
                        <input
                          type="range"
                          min="1"
                          max="10"
                          step="0.1"
                          value={selectedElement.fontSizePercent}
                          onChange={e => updateSelectedElement('fontSizePercent', Number(e.target.value))}
                          className="w-full accent-brand-500"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Weight</label>
                        <button
                          type="button"
                          onClick={() => updateSelectedElement('fontWeight', selectedElement.fontWeight === 'bold' ? 'normal' : 'bold')}
                          className={`w-full py-1.5 border border-border rounded-xl text-xs transition-colors flex items-center justify-center ${selectedElement.fontWeight === 'bold'
                            ? 'bg-brand-500/10 border-brand-500 text-brand-600 font-bold'
                            : 'bg-muted hover:bg-muted/70 text-foreground'
                            }`}
                        >
                          <Bold className="w-4 h-4 mr-1" /> Bold
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Alignment</label>
                        <div className="flex bg-muted p-0.5 rounded-xl border border-border">
                          {(['left', 'center', 'right'] as const).map(align => {
                            const Icon = align === 'left' ? AlignLeft : align === 'center' ? AlignCenter : AlignRight;
                            return (
                              <button
                                key={align}
                                type="button"
                                onClick={() => updateSelectedElement('alignment', align)}
                                className={`flex-1 py-1 flex items-center justify-center rounded-lg transition-colors ${selectedElement.alignment === align
                                  ? 'bg-card text-foreground shadow-2xs font-semibold'
                                  : 'text-muted-foreground hover:text-foreground'
                                  }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase">Color</label>
                        <div className="flex gap-2 items-center">
                          <input
                            type="color"
                            value={selectedElement.color || '#000000'}
                            onChange={e => updateSelectedElement('color', e.target.value)}
                            className="w-10 h-8 p-0 bg-transparent border-0 cursor-pointer rounded-lg overflow-hidden"
                          />
                          <span className="text-[10px] font-mono uppercase text-muted-foreground">{selectedElement.color || '#000000'}</span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-2xl p-6 text-center text-muted-foreground text-xs shadow-2xs">
                Click on any layer inside the workspace to customize its font family, size, color, alignments and options.
              </div>
            )}
          </div>
        </div>
      </div>

      {}
      <CriteriaTable
        criteria={criteria}
        onAdd={() => openTierModal()}
        onEdit={(tier) => openTierModal(tier as any)}
        onDelete={deleteTier}
        onReorder={setCriteria}
      />

      {}
      <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
        <div className="flex items-start justify-between border-b border-border pb-4">
          <div className="flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/10 flex items-center justify-center font-bold text-brand-500 text-sm">3</div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Select Recipients</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Filter mentees who meet criteria and issue credentials.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleRunAIEvaluation}
              disabled={runningAI || !templateId}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold transition-all shadow-xs"
            >
              {runningAI ? (
                <><Loader2 className="animate-spin w-3.5 h-3.5" /> Evaluating {aiTotalCount > 0 ? `(${aiProgressCount}/${aiTotalCount})` : '…'}</>
              ) : (
                <><Sparkles className="w-3.5 h-3.5" /> {aiRanAt ? 'Re-run AI Evaluation' : 'Run AI Evaluation'}</>
              )}
            </button>
            {templateId && selectedProgramId && (
              <button
                type="button"
                onClick={handleSendToMentors}
                disabled={sendingToMentors}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
              >
                {sendingToMentors ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
                Send to Mentors
              </button>
            )}
          </div>
        </div>

        {!templateId ? (
          <div className="bg-muted/20 border border-border p-6 rounded-2xl text-center text-xs text-muted-foreground font-semibold">
            Please click <span className="text-brand-600 font-bold">"Save Template"</span> at the top first to enable live cohort matching and certificate issuance.
          </div>
        ) : (
          <div className="space-y-4">


            <AIEvaluationBanner
              count={aiResults.length}
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
              selectedTier={aiDetailMentee ? (adminTiers[aiDetailMentee.mentee_id] ?? aiDetailMentee.certificate_tier) : undefined}
              onTierChange={handleTierChange}
              overrideLabel="Override Tier (Admin)"
            />

            {}
            {}
            <div className="flex items-center justify-between border-b border-border -mx-6 px-6 pb-px mb-2">
              <div className="flex gap-4">
                {(['all', 'mentees', 'mentors', 'paused'] as const).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setRecipientType(type);
                      setRecipientSearch('');
                      setBadgeFilter('all');
                      const list = type === 'all'
                        ? [...recipientMenteesList, ...recipientMentorsList]
                        : type === 'mentees'
                          ? recipientMenteesList
                          : type === 'mentors'
                            ? recipientMentorsList
                            : recipientPausedList;
                      setSelectedMenteeIds(new Set(list.filter((m: any) => !m.isPaused).map((m: any) => m.id)));
                    }}
                    className={`pb-2.5 text-xs font-bold border-b-2 transition-all ${recipientType === type
                      ? 'border-brand-600 text-brand-600'
                      : 'border-transparent text-muted-foreground hover:text-foreground'
                      }`}
                  >
                    {type === 'all'
                      ? `All (${recipientMenteesList.length + recipientMentorsList.length})`
                      : type === 'mentees'
                        ? `Mentees (${recipientMenteesList.length})`
                        : type === 'mentors'
                          ? `Mentors (${recipientMentorsList.length})`
                          : `Paused (${recipientPausedList.length})`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setIsRulesDrawerOpen(true)}
                className="flex items-center gap-1.5 pb-2.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all"
              >
                <Info className="w-3.5 h-3.5 text-brand-500" />
                View Rules
              </button>
            </div>

            {}
            <div className="flex flex-col sm:flex-row gap-3 mb-5">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/60" />
                <input
                  type="text"
                  value={recipientSearch}
                  onChange={e => setRecipientSearch(e.target.value)}
                  placeholder="Search roster by name or email..."
                  className="w-full pl-10 pr-10 py-2.5 text-xs bg-muted/30 hover:bg-muted/50 border border-transparent focus:border-border/60 focus:bg-background rounded-xl text-foreground focus:outline-none placeholder:text-muted-foreground/50 transition-all shadow-3xs"
                />
                {recipientSearch && (
                  <button
                    onClick={() => setRecipientSearch('')}
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
                  className="w-full px-3.5 py-2.5 pr-8 text-xs bg-muted/30 hover:bg-muted/50 border border-transparent focus:border-border/60 focus:bg-background rounded-xl text-foreground font-semibold focus:outline-none transition-all cursor-pointer appearance-none shadow-3xs"
                >
                  <option value="all">All Badges</option>
                  {criteria.map(c => (
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
                  className="w-full px-3.5 py-2.5 pr-8 text-xs bg-muted/30 hover:bg-muted/50 border border-transparent focus:border-border/60 focus:bg-background rounded-xl text-foreground font-semibold focus:outline-none transition-all cursor-pointer appearance-none shadow-3xs"
                >
                  <option value="none">Sort: Default</option>
                  <option value="score_desc">High Score first</option>
                  <option value="score_asc">Low Score first</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/60 pointer-events-none" />
              </div>
            </div>

            {}
            {filtered.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap bg-muted/20 border border-border rounded-2xl p-3 text-xs w-full">
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mr-1">Set All to:</span>
                {criteria.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => bulkSetBadge(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-[10px] font-bold transition-all border animate-fade-in ${getTierButtonColor(c.id)}`}
                  >
                    {c.name}
                  </button>
                ))}
                {aiResults && aiResults.length > 0 && (
                  <button
                    type="button"
                    onClick={resetToAIRecommendations}
                    className="ml-auto flex items-center gap-1 px-3 py-1.5 rounded-xl text-[10px] font-bold bg-violet-600 hover:bg-violet-700 text-white shadow-xs transition-colors border border-transparent"
                  >
                    <Sparkles className="w-3 h-3 text-white animate-pulse" /> Reset to AI Recommendations
                  </button>
                )}
              </div>
            )}

            {}
            <RecipientRosterTable
              filtered={filtered}
              criteria={criteria}
              aiEvalMap={aiEvalMap}
              selectedIds={selectedMenteeIds}
              toggleOne={toggleOne}
              toggleAll={toggleAll}
              allSelected={allSelected}
              assignedTiers={adminTiers}
              handleTierChange={handleTierChange}
              onInspectAI={setAiDetailMentee}
              loading={loadingQualifications}
              getTierName={getTierName}
              userRole="admin"
              recipientTypeLabel={recipientType === 'all' ? 'Recipient' : recipientType === 'mentees' ? 'Mentee' : recipientType === 'mentors' ? 'Mentor' : 'Paused Mentee'}
              emptyMessage={`No ${recipientType === 'paused' ? 'paused mentees' : recipientType === 'all' ? 'active recipients' : 'active ' + recipientType} found in this program.`}
            />

            {}
            {selectedMenteeIds.size > 0 && (
              <div className="bg-muted/20 border border-border rounded-2xl p-4 flex flex-wrap gap-4 text-xs font-semibold text-muted-foreground">
                {criteria.map(c => (
                  <div key={c.id} className="flex items-center gap-1">
                    <Award className={`w-3.5 h-3.5 ${getTierIconColor(c.id)}`} />
                    <span>{c.name}: </span>
                    <span className="font-bold text-foreground">{selectedSummary[c.id] ?? 0}</span>
                  </div>
                ))}
              </div>
            )}

            {}
            <div className="flex items-center justify-between border-t border-border pt-4">
              <div className="flex items-center gap-2 text-xs font-bold text-muted-foreground">
                <Users className="w-4 h-4 text-brand-500" />
                <span>
                  <span className="text-foreground font-extrabold">{selectedMenteeIds.size}</span>{' '}
                  {recipientType === 'all'
                    ? `recipient${selectedMenteeIds.size !== 1 ? 's' : ''}`
                    : recipientType === 'mentees'
                      ? `mentee${selectedMenteeIds.size !== 1 ? 's' : ''}`
                      : `mentor${selectedMenteeIds.size !== 1 ? 's' : ''}`}{' '}
                  selected
                </span>
              </div>
              <button
                type="button"
                onClick={handleIssue}
                disabled={issuing || selectedMenteeIds.size === 0}
                className="flex items-center gap-1.5 px-6 py-3 bg-brand-600 hover:bg-brand-700 disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed text-white rounded-xl font-bold text-xs shadow-sm transition-all"
              >
                {issuing ? <Loader2 className="animate-spin w-3.5 h-3.5" /> : <Award className="w-3.5 h-3.5" />}
                Issue Certificates
              </button>
            </div>
          </div>
        )}

      </div>

      {}
      {templateId && (
        <div className="bg-card border border-border rounded-3xl p-6 shadow-xs space-y-5">
          <div className="border-b border-border pb-4">
            <h2 className="text-sm font-bold text-foreground">Issuance History & Logs</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Track, regenerate/resend, and revoke/delete issued certificate credentials.</p>
          </div>
          <CertificateHistoryLog templateId={templateId} userRole="admin" />
        </div>
      )}

      {}
      <TierCriteriaModal
        isOpen={isTierModalOpen}
        editingTier={editingTier}
        onClose={() => setIsTierModalOpen(false)}
        onSave={handleSaveTier}
      />
      <Drawer
        open={isRulesDrawerOpen}
        onClose={() => setIsRulesDrawerOpen(false)}
        title="Certificate Criteria & Rules"
        subtitle={`Requirements configured for the template: ${name || 'New Template'}`}
        width="md"
      >
        <div className="space-y-6">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The rules below define the AI evaluation criteria for each tier. The AI uses these keywords and scoring thresholds to determine which certificate each mentee qualifies for.
          </p>

          <div className="space-y-4">
            {criteria.map((c: any) => {
              const iconColor = getTierIconColor(c.id);
              const isParticipation = c.id === 'participation';
              const kws: string[] = c.keywords || [];
              const minScore = c.minScorePercent ?? 0;
              const maxB = (c.maxOpenBlockers ?? -1) === -1 ? 'Unlimited' : c.maxOpenBlockers;
              const minCompletion = c.minCompletionRate ?? 0;
              const minOnTime = c.minOnTimeRate ?? 0;
              const minRating = c.minAvgRating ?? 0;
              const customRule = c.customRule?.trim() ?? '';

              return (
                <div key={c.id} className="p-4 rounded-2xl border border-border bg-card shadow-2xs space-y-3">
                  <div className="flex items-center gap-2 border-b border-border/60 pb-2">
                    <Award className={`w-5 h-5 ${iconColor}`} />
                    <span className="text-xs font-bold text-foreground">{c.name}</span>
                  </div>

                  <div className="space-y-3">
                    {isParticipation && kws.length === 0 && minScore === 0 ? (
                      <p className="text-xs text-muted-foreground font-semibold italic">
                        Awarded to all active participants (no minimum requirements).
                      </p>
                    ) : (
                      <>
                        {}
                        <div className="space-y-1">
                          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Keywords / Tech Stack</p>
                          {kws.length === 0 ? (
                            <p className="text-[11px] text-amber-600 font-semibold italic">No keywords set — AI will use hard constraints only.</p>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {kws.map(kw => (
                                <span key={kw} className="px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-bold border border-brand-500/20">{kw}</span>
                              ))}
                            </div>
                          )}
                        </div>

                        {}
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

                        {}
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

      <Drawer
        open={isPresetsDrawerOpen}
        onClose={() => setIsPresetsDrawerOpen(false)}
        title="Premium Certificate Background Presets"
        subtitle="Choose from a collection of professionally-designed layouts. Selecting one will apply it to your editor canvas instantly."
        width="lg"
      >
        <div className="grid grid-cols-2 gap-4 py-2">
          {}
          {(() => {
            const hasCustomImage = bgImageUrl && !bgImageUrl.startsWith('data:image/svg+xml;base64,');
            const isCustomActive = !activePresetId && hasCustomImage;

            if (hasCustomImage) {
              return (
                <div
                  className={`group relative flex flex-col p-2.5 rounded-2xl border transition-all text-left w-full bg-card hover:shadow-md ${isCustomActive
                    ? 'border-brand-500 ring-2 ring-brand-500/15 scale-[1.01]'
                    : 'border-border hover:border-brand-500/30'
                    }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActivePresetId(null);
                      toast.success('Applied custom background image!');
                    }}
                    className="w-full flex flex-col items-start focus:outline-none flex-1"
                  >
                    {}
                    <div className="w-full aspect-[1.414] rounded-xl overflow-hidden border border-border bg-muted/30 relative flex items-center justify-center">
                      <img
                        src={bgImageUrl}
                        className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]"
                        alt="Custom background"
                      />
                      {isCustomActive && (
                        <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm border border-white">
                          <CheckCircle className="w-3.5 h-3.5 stroke-[3px]" />
                        </div>
                      )}
                    </div>

                    <div className="mt-3 px-1 flex-1 flex flex-col justify-between w-full">
                      <div>
                        <span className="text-[11px] font-bold text-foreground group-hover:text-brand-600 transition-colors">
                          Custom Uploaded Design
                        </span>
                        <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                          Your custom uploaded background image applied to this template.
                        </p>
                      </div>
                    </div>
                  </button>

                  {}
                  <div className="mt-3 flex items-center justify-between w-full border-t border-border/40 pt-2 shrink-0">
                    {isCustomActive ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-wider select-none">
                        Applied Design
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setActivePresetId(null);
                          toast.success('Applied custom background image!');
                        }}
                        className="inline-flex items-center gap-1 text-[8px] font-bold text-muted-foreground bg-muted/60 group-hover:bg-brand-500 group-hover:text-white px-2 py-1 rounded-full uppercase tracking-wider transition-all"
                      >
                        Apply Custom
                      </button>
                    )}

                    <FileDragDrop onFilesSelected={handleBgUpload} accept="image/*" multiple={false} disabled={uploadingBg}>
                      {({ openFilePicker }) => (
                        <button
                          type="button"
                          onClick={openFilePicker}
                          className="text-[9px] font-extrabold text-brand-600 hover:text-brand-700 hover:underline flex items-center gap-1"
                        >
                          Replace Image
                        </button>
                      )}
                    </FileDragDrop>
                  </div>
                </div>
              );
            }

            return (
              <FileDragDrop onFilesSelected={handleBgUpload} accept="image/*" multiple={false} disabled={uploadingBg}>
                {({ openFilePicker }) => (
                  <button
                    type="button"
                    onClick={openFilePicker}
                    className="group relative flex flex-col p-2.5 rounded-2xl border border-dashed border-border hover:border-brand-500/40 bg-muted/10 hover:bg-muted/20 transition-all text-left w-full h-full min-h-[175px]"
                  >
                    <div className="w-full aspect-[1.414] rounded-xl border border-dashed border-border/60 bg-muted/20 flex flex-col items-center justify-center gap-1.5 p-4 text-center">
                      {uploadingBg ? (
                        <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
                      ) : (
                        <ImageIcon className="w-5 h-5 text-brand-500 group-hover:scale-115 transition-transform" />
                      )}
                      <span className="text-[10px] font-bold text-foreground">Upload Custom File</span>
                      <span className="text-[8px] text-muted-foreground">PNG, JPG, SVG</span>
                    </div>
                    <div className="mt-3.5 px-1">
                      <span className="text-[11px] font-bold text-foreground">Add Custom Design</span>
                      <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed">
                        Upload your own background layout image.
                      </p>
                    </div>
                  </button>
                )}
              </FileDragDrop>
            );
          })()}

          {BACKGROUND_PRESETS.map((preset) => {
            const isActive = activePresetId === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => {
                  applyPresetBackground(preset.id, preset.imageUrl);
                }}
                className={`group relative flex flex-col p-2.5 rounded-2xl border transition-all text-left w-full bg-card hover:shadow-md ${isActive
                  ? 'border-brand-500 ring-2 ring-brand-500/15 scale-[1.01]'
                  : 'border-border hover:border-brand-500/30'
                  }`}
              >
                {}
                <div className="w-full aspect-[1.414] rounded-xl overflow-hidden border border-border bg-muted/30 relative flex items-center justify-center">
                  <img
                    src={preset.imageUrl}
                    className="w-full h-full object-cover pointer-events-none transition-transform duration-300 group-hover:scale-[1.03]"
                    alt={preset.name}
                  />
                  {isActive && (
                    <div className="absolute top-2 right-2 w-5.5 h-5.5 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-sm border border-white">
                      <CheckCircle className="w-3.5 h-3.5 stroke-[3px]" />
                    </div>
                  )}
                </div>

                <div className="mt-3 px-1 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[11px] font-bold text-foreground group-hover:text-brand-600 transition-colors">
                      {preset.name}
                    </span>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">
                      {preset.description}
                    </p>
                  </div>

                  {}
                  <div className="mt-3">
                    {isActive ? (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-emerald-600 bg-emerald-500/10 px-2 py-1 rounded-full uppercase tracking-wider">
                        Applied Design
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[8px] font-bold text-muted-foreground bg-muted/60 group-hover:bg-brand-500 group-hover:text-white px-2 py-1 rounded-full uppercase tracking-wider transition-all">
                        Apply Preset
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </Drawer>
    </div>
  );
}
