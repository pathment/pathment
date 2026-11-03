'use client';

import { Drawer } from '@/components/shared/Drawer';
import { RichContent } from '@/components/shared/RichContent';
import { renderRichContent } from '@/lib/utils/richText';
import { stripHtml } from '@/lib/utils/html';

/**
 * A scenario as one line of plain text, for a preview: the same rendering as
 * the full view, with the formatting taken off, so no "#" or "**" shows.
 */
export const scenarioPreview = (prompt?: string | null) => stripHtml(renderRichContent(prompt));

/**
 * The whole scenario, formatted, in the side drawer. Mentor and mentee open
 * the same view, from the chat or from the list of discussions.
 */
export function ScenarioDrawer({ open, onClose, title, prompt }: {
  open: boolean;
  onClose: () => void;
  title: string;
  prompt?: string | null;
}) {
  return (
    <Drawer open={open} onClose={onClose} title="The scenario" subtitle={title} width="lg">
      <RichContent html={prompt} className="text-slate-700 dark:text-slate-300" emptyText="This scenario has no description." />
    </Drawer>
  );
}
