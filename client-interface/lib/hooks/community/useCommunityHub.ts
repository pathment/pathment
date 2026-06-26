import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { communityApi, type ScopeType, type PostType, type ReactionType, type CreatePostInput } from '@/lib/services/community-api';
import { useClan, ALL_CLANS } from '@/lib/context/ClanContext';

export interface CommunitySpace {
  key: string;
  type: ScopeType;
  id: string | null;
  name: string;
  subtitle?: string;
  role?: string;
  isModerator?: boolean;
}

export interface CommunityPost {
  id: string;
  type: PostType;
  scopeType: ScopeType;
  scopeId: string | null;
  title: string | null;
  body: string;
  tags: string[];
  linkUrl: string | null;
  attachments: { url?: string; name?: string; kind?: string }[];
  at: string;
  editedAt: string | null;
  pinned: boolean;
  resolved: boolean;
  acceptedCommentId: string | null;
  commentCount: number;
  author: { id: string; name: string; avatar: string; avatarUrl?: string | null };
  recipient: { id: string; name: string } | null;
  reactions: Record<ReactionType, number>;
  myReactions: ReactionType[];
  mine: boolean;
}

export interface CommunityComment {
  id: string;
  postId: string;
  parentId: string | null;
  body: string;
  at: string;
  editedAt: string | null;
  accepted: boolean;
  author: { id: string; name: string; avatar: string; avatarUrl?: string | null };
  mine: boolean;
}

export interface CommunityStats { given: number; cheersReceived: number; posts: number; openQuestions: number }
export interface CommunityPerson { id: string; name: string }
export interface CommunityMember { id: string; name: string; avatar: string; avatarUrl?: string | null; role: string }
export interface LeaderboardEntry { rank: number; userId: string; name: string; avatar?: string; avatarUrl?: string | null; points: number; tier: string; mine?: boolean }
export interface LeaderboardSelf { rank: number | null; userId: string; name: string; points: number; tier: string }

export function useCommunityHub() {
  const [spaces, setSpaces] = useState<CommunitySpace[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [feed, setFeed] = useState<CommunityPost[]>([]);
  const [shoutouts, setShoutouts] = useState<CommunityPost[]>([]);
  const [stats, setStats] = useState<CommunityStats | null>(null);
  const [people, setPeople] = useState<CommunityPerson[]>([]);
  const [members, setMembers] = useState<CommunityMember[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<LeaderboardSelf | null>(null);
  const [lbPeriod, setLbPeriod] = useState<'week' | 'all'>('all');

  const [typeFilter, setTypeFilter] = useState<PostType | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const [loadingSpaces, setLoadingSpaces] = useState(true);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const active = useMemo(() => spaces.find((s) => s.key === activeKey) || null, [spaces, activeKey]);

  // Load spaces once; default to the first clan space (clan-first), else the first.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setLoadingSpaces(true);
        const res = await communityApi.spaces();
        const list: CommunitySpace[] = res?.data?.spaces ?? [];
        if (!alive) return;
        setSpaces(list);
        const firstClan = list.find((s) => s.type === 'clan');
        setActiveKey((prev) => prev ?? (firstClan?.key || list[0]?.key || null));
      } catch {
        if (alive) setError('Failed to load your community spaces');
      } finally {
        if (alive) setLoadingSpaces(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  // Follow the global clan selector: when it points at a specific clan, jump to
  // that clan's space here (the user can still pick another space manually after).
  const { activeClanId } = useClan();
  useEffect(() => {
    if (activeClanId === ALL_CLANS) return;
    const key = `clan:${activeClanId}`;
    if (spaces.some((s) => s.key === key)) setActiveKey(key);
  }, [activeClanId, spaces]);

  const fetchFeed = useCallback(async () => {
    if (!active) return;
    try {
      setLoadingFeed(true);
      setError(null);
      const res = await communityApi.feed({
        scopeType: active.type,
        scopeId: active.id,
        type: typeFilter,
        tag: tagFilter,
        q: query || null,
      });
      setFeed(res?.data?.feed ?? []);
      setShoutouts(res?.data?.shoutouts ?? []);
      setStats(res?.data?.stats ?? null);
    } catch {
      setError('Failed to load the feed');
      setFeed([]);
    } finally {
      setLoadingFeed(false);
    }
  }, [active, typeFilter, tagFilter, query]);

  useEffect(() => { fetchFeed(); }, [fetchFeed]);

  // People + members refresh when the space changes.
  useEffect(() => {
    if (!active) return;
    communityApi.people(active.type, active.id).then((r: any) => setPeople(r?.data?.people ?? [])).catch(() => setPeople([]));
    communityApi.members(active.type, active.id).then((r: any) => setMembers(r?.data?.members ?? [])).catch(() => setMembers([]));
  }, [active]);

  // Leaderboard refresh when the space, period, or feed (new activity) changes.
  const fetchLeaderboard = useCallback(async () => {
    if (!active) return;
    try {
      const r: any = await communityApi.leaderboard(active.type, active.id, lbPeriod);
      setLeaderboard(r?.data?.leaderboard ?? []);
      setMyRank(r?.data?.me ?? null);
    } catch { setLeaderboard([]); setMyRank(null); }
  }, [active, lbPeriod]);

  useEffect(() => { fetchLeaderboard(); }, [fetchLeaderboard]);

  const createPost = useCallback(async (input: Omit<CreatePostInput, 'scopeType' | 'scopeId'>) => {
    if (!active) return false;
    try {
      await communityApi.createPost({ ...input, scopeType: active.type, scopeId: active.id });
      toast.success('Posted');
      await fetchFeed();
      return true;
    } catch {
      toast.error('Could not post');
      return false;
    }
  }, [active, fetchFeed]);

  const react = useCallback(async (id: string, type: ReactionType) => {
    try { await communityApi.react(id, type); await fetchFeed(); } catch { toast.error('Could not react'); }
  }, [fetchFeed]);

  const deletePost = useCallback(async (id: string) => {
    try { await communityApi.deletePost(id); toast.success('Removed'); await fetchFeed(); } catch { toast.error('Could not remove'); }
  }, [fetchFeed]);

  const pin = useCallback(async (id: string, pinned: boolean) => {
    try { await communityApi.pin(id, pinned); await fetchFeed(); } catch { toast.error('Could not update pin'); }
  }, [fetchFeed]);

  const acceptAnswer = useCallback(async (postId: string, commentId: string) => {
    try { await communityApi.acceptAnswer(postId, commentId); toast.success('Answer accepted'); await fetchFeed(); } catch { toast.error('Could not accept'); }
  }, [fetchFeed]);

  const report = useCallback(async (targetType: 'post' | 'comment', targetId: string, reason?: string) => {
    try { await communityApi.report({ targetType, targetId, reason }); toast.success('Reported to moderators'); } catch { toast.error('Could not report'); }
  }, []);

  const refetch = useCallback(async () => {
    await fetchFeed();
    fetchLeaderboard();
  }, [fetchFeed, fetchLeaderboard]);

  return {
    spaces, active, activeKey, setActiveKey,
    feed, shoutouts, stats, people, members,
    leaderboard, myRank, lbPeriod, setLbPeriod,
    typeFilter, setTypeFilter, tagFilter, setTagFilter, query, setQuery,
    loadingSpaces, loadingFeed, error,
    refetch,
    createPost, react, deletePost, pin, acceptAnswer, report,
  };
}
