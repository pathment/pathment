'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import { apiClient } from '@/lib/services/api-client';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { ArrowRight, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { SkillsTab } from '@/components/settings/SkillsTab';

/**
 * Skills onboarding step. Uses the same shared SkillsTab as Settings (search +
 * suggestions + inline level pills + debounced auto-save) so the experience is
 * identical everywhere. Skills save themselves as you add them; "Continue" just
 * marks onboarding complete and heads to the dashboard.
 */
export default function SkillsOnboardingPage() {
  const router = useRouter();
  const { user, updateUser } = useAuth();
  const [finishing, setFinishing] = useState(false);

  const finish = async () => {
    setFinishing(true);
    try {
      // Skills are already persisted by SkillsTab's auto-save; this just advances onboarding.
      await apiClient.post('/profile/skip-skills', {});
      if (updateUser) updateUser({ ...user, onboardingStep: 2, profileCompleted: true });
      toast.success('Welcome to Pathment!');
      router.push(user?.profilePictureUrl ? `/${user.role}/dashboard` : '/onboarding/photo');
    } catch (error: unknown) {
      toast.error(extractApiErrorMessage(error, 'Could not finish setup'));
      setFinishing(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-brand-600 dark:text-brand-300">{user?.role === 'mentor' ? 'Mentor' : 'Mentee'} onboarding · Step 2 of 3</p>
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl mb-4 shadow-sm shadow-brand-200">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">Add your skills</h1>
          <p className="text-muted-foreground">
            This helps us match you and tailor your experience. You can change these anytime in Settings.
          </p>
          <div className="flex items-center justify-center gap-2 mt-4">
            <div className="w-8 h-1.5 bg-brand-600 rounded-full" />
            <div className="w-8 h-1.5 bg-brand-600 rounded-full" />
            <div className="w-8 h-1.5 bg-slate-200 rounded-full" />
          </div>
        </div>

        {/* Shared skills editor (identical to Settings) */}
        <div className="bg-card rounded-2xl border border-slate-200 p-6 sm:p-8">
          <SkillsTab
            heading="Your skills"
            blurb={
              user?.role === 'mentor'
                ? 'Add the skills you bring as a mentor. Tap a level pill to set how strong you are at each.'
                : 'Add the skills you have or are building. Tap a level pill to set where you are.'
            }
          />
        </div>

        {/* Continue */}
        <div className="mt-6 flex items-center justify-between">
          <p className="text-sm text-slate-400">Your skills save automatically as you add them.</p>
          <button
            onClick={finish}
            disabled={finishing}
            className="inline-flex items-center gap-2 px-6 py-3 bg-brand-600 hover:bg-brand-700 text-white rounded-xl transition-colors disabled:opacity-50"
          >
            {finishing ? <Loader2 className="w-5 h-5 animate-spin" /> : <>Continue <ArrowRight className="w-4 h-4" /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
