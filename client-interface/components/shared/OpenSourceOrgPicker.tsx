'use client';

import { useEffect, useState } from 'react';
import { Check, ExternalLink, Loader2, Plus, Search, X } from 'lucide-react';
import { openSourceOrgsApi, type OpenSourceOrg } from '@/lib/services/open-source-orgs-api';
import { useDebounce } from '@/lib/hooks/useDebounce';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { OpenSourceOrgAvatar } from '@/components/shared/OpenSourceOrgAvatar';


interface GithubOrg {
  login: string;
  avatar_url: string;
  html_url: string;
}

interface CombinedOrg {
  id: string | null;
  name: string;
  url: string;
  avatar?: string;
  source: 'local' | 'github';
}

export interface OpenSourceOrgPickerProps {
  value?: OpenSourceOrg | OpenSourceOrg[] | null;
  onChange: (value: any) => void;
  multiple?: boolean;
}

async function fetchGithubOrgs(query: string): Promise<CombinedOrg[]> {
  if (!query.trim()) return [];
  try {
    const res: any = await openSourceOrgsApi.searchGithub(query);
    const orgs = res?.data?.orgs ?? [];
    if (Array.isArray(orgs) && orgs.length > 0) return orgs;
  } catch {
    // Fallback to client fetch if backend search fails
  }

  try {
    const res = await fetch(
      `https://api.github.com/search/users?q=${encodeURIComponent(query)}+type:org&per_page=8`,
      { headers: { Accept: 'application/vnd.github+json' } }
    );
    if (!res.ok) return [];
    const data = await res.json();
    return (data.items || []).map((g: GithubOrg) => ({
      id: null,
      name: g.login,
      url: g.html_url,
      avatar: g.avatar_url,
      source: 'github' as const,
    }));
  } catch {
    return [];
  }
}

function mergeResults(local: OpenSourceOrg[], github: CombinedOrg[]): CombinedOrg[] {
  const localNames = new Set(local.map((o) => o.name.toLowerCase()));
  const localMapped: CombinedOrg[] = local.map((o) => ({ id: o.id, name: o.name, url: o.url, source: 'local' }));
  const filtered = github.filter((g) => !localNames.has(g.name.toLowerCase()));
  return [...localMapped, ...filtered];
}

