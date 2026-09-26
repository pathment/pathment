import { apiClient } from './api-client';

export interface GamificationStats {
  role?: 'mentor' | 'mentee';
  rewardCredits?: number;
  totalPoints: number;
  currentLevel: number;
  currentStreak: number;
  longestStreak: number;
  totalBadges: number;
  totalTasksCompleted: number;
  totalProgramsCompleted: number;
  avgTaskRating: number;
  leaderboardRank: number | null;
}

export interface Badge {
  id: string;
  name: string;
  description: string;
  category: string;
  criteriaType?: string;
  pointsReward: number;
  isSecret: boolean;
  iconUrl?: string | null;
  unlockedAt?: string;
}

export interface BadgeProgress {
  measurable: boolean;
  current?: number;
  target?: number;
  unit?: string;
  label?: string;
}

export interface BadgeCatalogItem {
  id: string;
  name: string;
  description: string;
  category: string;
  audience?: string;
  criteriaType?: string;
  pointsReward: number;
  isSecret: boolean;
  iconUrl?: string | null;
  unlockedAt?: string;
  status: 'earned' | 'locked';
  automatic?: boolean;
  progress: BadgeProgress;
}

export interface BadgeCatalogResponse {
  audience: 'mentee' | 'mentor';
  earned: BadgeCatalogItem[];
  available: BadgeCatalogItem[];
}

interface UserBadgeApiItem {
  id: string;
  unlockedAt?: string;
  badge?: Badge;
  Badge?: Badge;
}

export interface PointsHistoryEntry {
  id: string;
  userId?: string;
  pointsChange: number;
  pointsBefore: number;
  pointsAfter: number;
  sourceType: string;
  sourceId?: string | null;
  reason?: string | null;
  acknowledged?: boolean;
  createdAt: string;
}

export type PointHistoryItem = PointsHistoryEntry;

export interface LeaderboardEntry {
  id: string;
  userId: string;
  rank: number;
  /** The progress score — the same number the mentor portal shows. */
  score: number;
  /** Its band: Exceptional, Excellent, Strong, Developing, Needs attention. */
  band?: string;
  tasksCompleted?: number;
  onTimeRate?: number | null;
  user?: {
    id: string;
    firstName?: string;
    lastName?: string;
    email: string;
  };
}

interface ApiResponse<T> {
  success: boolean;
  message: string;
  statusCode: number;
  data: T;
}

export const gamificationApi = {
  async getUserStats(userId: string): Promise<GamificationStats> {
    const response = await apiClient.get<ApiResponse<{ stats: GamificationStats }>>(
      `/gamification/user/${userId}/stats`
    );
    return response.data.stats;
  },

  async getUserBadges(userId: string): Promise<Badge[]> {
    const response = await apiClient.get<ApiResponse<{ badges: (UserBadgeApiItem | Badge)[] }>>(
      `/gamification/user/${userId}/badges`
    );

    const mapped: Badge[] = [];

    for (const item of response.data.badges || []) {
      const isUserBadge = 'badge' in item || 'Badge' in item;
      const nested = isUserBadge ? (item as UserBadgeApiItem).badge || (item as UserBadgeApiItem).Badge : (item as Badge);
      if (!nested || !nested.name) continue;

      mapped.push({
        ...nested,
        iconUrl: nested.iconUrl ?? null,
        unlockedAt: (item as UserBadgeApiItem).unlockedAt || nested.unlockedAt
      });
    }

    return mapped;
  },

  async getBadgeCatalog(userId: string, audience?: 'mentor' | 'mentee'): Promise<BadgeCatalogResponse> {
    const response = await apiClient.get<ApiResponse<{ catalog: BadgeCatalogResponse }>>(
      `/gamification/user/${userId}/badge-catalog`,
      { params: audience ? { audience } : undefined }
    );
    return response.data.catalog;
  },

  async uploadBadgeImage(file: File): Promise<string> {
    const fd = new FormData();
    fd.append('file', file);
    const response = await apiClient.post<ApiResponse<{ url: string }>>('/gamification/badges/upload', fd);
    return response.data.url;
  },

  async getUserPointsHistory(userId: string, limit = 20): Promise<PointsHistoryEntry[]> {
    const response = await apiClient.get<ApiResponse<{ history: PointsHistoryEntry[] }>>(
      `/gamification/user/${userId}/points-history`,
      { params: { limit } }
    );
    return response.data.history;
  },

  async getLeaderboard(limit = 10): Promise<LeaderboardEntry[]> {
    const response = await apiClient.get<ApiResponse<{ leaderboard: LeaderboardEntry[] }>>(
      '/gamification/leaderboard',
      { params: { limit } }
    );
    return response.data.leaderboard;
  }
};

export default gamificationApi;
