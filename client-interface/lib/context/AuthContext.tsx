'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { User, AuthResponse, LoginCredentials, RegisterData, TwoFactorLoginResponse, UserRole } from '../types';
import { isAxiosError } from 'axios';
import { activeWorkspaceSlug } from '../services/workspace-scope';
import { apiClient } from '../services/api-client';
import { apiConfig } from '../config/api';
import { tokenStore } from '../services/token-store';
import { SessionExpiredError, startAuthSession, resetAuthSession, restoreAccessToken } from '../services/auth-session';

/** Keep in sync with ClanContext storage keys (avoid importing ClanContext here — circular). */
const MENTOR_CLAN_STORAGE_KEY = 'pathment-active-clan';
const MENTEE_CLAN_STORAGE_KEY = 'pathment-active-mentee-clan';

/** An explicit empty capability list grants no role views. */
function getCapabilities(user: User | null): UserRole[] {
  if (!user) return [];
  return user.capabilities ?? [user.role];
}

interface RegistrationResult {
  clanJoin?: { joinPath?: string };
  [key: string]: unknown;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresTwoFactor: boolean;
  temporaryToken: string | null;
  /** The role view the user is currently in (one of their capabilities). */
  activeRole: UserRole | null;
  /** All role views the user may switch into. */
  availableRoles: UserRole[];
  /** Switch the active role view (no-op if not one of the user's capabilities). */
  setActiveRole: (role: UserRole) => void;
  login: (credentials: LoginCredentials, rememberMe?: boolean) => Promise<{ requiresTwoFactor: boolean; user?: User }>;
  verify2FA: (code: string, rememberMe?: boolean) => Promise<User>;
  register: (data: RegisterData) => Promise<RegistrationResult>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const getHttpStatus = (error: unknown): number | undefined => {
  return (error as { response?: { status?: number } })?.response?.status;
};

function clearUserScopedClientState(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.clear();
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(MENTOR_CLAN_STORAGE_KEY);
    localStorage.removeItem(MENTEE_CLAN_STORAGE_KEY);
  } catch { /* ignore */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);
  const [pendingRemember, setPendingRemember] = useState(true);
  const [activeRole, setActiveRoleState] = useState<UserRole | null>(null);

  const authCheckVersion = useRef(0);

  // Renew the access token in the background — shortly before it expires, and
  // whenever the tab wakes or the network returns. Without this the ONLY way we
  // discover an expired token is by failing a request, which is exactly when the
  // user is mid-task (e.g. in a live review call).
  useEffect(() => startAuthSession(), []);

  // Keep activeRole valid as the user changes: prefer a persisted choice if it
  // is still one of the user's capabilities, otherwise fall back to the
  // primary role. Single-role users always resolve to their one role.
  useEffect(() => {
    if (!user) {
      setActiveRoleState(null);
      return;
    }
    const caps = getCapabilities(user);
    const stored = (typeof window !== 'undefined'
      ? (localStorage.getItem('activeRole') as UserRole | null)
      : null);
    const next = stored && caps.includes(stored)
      ? stored
      : (caps.includes(user.role) ? user.role : (caps[0] ?? null));
    setActiveRoleState(next);
    if (typeof window !== 'undefined') {
      if (next) localStorage.setItem('activeRole', next);
      else localStorage.removeItem('activeRole');
    }
  }, [user]);

