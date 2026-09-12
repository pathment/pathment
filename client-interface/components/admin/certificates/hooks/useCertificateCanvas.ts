'use client';

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { CertificateElement } from '@/lib/services/certificates-api';
import { BACKGROUND_PRESETS, BACKGROUND_PRESETS_MAP } from '../certificate-constants';

interface UseCertificateCanvasOptions {
  elements: CertificateElement[];
  setElements: React.Dispatch<React.SetStateAction<CertificateElement[]>>;
}

export function useCertificateCanvas({ elements, setElements }: UseCertificateCanvasOptions) {
  const [name, setName] = useState('');
  const [selectedProgramId, setSelectedProgramId] = useState('');
  const [bgImageUrl, setBgImageUrl] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [logoConfig, setLogoConfig] = useState<any>(undefined);
  const [activePresetId, setActivePresetId] = useState<string>('preset-classic-navy');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!bgImageUrl) {
      const defaultPreset = BACKGROUND_PRESETS[0];
      if (defaultPreset) {
        setBgImageUrl(defaultPreset.imageUrl);
        setActivePresetId(defaultPreset.id);
      }
    }
  }, [bgImageUrl]);

  const selectedElement = elements.find((el) => el.id === selectedId) || null;

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!activeDragId || !canvasRef.current) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    let xPercent = Math.round((x / rect.width) * 100);
    let yPercent = Math.round((y / rect.height) * 100);

    xPercent = Math.max(0, Math.min(100, xPercent));
    yPercent = Math.max(0, Math.min(100, yPercent));

    setElements((prev) =>
      prev.map((el) => (el.id === activeDragId ? { ...el, xPercent, yPercent } : el))
    );
  };

  const handleMouseUp = () => {
    setActiveDragId(null);
  };

  const applyPresetBackground = (presetId: string) => {
    const preset = BACKGROUND_PRESETS_MAP[presetId];
    if (!preset) return;

    try {
      setBgImageUrl(preset.imageUrl);
      setActivePresetId(presetId);
      toast.success(`Applied ${preset.name} background preset!`);
    } catch (err) {
      toast.error('Failed to apply preset background');
    }
  };

  const addVariableElement = (key: string, label: string) => {
    if (elements.some((el) => el.dynamicKey === key)) {
      const match = elements.find((el) => el.dynamicKey === key);
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
      fontStyle: 'Montserrat, sans-serif',
    };

    setElements((prev) => [...prev, newEl]);
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
      fontStyle: 'Montserrat, sans-serif',
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(id);
  };

  const addBadgeElement = () => {
    if (elements.some((el) => el.type === 'badge')) {
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
      fontStyle: 'Montserrat, sans-serif',
    };
    setElements((prev) => [...prev, newEl]);
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
      alignment: 'center',
    };
    setElements((prev) => [...prev, newEl]);
    setSelectedId(id);
    toast.success('Pathment Logo added to canvas!');
  };

  const deleteElement = (id: string) => {
    setElements((prev) => prev.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const updateSelectedElement = (key: keyof CertificateElement, val: any) => {
    if (!selectedId) return;
    setElements((prev) => prev.map((el) => (el.id === selectedId ? { ...el, [key]: val } : el)));
  };

  return {
    name,
    setName,
    selectedProgramId,
    setSelectedProgramId,
    bgImageUrl,
    setBgImageUrl,
    logoUrl,
    setLogoUrl,
    logoConfig,
    setLogoConfig,
    activePresetId,
    setActivePresetId,
    selectedId,
    setSelectedId,
    selectedElement,
    activeDragId,
    setActiveDragId,
    uploadingLogo,
    setUploadingLogo,
    canvasRef,
    handleMouseMove,
    handleMouseUp,
    applyPresetBackground,
    addVariableElement,
    addStaticTextElement,
    addBadgeElement,
    addPathmentLogoElement,
    deleteElement,
    updateSelectedElement,
  };
}
