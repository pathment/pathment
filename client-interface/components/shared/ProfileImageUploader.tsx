'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ImagePlus, Loader2, X, ZoomIn, Check, RefreshCw } from 'lucide-react';
import { profileApi } from '@/lib/services/profile-api';
import { useAuth } from '@/lib/context/AuthContext';

/**
 * Profile-photo uploader with a dependency-free square cropper (drag to pan,
 * slider/wheel to zoom). Accepts strictly PNG/JPG, caps the input size, and
 * exports a centred 512×512 JPG that's uploaded to Cloudinary. Used both by the
 * onboarding gate (required mode — no skipping) and Settings (change anytime).
 */

const ACCEPT = 'image/png,image/jpeg';
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB input cap
const VIEW = 264; // cropper viewport (px)
const OUT = 512;  // exported square (px)
const MAX_ZOOM = 3;

export interface ProfileImageUploaderProps {
  open: boolean;
  onClose?: () => void;
  /** Called with the new Cloudinary URL after a successful upload. */
  onUploaded?: (url: string) => void;
  currentUrl?: string | null;
  /** Required mode (onboarding gate): no close/skip, must upload to proceed. */
  required?: boolean;
  title?: string;
}

export function ProfileImageUploader({ open, onClose, onUploaded, currentUrl, required = false, title }: ProfileImageUploaderProps) {
  const { updateUser } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [nat, setNat] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [uploading, setUploading] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Reset everything when the dialog closes.
  useEffect(() => {
    if (!open) {
      setImageSrc((s) => { if (s) URL.revokeObjectURL(s); return null; });
      setNat(null); setZoom(1); setOffset({ x: 0, y: 0 }); setUploading(false);
    }
  }, [open]);

  // baseScale = "cover" the square at zoom 1.
  const baseScale = nat ? Math.max(VIEW / nat.w, VIEW / nat.h) : 1;
  const scale = baseScale * zoom;
  const dispW = nat ? nat.w * scale : 0;
  const dispH = nat ? nat.h * scale : 0;

  const clampOffset = useCallback((x: number, y: number) => ({
    x: Math.min(0, Math.max(VIEW - dispW, x)),
    y: Math.min(0, Math.max(VIEW - dispH, y)),
  }), [dispW, dispH]);

  const onPickFile = (file?: File | null) => {
    if (!file) return;
    if (!['image/png', 'image/jpeg'].includes(file.type)) { toast.error('Please choose a PNG or JPG image'); return; }
    if (file.size > MAX_BYTES) { toast.error('That image is over 5 MB — please pick a smaller one'); return; }
    const url = URL.createObjectURL(file);
    setImageSrc((prev) => { if (prev) URL.revokeObjectURL(prev); return url; });
    setZoom(1);
  };

  const onImgLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const el = e.currentTarget; imgRef.current = el;
    const w = el.naturalWidth, h = el.naturalHeight;
    setNat({ w, h });
    const s = Math.max(VIEW / w, VIEW / h);
    setOffset({ x: (VIEW - w * s) / 2, y: (VIEW - h * s) / 2 }); // centred
  };

  // Re-clamp the pan whenever zoom changes.
  useEffect(() => { if (nat) setOffset((o) => clampOffset(o.x, o.y)); }, [zoom, nat, clampOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!nat) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dx = e.clientX - drag.current.x, dy = e.clientY - drag.current.y;
    setOffset(clampOffset(drag.current.ox + dx, drag.current.oy + dy));
  };
  const onPointerUp = () => { drag.current = null; };
  const onWheel = (e: React.WheelEvent) => {
    if (!nat) return;
    setZoom((z) => Math.min(MAX_ZOOM, Math.max(1, z - e.deltaY * 0.0015)));
  };

  const save = async () => {
    if (!imgRef.current || !nat) return;
    const canvas = document.createElement('canvas');
    canvas.width = OUT; canvas.height = OUT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Source square in image-pixel space (inverse of the on-screen transform).
    const sx = -offset.x / scale, sy = -offset.y / scale, sSize = VIEW / scale;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(imgRef.current, sx, sy, sSize, sSize, 0, 0, OUT, OUT);
    const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.9));
    if (!blob) { toast.error('Could not process the image'); return; }
    try {
      setUploading(true);
      const url = await profileApi.uploadPicture(blob, 'avatar.jpg');
      updateUser({ profilePictureUrl: url });
      toast.success('Profile photo updated');
      onUploaded?.(url);
      onClose?.();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || 'Could not upload your photo');
    } finally { setUploading(false); }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => { if (!required && !uploading) onClose?.(); }} />
      <div className="relative w-full max-w-md rounded-2xl bg-card border border-slate-200 shadow-xl p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-slate-900 font-semibold">{title || 'Add your profile photo'}</h3>
            <p className="text-sm text-slate-500 mt-0.5">PNG or JPG, up to 5 MB. Drag to reposition, slide to zoom.</p>
          </div>
          {!required && (
            <button onClick={() => !uploading && onClose?.()} className="text-slate-400 hover:text-slate-600 shrink-0"><X className="w-5 h-5" /></button>
          )}
        </div>

        {!imageSrc ? (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full rounded-2xl border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/40 transition-colors py-12 flex flex-col items-center gap-2 text-slate-500"
          >
            <ImagePlus className="w-8 h-8 text-slate-400" />
            <span className="text-sm font-medium text-slate-700">Choose a photo</span>
            <span className="text-xs text-slate-400">PNG or JPG · max 5 MB</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-center">
              <div
                className="relative overflow-hidden rounded-full bg-slate-100 cursor-grab active:cursor-grabbing touch-none select-none"
                style={{ width: VIEW, height: VIEW }}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onWheel={onWheel}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  onLoad={onImgLoad}
                  draggable={false}
                  className="absolute max-w-none pointer-events-none"
                  style={{ left: offset.x, top: offset.y, width: dispW || undefined, height: dispH || undefined }}
                />
                {/* subtle frame */}
                <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-slate-900/10 pointer-events-none" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <ZoomIn className="w-4 h-4 text-slate-400 shrink-0" />
              <input type="range" min={1} max={MAX_ZOOM} step={0.01} value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="w-full accent-brand-600" />
              <button onClick={() => fileRef.current?.click()} title="Choose a different photo" className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700 shrink-0"><RefreshCw className="w-3.5 h-3.5" />Replace</button>
            </div>
          </div>
        )}

        <input ref={fileRef} type="file" accept={ACCEPT} className="hidden"
          onChange={(e) => { onPickFile(e.target.files?.[0]); e.target.value = ''; }} />

        <div className="mt-6 flex justify-end gap-2">
          {!required && (
            <button onClick={() => !uploading && onClose?.()} className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-sm hover:bg-slate-50">Cancel</button>
          )}
          <button
            onClick={save}
            disabled={!imageSrc || uploading}
            className="px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {required ? 'Save & continue' : 'Save photo'}
          </button>
        </div>
      </div>
    </div>
  );
}
