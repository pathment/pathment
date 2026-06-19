import { useCallback, useEffect, useState } from 'react';
import { mentorApi } from '@/lib/services/mentor-api';

export interface FeedbackSnippet {
  id: string;
  label: string;
  body: string;
}

export interface UseFeedbackSnippetsReturn {
  snippets: FeedbackSnippet[];
  loading: boolean;
  create: (payload: { label: string; body: string }) => Promise<FeedbackSnippet | null>;
  remove: (id: string) => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * The mentor's saved feedback snippets — reusable bits of review feedback shown
 * in both review drawers. CRUD against /mentor/feedback-snippets.
 */
export function useFeedbackSnippets(): UseFeedbackSnippetsReturn {
  const [snippets, setSnippets] = useState<FeedbackSnippet[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSnippets = useCallback(async () => {
    try {
      setLoading(true);
      const list = await mentorApi.listFeedbackSnippets();
      setSnippets(list ?? []);
    } catch {
      setSnippets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSnippets();
  }, [fetchSnippets]);

  const create = useCallback(async (payload: { label: string; body: string }) => {
    const snippet = await mentorApi.createFeedbackSnippet(payload);
    setSnippets((prev) => [snippet, ...prev]);
    return snippet;
  }, []);

  const remove = useCallback(async (id: string) => {
    await mentorApi.removeFeedbackSnippet(id);
    setSnippets((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { snippets, loading, create, remove, refetch: fetchSnippets };
}