  const setActiveRole = (role: UserRole) => {
    if (!getCapabilities(user).includes(role)) return;
    setActiveRoleState(role);
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeRole', role);
    }
  };

  const checkAuth = useCallback(async () => {
    setIsLoading(true);
    const version = ++authCheckVersion.current;
    const workspace = activeWorkspaceSlug();
    const isCurrent = () => version === authCheckVersion.current && workspace === activeWorkspaceSlug();
    try {
      const token = await restoreAccessToken();
      const cachedUser = tokenStore.getUser<User>();
      const cachedWorkspace = tokenStore.getCachedUserWorkspace();
      if (!token) {
        if (cachedUser) tokenStore.clearSession();
        setUser(null);
        setActiveRoleState(null);
        return;
      }

      setUser(null);
      setActiveRoleState(null);
      try {
        const response = await apiClient.get<{ data?: { user?: User } }>(apiConfig.endpoints.me);
        if (!isCurrent() || !tokenStore.getToken()) return;
        const userData = response.data?.user;
        if (userData) {
          tokenStore.setUser(userData);
          setUser(userData);
        } else {
          tokenStore.invalidateCachedUserWorkspace();
        }
      } catch (error) {
        if (!isCurrent()) return;
        const status = getHttpStatus(error);
        const transient = status === 408 || status === 429 ||
          (status !== undefined && status >= 500 && status <= 599) ||
          (status === undefined && isAxiosError(error) && !!error.request && error.code !== 'ERR_CANCELED');
        if (transient && workspace !== null && cachedWorkspace === workspace &&
            tokenStore.getCachedUserWorkspace() === workspace && tokenStore.getToken() && cachedUser) {
          setUser(cachedUser);
        } else {
          setUser(null);
          setActiveRoleState(null);
          // Denial in one workspace does not revoke the global identity. Keep
          // tokens and the raw identity for handoff, but invalidate capabilities.
          if (!transient && cachedWorkspace === workspace) tokenStore.invalidateCachedUserWorkspace();
          if (status === 401) tokenStore.clearSession();
        }
      }
    } catch (error) {
      if (!isCurrent()) return;
      console.error('Auth check failed:', error);
      setUser(null);
      setActiveRoleState(null);
      if (error instanceof SessionExpiredError || getHttpStatus(error) === 401) tokenStore.clearSession();
    } finally {
      if (isCurrent()) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
    return () => { authCheckVersion.current += 1; };
  }, [checkAuth]);

  const login = async (credentials: LoginCredentials, rememberMe = true) => {
    try {
      const response = await apiClient.post<{ data: AuthResponse & Partial<TwoFactorLoginResponse> }>(
        apiConfig.endpoints.login,
        { ...credentials, rememberMe }
      );

      // apiClient.post returns response.data directly
      // Response structure: { success: true, message: "...", data: { user, tokens } }
      const responseData = response.data;

      // Check if 2FA is required
      if (responseData?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setTemporaryToken(responseData?.temporaryToken ?? null);
        setUser(responseData?.user);
        setPendingRemember(rememberMe); // carry the choice into the 2FA step
        console.log('2FA required, temporary token set');
        return { requiresTwoFactor: true };
      }

      // Normal login flow (no 2FA)
      const user = responseData?.user;
      const accessToken = responseData?.tokens?.accessToken;
      const refreshToken = responseData?.tokens?.refreshToken;

      if (!user || !accessToken || !refreshToken) {
        throw new Error('Invalid login response structure');
      }

      tokenStore.setSession({ token: accessToken, refreshToken, user }, rememberMe);
      resetAuthSession(); // fresh session: re-arm proactive renewal, clear any prior expiry latch
      clearUserScopedClientState(queryClient);
      setUser(user);
      setRequiresTwoFactor(false);
      setTemporaryToken(null);
      return { requiresTwoFactor: false, user };
    } catch (error) {
      const status = getHttpStatus(error);
      // Invalid credentials are expected user input errors; keep console clean.
      if (status !== 400 && status !== 401) {
        console.error('Login error:', error);
      }
      throw error;
    }
  };

  const verify2FA = async (code: string, rememberMe = pendingRemember) => {
    if (!temporaryToken) {
      throw new Error('No temporary token available. Please login first.');
    }

    try {
      const response = await apiClient.post<{ data: AuthResponse }>(
        apiConfig.endpoints.verify2FALogin,
        { code, rememberMe },
        {
          headers: {
            Authorization: `Bearer ${temporaryToken}`,
          },
        }
      );

      // apiClient.post returns response.data directly
      const responseData = response.data;
      const currentUser = responseData?.user;
      const accessToken = responseData?.tokens?.accessToken;
      const refreshToken = responseData?.tokens?.refreshToken;

      if (!currentUser || !accessToken || !refreshToken) {
        throw new Error('Invalid 2FA verification response');
      }

      tokenStore.setSession({ token: accessToken, refreshToken, user: currentUser }, rememberMe);
      resetAuthSession();
      clearUserScopedClientState(queryClient);
      setUser(currentUser);

      // Clear 2FA state
      setRequiresTwoFactor(false);
      setTemporaryToken(null);
      return currentUser;
    } catch (error) {
      const status = getHttpStatus(error);
      if (status !== 400 && status !== 401) {
        console.error('2FA verification error:', error);
      }
      throw error;
    }
  };

  const register = async (data: RegisterData) => {
    try {
      const response = await apiClient.post<RegistrationResult & { data?: RegistrationResult }>(apiConfig.endpoints.register, data);
      return response?.data || response;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = tokenStore.getRefreshToken();
      if (refreshToken) {
        await apiClient.post(apiConfig.endpoints.logout, { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      tokenStore.clearSession();
      if (typeof window !== 'undefined') localStorage.removeItem('activeRole');
      clearUserScopedClientState(queryClient);
      setUser(null);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      setUser(updatedUser);
      tokenStore.setUser(updatedUser);
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user && !requiresTwoFactor,
    requiresTwoFactor,
    temporaryToken,
    activeRole: activeRole && getCapabilities(user).includes(activeRole) ? activeRole : null,
    availableRoles: getCapabilities(user),
    setActiveRole,
    login,
    verify2FA,
    register,
    logout,
    refreshUser,
    updateUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
