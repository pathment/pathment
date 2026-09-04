'use client';

import React from 'react';
import { Sparkles } from 'lucide-react';
import { QueueProgressBanner } from './QueueProgressBanner';

interface AIEvaluationBannerProps {
  count: number;
  ranAt: string | null;
  runningAI?: boolean;
  progressCount?: number;
  totalCount?: number;
}

export function AIEvaluationBanner({
  count,
  ranAt,
  runningAI = false,
  progressCount = 0,
  totalCount = 0,
}: AIEvaluationBannerProps) {
  return (
    <QueueProgressBanner
      title="Evaluating mentees with AI..."
      completed={progressCount}
      total={totalCount}
      active={runningAI}
      icon={Sparkles}
      lastRunAt={ranAt}
      count={count}
      completedLabel={`AI Evaluated ${count} mentee${count !== 1 ? 's' : ''}`}
    />
  );
}
