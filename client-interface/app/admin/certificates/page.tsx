'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Plus, Trash2, Loader2, Award, Calendar, User, ChevronDown } from 'lucide-react';
import { toast } from 'sonner';
import { certificatesApi, CertificateTemplate } from '@/lib/services/certificates-api';
import { ConfirmModal } from '@/components/shared';
import { programsApi } from '@/lib/services/program-api';

export default function AdminCertificatesPage() {
  const [templates, setTemplates] = useState<CertificateTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedProgramFilter, setSelectedProgramFilter] = useState<string>('all');
  const [loadingPrograms, setLoadingPrograms] = useState(true);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [templateToDelete, setTemplateToDelete] = useState<string | null>(null);

  const fetchTemplates = async (progId?: string) => {
    try {
      setLoading(true);
      const filterId = progId !== undefined ? progId : selectedProgramFilter;
      const res = await certificatesApi.listTemplates(filterId !== 'all' ? filterId : undefined);
      if (res.success && res.data) {
        setTemplates(res.data);
      }
    } catch (err: any) {
      toast.error('Failed to load templates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoadingPrograms(true);
        const res = await programsApi.getAll({ limit: 100 });
        if (res.success && res.data) {
          setPrograms(res.data);
        }
      } catch (err) {
        console.error('Failed to load programs:', err);
      } finally {
        setLoadingPrograms(false);
      }
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    fetchTemplates();
  }, [selectedProgramFilter]);

  const requestDelete = (id: string) => {
    setTemplateToDelete(id);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!templateToDelete) return;
    try {
      const res = await certificatesApi.deleteTemplate(templateToDelete);
      if (res.success) {
        toast.success('Template deleted successfully');
        fetchTemplates();
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete template');
    } finally {
      setDeleteConfirmOpen(false);
      setTemplateToDelete(null);
    }
  };

  return (
    <div className="space-y-6">
      {}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border/60 pb-5 gap-4">
        <div>
          <h1 className="text-xl font-bold text-foreground">Certificates</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Manage templates and issue certificates to mentees</p>
        </div>

        <div className="flex items-center gap-3.5 flex-wrap">
          {}
          <div className="relative inline-flex items-center shadow-3xs rounded-xl border border-border/80 bg-background hover:bg-muted/30 transition-colors">
            <span className="pl-3.5 pr-1.5 text-[9px] font-extrabold text-muted-foreground uppercase tracking-wider select-none border-r border-border/60 py-2">
              Program
            </span>
            <select
              value={selectedProgramFilter}
              onChange={e => setSelectedProgramFilter(e.target.value)}
              className="appearance-none pr-9 pl-3 py-2 text-xs font-bold text-foreground bg-transparent cursor-pointer focus:outline-none min-w-[150px] max-w-[240px]"
            >
              <option value="all" className="bg-card text-foreground">All Programs</option>
              {programs.map(p => (
                <option key={p.id} value={p.id} className="bg-card text-foreground">
                  {p.name}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 w-3 h-3 pointer-events-none text-muted-foreground/60" />
          </div>

          <Link
            href="/admin/certificates/new"
            className="flex items-center gap-1.5 px-4.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl font-bold text-xs transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Template
          </Link>
        </div>
      </div>

      {}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
          <span className="text-sm text-muted-foreground font-medium">Loading templates...</span>
        </div>
      ) : templates.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
          <Award className="w-12 h-12 text-brand-500 mb-3 opacity-80" />
          <h3 className="text-sm font-bold text-foreground mb-1">No Templates Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mb-4">
            Create certificate templates using background images, logos, and dynamic placeholders to issue to mentees.
          </p>
          <Link
            href="/admin/certificates/new"
            className="px-4 py-2 bg-muted hover:bg-muted/70 text-foreground border border-border rounded-xl text-xs font-semibold transition-colors"
          >
            Create Your First Template
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map((template) => {
            const dateStr = new Date(template.createdAt).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
            });

            return (
              <div 
                key={template.id} 
                className="group bg-card border border-border hover:border-brand-500/20 hover:shadow-md rounded-2xl overflow-hidden shadow-3xs transition-all duration-300 flex flex-col hover:-translate-y-0.5"
              >
                {}
                <div className="relative aspect-[1.414] bg-muted overflow-hidden border-b border-border">
                  {template.bgImageUrl ? (
                    <img 
                      src={template.bgImageUrl} 
                      className="w-full h-full object-cover transition-transform group-hover:scale-[1.02]" 
                      alt="Certificate Background" 
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <Award className="w-10 h-10" />
                    </div>
                  )}
                  {template.logoUrl && (
                    <img 
                      src={template.logoUrl} 
                      className="absolute top-4 right-4 w-8 h-8 rounded-full border border-white/50 object-contain shadow-sm bg-white" 
                      alt="Logo" 
                    />
                  )}
                </div>

                {}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <span className="inline-block text-[9px] bg-brand-500/10 text-brand-600 dark:text-brand-400 px-2.5 py-0.5 rounded-md font-bold uppercase tracking-wider">
                      {template.program?.name || 'No Program'}
                    </span>
                    
                    <h3 className="text-sm font-extrabold text-foreground line-clamp-2 leading-snug">
                      {template.name}
                    </h3>
                    
                    <div className="flex items-center gap-3.5 text-[10px] text-muted-foreground/80 font-semibold border-t border-border/40 pt-2.5 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-brand-500/80" />
                        {dateStr}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-brand-500/80" />
                        {template.creator ? `${template.creator.firstName} ${template.creator.lastName.slice(0, 1)}.` : 'Admin'}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-2.5">
                    <Link
                      href={`/admin/certificates/${template.id}/edit`}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
                    >
                      <Award className="w-4 h-4" />
                      Issue & Manage
                    </Link>
                    <button
                      type="button"
                      onClick={() => requestDelete(template.id)}
                      className="p-2 bg-red-500/5 hover:bg-red-500/10 text-red-600 dark:text-red-400 rounded-xl transition-all border border-red-500/10 hover:border-red-500/20"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {}
      <ConfirmModal
        isOpen={deleteConfirmOpen}
        title="Delete Certificate Template"
        message="Are you sure you want to delete this template? Issued certificates using this template will not be affected."
        confirmLabel="Delete"
        type="danger"
        onConfirm={confirmDelete}
        onCancel={() => {
          setDeleteConfirmOpen(false);
          setTemplateToDelete(null);
        }}
      />
    </div>
  );
}
