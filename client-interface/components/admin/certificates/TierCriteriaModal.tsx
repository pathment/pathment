'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Award, Loader2, Image as ImageIcon } from 'lucide-react';
import { FileDragDrop } from '@/components/shared/FileDragDrop';
import { certificatesApi } from '@/lib/services/certificates-api';
import { TierCriteria } from './certificate-constants';

export interface TierCriteriaModalProps {
  isOpen: boolean;
  editingTier: TierCriteria | null;
  onClose: () => void;
  onSave: (savedFields: Partial<TierCriteria>, editingTierId?: string) => void;
}

export function TierCriteriaModal({ isOpen, editingTier, onClose, onSave }: TierCriteriaModalProps) {
  const [tierModalName, setTierModalName] = useState('');
  const [tierModalBadgeUrl, setTierModalBadgeUrl] = useState('');
  const [uploadingBadge, setUploadingBadge] = useState(false);

  const [enableKeywords, setEnableKeywords] = useState(true);
  const [enableMinScore, setEnableMinScore] = useState(true);
  const [enableMaxBlockers, setEnableMaxBlockers] = useState(true);
  const [enableMinCompletion, setEnableMinCompletion] = useState(true);
  const [enableMinOnTime, setEnableMinOnTime] = useState(true);
  const [enableMinRating, setEnableMinRating] = useState(true);
  const [enableMinAttendance, setEnableMinAttendance] = useState(false);
  const [enableCustomRule, setEnableCustomRule] = useState(true);

  const [tierModalKeywords, setTierModalKeywords] = useState<string[]>([]);
  const [tierModalKeywordInput, setTierModalKeywordInput] = useState('');
  const [tierModalMinScore, setTierModalMinScore] = useState(75);
  const [tierModalMaxBlockers, setTierModalMaxBlockers] = useState(0);
  const [tierModalMinCompletion, setTierModalMinCompletion] = useState(80);
  const [tierModalMinOnTime, setTierModalMinOnTime] = useState(80);
  const [tierModalMinRating, setTierModalMinRating] = useState(4.0);
  const [tierModalMinAttendance, setTierModalMinAttendance] = useState(70);
  const [tierModalCustomRule, setTierModalCustomRule] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    if (editingTier) {
      setTierModalName(editingTier.name || '');
      setTierModalBadgeUrl(editingTier.badgeUrl || '');

      setEnableKeywords(Array.isArray(editingTier.keywords) && editingTier.keywords.length > 0);
      setEnableMinScore(editingTier.minScorePercent != null);
      setEnableMaxBlockers(editingTier.maxOpenBlockers != null);
      setEnableMinCompletion(editingTier.minCompletionRate != null);
      setEnableMinOnTime(editingTier.minOnTimeRate != null);
      setEnableMinRating(editingTier.minAvgRating != null);
      setEnableMinAttendance(editingTier.minAttendanceRate != null);
      setEnableCustomRule(Boolean(editingTier.customRule && editingTier.customRule.trim()));

      setTierModalKeywords(editingTier.keywords || []);
      setTierModalMinScore(editingTier.minScorePercent ?? 75);
      setTierModalMaxBlockers(editingTier.maxOpenBlockers ?? 0);
      setTierModalMinCompletion(editingTier.minCompletionRate ?? 80);
      setTierModalMinOnTime(editingTier.minOnTimeRate ?? 80);
      setTierModalMinRating(editingTier.minAvgRating ?? 4.0);
      setTierModalMinAttendance(editingTier.minAttendanceRate ?? 70);
      setTierModalCustomRule(editingTier.customRule ?? '');
    } else {
      setTierModalName('');
      setTierModalBadgeUrl('');

      setEnableKeywords(true);
      setEnableMinScore(true);
      setEnableMaxBlockers(true);
      setEnableMinCompletion(true);
      setEnableMinOnTime(true);
      setEnableMinRating(true);
      setEnableMinAttendance(false);
      setEnableCustomRule(true);

      setTierModalKeywords([]);
      setTierModalMinScore(75);
      setTierModalMaxBlockers(0);
      setTierModalMinCompletion(80);
      setTierModalMinOnTime(80);
      setTierModalMinRating(4.0);
      setTierModalMinAttendance(70);
      setTierModalCustomRule('');
    }
    setTierModalKeywordInput('');
  }, [isOpen, editingTier]);

  if (!isOpen) return null;

  const handleBadgeUpload = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      setUploadingBadge(true);
      const res = await certificatesApi.uploadAsset(files[0]);
      if (res.success && res.url) {
        setTierModalBadgeUrl(res.url);
        toast.success('Badge icon uploaded successfully!');
      }
    } catch (err) {
      toast.error('Failed to upload badge icon');
    } finally {
      setUploadingBadge(false);
    }
  };

  const handleSave = () => {
    if (!tierModalName.trim()) {
      toast.error('Tier name is required');
      return;
    }

    const kws = [...tierModalKeywords];
    const pending = tierModalKeywordInput.trim();
    if (pending && !kws.includes(pending)) kws.push(pending);

    const savedFields: Partial<TierCriteria> = {
      name: tierModalName.trim(),
      badgeUrl: tierModalBadgeUrl,
      keywords: enableKeywords ? kws : null,
      minScorePercent: enableMinScore ? tierModalMinScore : null,
      maxOpenBlockers: enableMaxBlockers ? tierModalMaxBlockers : null,
      minCompletionRate: enableMinCompletion ? tierModalMinCompletion : null,
      minOnTimeRate: enableMinOnTime ? tierModalMinOnTime : null,
      minAvgRating: enableMinRating ? tierModalMinRating : null,
      minAttendanceRate: enableMinAttendance ? tierModalMinAttendance : null,
      customRule: enableCustomRule ? tierModalCustomRule.trim() : null,
    };

    onSave(savedFields, editingTier?.id);
    onClose();
    toast.success('Certificate type saved! Click "Save Template" to persist changes.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">
        {}
        <div className="px-6 py-5 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
            <Award className="w-4.5 h-4.5 text-brand-500" />
            {editingTier ? `Edit Certificate Type: ${editingTier.name}` : 'Add Certificate Type'}
          </h3>
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground rounded-lg">
            &times;
          </button>
        </div>

        {}
        <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Certificate Type Name</label>
            <input
              type="text"
              placeholder="e.g. Gold Certificate, Best Performance"
              value={tierModalName}
              onChange={e => setTierModalName(e.target.value)}
              className="w-full px-3.5 py-2 text-xs font-semibold bg-background border border-border rounded-xl text-foreground focus:outline-none"
            />
          </div>

          {}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
              Upload Badge Icon
            </label>
            <FileDragDrop onFilesSelected={handleBadgeUpload} accept="image/*" multiple={false} disabled={uploadingBadge}>
              {({ openFilePicker }) => (
                <div onClick={openFilePicker} className="border border-dashed border-border rounded-xl p-4 flex flex-col items-center justify-center bg-background hover:bg-muted/40 cursor-pointer text-xs font-semibold">
                  {uploadingBadge ? (
                    <Loader2 className="animate-spin w-5 h-5 text-brand-500" />
                  ) : tierModalBadgeUrl ? (
                    <div className="flex flex-col items-center gap-1 text-center">
                      <img src={tierModalBadgeUrl} className="w-10 h-10 object-contain rounded" alt="Badge" />
                      <span className="text-[10px] text-brand-600 font-bold">Badge uploaded ✓</span>
                      <span className="text-[9px] text-muted-foreground">Click to replace</span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
                      <ImageIcon className="w-5 h-5" />
                      <span>Click to upload badge image</span>
                      <span className="text-[9px] text-muted-foreground/60">Fitted square icon</span>
                    </div>
                  )}
                </div>
              )}
            </FileDragDrop>
          </div>

          {}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 cursor-pointer">
                Keywords / Tech Stack <span className="text-[9px] text-muted-foreground/60 font-normal">(AI matches loosely)</span>
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableKeywords}
                  onChange={e => setEnableKeywords(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>

            <div className={`space-y-2 transition-opacity ${enableKeywords ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
              <div className="flex flex-wrap gap-1.5 min-h-[28px]">
                {tierModalKeywords.map(kw => (
                  <span key={kw} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-600 text-[10px] font-bold border border-brand-500/20">
                    {kw}
                    <button type="button" onClick={() => setTierModalKeywords(prev => prev.filter(k => k !== kw))} className="hover:text-red-500 leading-none">×</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  disabled={!enableKeywords}
                  value={tierModalKeywordInput}
                  onChange={e => setTierModalKeywordInput(e.target.value)}
                  onKeyDown={e => {
                    if ((e.key === 'Enter' || e.key === ',') && tierModalKeywordInput.trim()) {
                      e.preventDefault();
                      const kw = tierModalKeywordInput.trim().replace(/,$/, '');
                      if (kw && !tierModalKeywords.includes(kw)) {
                        setTierModalKeywords(prev => [...prev, kw]);
                      }
                      setTierModalKeywordInput('');
                    }
                  }}
                  placeholder="Type keyword and press Enter (e.g. React.js, Node.js)"
                  className="flex-1 px-3 py-1.5 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-brand-500/40 placeholder:text-muted-foreground/50 disabled:bg-muted/30"
                />
                <button
                  type="button"
                  disabled={!enableKeywords}
                  onClick={() => {
                    const kw = tierModalKeywordInput.trim();
                    if (kw && !tierModalKeywords.includes(kw)) {
                      setTierModalKeywords(prev => [...prev, kw]);
                      setTierModalKeywordInput('');
                    }
                  }}
                  className="px-3 py-1.5 bg-brand-500/10 hover:bg-brand-500/20 text-brand-600 rounded-xl text-xs font-bold transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            </div>
          </div>

          {}
          <div className="space-y-3 border-t border-border/60 pt-3">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Hard Constraints <span className="normal-case font-normal text-muted-foreground/60">(AI cannot bypass these)</span>
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">Min Score %</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMinScore}
                      onChange={e => setEnableMinScore(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0} max={100}
                  disabled={!enableMinScore}
                  value={tierModalMinScore}
                  onChange={e => setTierModalMinScore(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">Max Open Blockers</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMaxBlockers}
                      onChange={e => setEnableMaxBlockers(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0}
                  disabled={!enableMaxBlockers}
                  value={tierModalMaxBlockers}
                  onChange={e => setTierModalMaxBlockers(Math.max(0, Number(e.target.value)))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">Min Completion %</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMinCompletion}
                      onChange={e => setEnableMinCompletion(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0} max={100}
                  disabled={!enableMinCompletion}
                  value={tierModalMinCompletion}
                  onChange={e => setTierModalMinCompletion(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">Min On-Time %</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMinOnTime}
                      onChange={e => setEnableMinOnTime(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0} max={100}
                  disabled={!enableMinOnTime}
                  value={tierModalMinOnTime}
                  onChange={e => setTierModalMinOnTime(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50 col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">Min Avg Mentor Rating (1-5)</label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMinRating}
                      onChange={e => setEnableMinRating(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0} max={5} step={0.5}
                  disabled={!enableMinRating}
                  value={tierModalMinRating}
                  onChange={e => setTierModalMinRating(Math.min(5, Math.max(0, Number(e.target.value))))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>

              <div className="space-y-1.5 bg-muted/20 p-2.5 rounded-xl border border-border/50 col-span-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-semibold text-muted-foreground">
                    Min Attendance %
                    <span className="ml-1 text-[9px] font-normal text-muted-foreground/60">(cohort reviews)</span>
                  </label>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={enableMinAttendance}
                      onChange={e => setEnableMinAttendance(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-6 h-3.5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[1.5px] after:left-[1.5px] after:bg-white after:rounded-full after:h-2.5 after:w-2.5 after:transition-all peer-checked:bg-brand-600"></div>
                  </label>
                </div>
                <input
                  type="number" min={0} max={100}
                  disabled={!enableMinAttendance}
                  value={tierModalMinAttendance}
                  onChange={e => setTierModalMinAttendance(Math.min(100, Math.max(0, Number(e.target.value))))}
                  className="w-full px-2.5 py-1 text-xs bg-background border border-border rounded-lg text-foreground focus:outline-none focus:border-brand-500/40 disabled:opacity-40"
                />
              </div>
            </div>
          </div>

          {}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                Custom AI Rule <span className="normal-case font-normal text-muted-foreground/60">(qualitative)</span>
              </label>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enableCustomRule}
                  onChange={e => setEnableCustomRule(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-7 h-4 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-brand-600"></div>
              </label>
            </div>
            <textarea
              rows={2}
              disabled={!enableCustomRule}
              placeholder={'e.g. "Must have completed at least 2 project-type tasks"'}
              value={tierModalCustomRule}
              onChange={e => setTierModalCustomRule(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-background border border-border rounded-xl text-foreground focus:outline-none focus:border-brand-500/40 resize-none placeholder:text-muted-foreground/40 disabled:opacity-40 disabled:bg-muted/30"
            />
          </div>
        </div>

        {}
        <div className="px-6 py-4 bg-muted/20 border-t border-border flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-xl text-xs font-bold text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs shadow-sm"
          >
            Save Certificate Type
          </button>
        </div>
      </div>
    </div>
  );
}