export function OpenSourceOrgPicker({ value, onChange, multiple = false }: OpenSourceOrgPickerProps) {
  const isMulti = multiple || Array.isArray(value);
  const rawList: OpenSourceOrg[] = Array.isArray(value) ? value : value ? [value] : [];
  // Deduplicate selected items by name to prevent duplicate keys or duplicate state entries
  const selectedList = Array.from(new Map(rawList.map((o) => [o.name.toLowerCase(), o])).values());

  const [search, setSearch] = useState('');
  const [orgs, setOrgs] = useState<CombinedOrg[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const debouncedSearch = useDebounce(search, 350);

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      openSourceOrgsApi.list(debouncedSearch || undefined).then((r: any) => r.data?.orgs ?? []),
      debouncedSearch ? fetchGithubOrgs(debouncedSearch) : Promise.resolve([]),
    ])
      .then(([local, github]) => { if (active) setOrgs(mergeResults(local, github)); })
      .catch(() => { if (active) setOrgs([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [debouncedSearch]);

  const handleSelect = async (org: CombinedOrg) => {
    const isAlreadySelected = selectedList.some((o) => o.name.toLowerCase() === org.name.toLowerCase());

    if (isAlreadySelected) {
      if (isMulti) {
        onChange(selectedList.filter((o) => o.name.toLowerCase() !== org.name.toLowerCase()));
      } else {
        onChange(null);
      }
      return;
    }

    let targetOrg: OpenSourceOrg;

    if (org.source === 'local' && org.id) {
      targetOrg = { id: org.id, name: org.name, url: org.url, createdBy: null, createdAt: '' };
    } else {
      setSavingId(org.name);
      try {
        const res: any = await openSourceOrgsApi.create({ name: org.name, url: org.url });
        targetOrg = res.data?.org;
        setOrgs((prev) => prev.map((o) => (o.name === org.name ? { ...o, id: targetOrg.id, source: 'local' } : o)));
      } catch {
        setSavingId(null);
        return;
      } finally {
        setSavingId(null);
      }
    }

    if (isMulti) {
      onChange([...selectedList, targetOrg]);
    } else {
      onChange(targetOrg);
    }
  };

  const handleRemove = (orgName: string) => {
    if (isMulti) {
      onChange(selectedList.filter((o) => o.name.toLowerCase() !== orgName.toLowerCase()));
    } else {
      onChange(null);
    }
  };

  const handleAdd = async () => {
    if (!newName.trim() || !newUrl.trim()) { setError('Name and URL are required'); return; }
    setSaving(true);
    setError('');
    try {
      const res: any = await openSourceOrgsApi.create({ name: newName.trim(), url: newUrl.trim() });
      const saved: OpenSourceOrg = res.data?.org;
      if (isMulti) {
        const updated = Array.from(new Map([...selectedList, saved].map((o) => [o.name.toLowerCase(), o])).values());
        onChange(updated);
      } else {
        onChange(saved);
      }
      setAdding(false);
      setNewName('');
      setNewUrl('');
    } catch (e) {
      setError(extractApiErrorMessage(e, 'Could not save organization'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div className="space-y-3">
      {selectedList.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              Selected ({selectedList.length})
            </span>
            {isMulti && selectedList.length > 1 && (
              <button
                type="button"
                onClick={() => onChange([])}
                className="text-xs font-medium text-slate-400 hover:text-red-500 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedList.map((org, idx) => (
              <div
                key={org.id ? `${org.id}-${idx}` : `${org.name.toLowerCase()}-${idx}`}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium shadow-xs"
              >
                <OpenSourceOrgAvatar name={org.name} url={org.url} avatar={(org as any).avatar} className="w-4 h-4 rounded-full object-cover shrink-0 border border-slate-200 dark:border-slate-700" />
                <span className="truncate max-w-[140px] font-semibold text-slate-900 dark:text-slate-100">{org.name}</span>

                <a
                  href={org.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-600 hover:underline dark:text-brand-400 shrink-0"
                  title={org.url}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemove(org.name)}
                  className="ml-0.5 rounded p-0.5 text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search organizations…"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <div className="max-h-52 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="w-5 h-5 animate-spin text-brand-600 dark:text-brand-400" />
          </div>
        ) : orgs.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-4">No organizations found</p>
        ) : (
          orgs.map((org, idx) => {
            const isSelected = selectedList.some((o) => o.name.toLowerCase() === org.name.toLowerCase());
            const isSaving = savingId === org.name;
            return (
              <button
                key={org.id ? `${org.id}-${idx}` : `${org.source}-${org.name.toLowerCase()}-${idx}`}
                type="button"
                onClick={() => handleSelect(org)}
                disabled={isSaving}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-left disabled:opacity-60 transition-colors ${
                  isSelected
                    ? 'bg-brand-50/90 dark:bg-brand-950/80 hover:bg-brand-100/90 dark:hover:bg-brand-900/90'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/80'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'bg-brand-600 border-brand-600 text-white dark:bg-brand-500 dark:border-brand-500'
                      : 'border-slate-400 dark:border-slate-600 bg-white dark:bg-slate-800'
                  }`}
                >
                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                </div>

                <OpenSourceOrgAvatar name={org.name} url={org.url} avatar={org.avatar} className="w-6 h-6 rounded-full shrink-0 object-cover border border-slate-200 dark:border-slate-700" />

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className={`text-sm font-medium truncate ${isSelected ? 'text-brand-950 dark:text-brand-100 font-semibold' : 'text-slate-900 dark:text-slate-100'}`}>
                      {org.name}
                    </p>
                    {org.source === 'github' && (
                      <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">GitHub</span>
                    )}
                  </div>
                  <p className={`text-xs truncate ${isSelected ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'}`}>{org.url}</p>
                </div>
                {isSaving && <Loader2 className="w-4 h-4 animate-spin text-brand-600 dark:text-brand-400 shrink-0" />}
              </button>
            );
          })
        )}
      </div>

      {adding ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Add new organization</p>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Organization name" className={inputCls} />
          <input type="url" value={newUrl} onChange={(e) => setNewUrl(e.target.value)} placeholder="https://example.org" className={inputCls} />
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={handleAdd} disabled={saving} className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-brand-600 dark:bg-brand-500 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700 dark:hover:bg-brand-600 disabled:opacity-50">
              {saving && <Loader2 className="w-4 h-4 animate-spin" />} Save
            </button>
            <button type="button" onClick={() => { setAdding(false); setError(''); setNewName(''); setNewUrl(''); }} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 dark:text-brand-400 hover:text-brand-700 dark:hover:text-brand-300">
          <Plus className="w-4 h-4" /> Add new organization
        </button>
      )}
    </div>
  );
}
