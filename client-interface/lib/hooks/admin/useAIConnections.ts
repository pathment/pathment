import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { aiConnectionsApi, type AIConnection, type AIRouting, type AIFeature, type AIProvider } from '@/lib/services/ai-connections-api';

const EMPTY_ROUTING: AIRouting = { summary: null, delay: null, atrisk: null, nudge: null, stall: null, coaching: null, feedback: null };

export function useAIConnections() {
  const [connections, setConnections] = useState<AIConnection[]>([]);
  const [routing, setRouting] = useState<AIRouting>(EMPTY_ROUTING);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const res: any = await aiConnectionsApi.list();
      setConnections(res?.data?.connections ?? []);
      setRouting({ ...EMPTY_ROUTING, ...(res?.data?.routing ?? {}) });
    } catch {
      toast.error('Failed to load AI connections');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const addKey = useCallback(async (data: { provider: AIProvider; label: string; model?: string; baseUrl?: string; key: string }) => {
    try { await aiConnectionsApi.create(data); toast.success('Connection added'); await fetchAll(); return true; }
    catch (e: any) { toast.error(e?.response?.data?.message || 'Could not add connection'); return false; }
  }, [fetchAll]);

  const removeKey = useCallback(async (id: string) => {
    try { setBusyId(id); await aiConnectionsApi.remove(id); toast.success('Connection removed'); await fetchAll(); }
    catch { toast.error('Could not remove'); } finally { setBusyId(null); }
  }, [fetchAll]);

  const testKey = useCallback(async (id: string) => {
    try {
      setBusyId(id);
      const res: any = await aiConnectionsApi.test(id);
      const status = res?.data?.status;
      toast[status === 'connected' ? 'success' : 'error'](status === 'connected' ? 'Connection works' : 'Connection failed');
      await fetchAll();
    } catch { toast.error('Test failed'); } finally { setBusyId(null); }
  }, [fetchAll]);

  const setRoute = useCallback(async (feature: AIFeature, connectionId: string | null) => {
    const next = { ...routing, [feature]: connectionId };
    setRouting(next); // optimistic
    try { await aiConnectionsApi.setRouting(next); }
    catch { toast.error('Could not update routing'); fetchAll(); }
  }, [routing, fetchAll]);

  return { connections, routing, loading, busyId, refetch: fetchAll, addKey, removeKey, testKey, setRoute };
}
