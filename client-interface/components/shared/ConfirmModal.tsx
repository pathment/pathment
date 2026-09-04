'use client';

import { AlertTriangle, ShieldAlert, Info, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  type?: 'warning' | 'danger' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  type = 'warning',
  onConfirm,
  onCancel
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return (
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-600">
            <ShieldAlert className="w-6 h-6" />
          </div>
        );
      case 'info':
        return (
          <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-600">
            <Info className="w-6 h-6" />
          </div>
        );
      default:
        return (
          <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
        );
    }
  };

  const getConfirmButtonStyles = () => {
    switch (type) {
      case 'danger':
        return 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500';
      case 'info':
        return 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500';
      default:
        return 'bg-brand-600 hover:bg-brand-700 text-white focus:ring-brand-500';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
      <div 
        className="bg-card border border-border w-full max-w-md rounded-3xl overflow-hidden shadow-2xl flex flex-col relative animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {}
        <button 
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground rounded-lg transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {}
        <div className="p-6 pt-8 flex flex-col items-center text-center space-y-4">
          {getIcon()}
          
          <div className="space-y-1.5 px-2">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{message}</p>
          </div>
        </div>

        {}
        <div className="px-6 py-4 bg-muted/40 border-t border-border flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 border border-border bg-background hover:bg-muted text-foreground rounded-xl text-xs font-bold transition-all"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 ${getConfirmButtonStyles()}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
