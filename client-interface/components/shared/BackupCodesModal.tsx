'use client';

import { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { Download, Copy, Check, AlertCircle, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import securityService from '@/lib/services/security-api';

interface BackupCodesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCodesRegenerated?: (codes: string[]) => void;
}

export function BackupCodesModal({
  isOpen,
  onClose,
  onCodesRegenerated,
}: BackupCodesModalProps) {
  const [codes, setCodes] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [showCodes, setShowCodes] = useState(false);
  const [copied, setCopied] = useState<boolean | number>(false);
  const [regenerating, setRegenerating] = useState(false);

  // Fetch backup codes when modal opens
  const fetchBackupCodes = async () => {
    if (isOpen && codes.length === 0) {
      setLoading(true);
      try {
        // Try to get existing backup codes (if available from 2FA status)
        // For now, we'll show a placeholder and let user regenerate
        setCodes([]);
      } catch (err) {
        toast.error('Failed to fetch backup codes');
      } finally {
        setLoading(false);
      }
    }
  };

  const handleRegenerateBackupCodes = async () => {
    setRegenerating(true);
    try {
      const response = await securityService.regenerateBackupCodes();
      setCodes(response.backupCodes);
      setShowCodes(true);
      if (onCodesRegenerated) {
        onCodesRegenerated(response.backupCodes);
      }
      toast.success(response.message);
    } catch (err: any) {
      toast.error(err.response?.data?.message || 'Failed to regenerate backup codes');
    } finally {
      setRegenerating(false);
    }
  };

  const handleCopyCode = (code: string, index: number) => {
    navigator.clipboard.writeText(code);
    setCopied(index);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyAll = () => {
    const allCodes = codes.join('\n');
    navigator.clipboard.writeText(allCodes);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownloadCodes = () => {
    const content = `Backup Codes for Pathment
Generated: ${new Date().toLocaleString()}

These codes can be used to regain access to your account if you lose access to your authenticator app. 
Keep them in a safe location. Each code can only be used once.

${codes.join('\n')}

Never share these codes with anyone.`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pathment-backup-codes-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(link);
    toast.success('Backup codes downloaded successfully');
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={onClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl max-h-[90vh] overflow-y-auto">
          <div className="p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <Dialog.Title className="text-2xl font-semibold text-slate-900">
                Backup Codes
              </Dialog.Title>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Warning */}
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-700">
                <p className="font-medium">Save your backup codes in a secure location.</p>
                <p>Each code can be used only once if you lose access to your authenticator app. Do not share these with anyone.</p>
              </div>
            </div>

            {/* Codes Section */}
            {codes.length > 0 ? (
              <div className="space-y-4">
                {/* Codes Grid */}
                <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 rounded-lg">
                  {codes.map((code, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors group"
                    >
                      <code className="font-mono font-semibold text-slate-900">
                        {code}
                      </code>
                      <button
                        onClick={() => handleCopyCode(code, index)}
                        className="p-1 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Copy code"
                      >
                        {copied === index ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  ))}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <button
                    onClick={handleCopyAll}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
                  >
                    <Copy className="w-4 h-4" />
                    {copied === true ? 'Copied!' : 'Copy All'}
                  </button>
                  <button
                    onClick={handleDownloadCodes}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </button>
                  <button
                    onClick={handleRegenerateBackupCodes}
                    disabled={regenerating}
                    className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {regenerating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <RotateCcw className="w-4 h-4" />
                    )}
                    Regenerate
                  </button>
                </div>

                {/* Info */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-700">
                  Regenerating backup codes will invalidate all previous codes. You&apos;ll need to update them if you&apos;ve saved them elsewhere.
                </div>
              </div>
            ) : loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-slate-600 text-center">
                  No backup codes available. Generate new codes to see them here.
                </p>
                <button
                  onClick={handleRegenerateBackupCodes}
                  disabled={regenerating}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:bg-indigo-400"
                >
                  {regenerating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Generate Backup Codes
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Footer */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
