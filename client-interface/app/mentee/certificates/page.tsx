'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/context/AuthContext';
import { toast } from 'sonner';
import { Award, Download, ExternalLink, Linkedin, Loader2, Calendar, ShieldCheck, X, Eye } from 'lucide-react';
import { certificatesApi, CertificateInstance } from '@/lib/services/certificates-api';

export default function MenteeCertificatesPage() {
  const { user } = useAuth();
  const [certificates, setCertificates] = useState<CertificateInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewCert, setPreviewCert] = useState<CertificateInstance | null>(null);

  const fetchCertificates = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const res = await certificatesApi.listMenteeCertificates(user.id);
      if (res.success && res.data) {
        setCertificates(res.data);
      }
    } catch (err: any) {
      toast.error('Failed to load your certificates');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCertificates();
  }, [user?.id]);

  const getLinkedInShareUrl = (cert: CertificateInstance) => {
    const url = cert.imageUrl || cert.pdfUrl || window.location.href;
    const title = `Awarded: ${cert.template?.name || 'Certificate of Mastery'} from Pathment`;
    return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;
  };

  return (
    <div className="space-y-6">
      {}
      <div className="border-b border-border pb-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <Award className="w-6 h-6 text-brand-500" />
          My Certificates
        </h1>
        <p className="text-xs text-muted-foreground">View, download, and share your earned accomplishments</p>
      </div>

      {}
      {loading ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] gap-3">
          <Loader2 className="animate-spin h-8 w-8 text-brand-500" />
          <span className="text-sm text-muted-foreground font-medium">Loading your certificates...</span>
        </div>
      ) : certificates.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border rounded-2xl p-8 bg-card text-center">
          <Award className="w-12 h-12 text-brand-500 mb-3 opacity-60" />
          <h3 className="text-sm font-bold text-foreground mb-1">No Certificates Yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Keep working on your milestones! Your mentor will award you certificates as you complete your program targets.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {certificates.map((cert) => {
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
                      {}
                      <button
                        onClick={() => setPreviewCert(cert)}
                        className="flex-1 flex items-center justify-center gap-1 py-1.5 px-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl text-[10px] font-bold transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        View
                      </button>

                      {}
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

                      {}
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
      )}

      {}
      {previewCert && (
        <div 
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 backdrop-blur-md p-4 md:p-8 animate-fade-in"
          onClick={() => setPreviewCert(null)}
        >
          {}
          <button 
            onClick={() => setPreviewCert(null)}
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors border border-white/5"
          >
            <X className="w-5 h-5" />
          </button>

          {}
          <div 
            className="w-full max-w-4xl flex flex-col items-center gap-5 mt-4"
            onClick={e => e.stopPropagation()}
          >
            {}
            <div className="w-full aspect-[1.777] bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative">
              <img 
                src={previewCert.imageUrl} 
                className="w-full h-full object-contain select-none" 
                alt="Certificate Full Preview" 
              />
            </div>

            {}
            <div className="text-center space-y-1">
              <h2 className="text-white text-base font-bold">{previewCert.template?.name || 'Certificate of Mastery'}</h2>
              <p className="text-white/60 text-[11px] font-medium">
                Issued by {previewCert.mentor ? `${previewCert.mentor.firstName} ${previewCert.mentor.lastName}` : 'Pathment Admin'}
              </p>
            </div>

            {}
            <div className="flex gap-3 bg-white/5 border border-white/10 px-5 py-3 rounded-2xl backdrop-blur-xs select-none">
              {}
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

              {}
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

              {}
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
