'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, AuthResponse, LoginCredentials, RegisterData, TwoFactorLoginResponse } from '../types';
import { apiClient } from '../services/api-client';
import { apiConfig } from '../config/api';

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  requiresTwoFactor: boolean;
  temporaryToken: string | null;
  login: (credentials: LoginCredentials) => Promise<{ requiresTwoFactor: boolean }>;
  verify2FA: (code: string) => Promise<void>;
  register: (data: RegisterData) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [requiresTwoFactor, setRequiresTwoFactor] = useState(false);
  const [temporaryToken, setTemporaryToken] = useState<string | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = localStorage.getItem('token');
      const cachedUser = localStorage.getItem('user');
      
      // If user exists but no token, clear everything (corrupted state)
      if (cachedUser && !token) {
        console.warn('Auth state corrupted: user exists but no token. Clearing...');
        localStorage.removeItem('user');
        setUser(null);
        setIsLoading(false);
        return;
      }
      
      if (token) {
        // Try to get user from API
        try {
          const response = await apiClient.get<any>(apiConfig.endpoints.me);
          // apiClient.get returns: { success, message, statusCode, data: { user } }
          const userData = response.data?.user;
          if (userData) {
            setUser(userData);
            localStorage.setItem('user', JSON.stringify(userData));
          }
        } catch (apiError: any) {
          // If API fails, try to get from localStorage cache
          if (cachedUser) {
            console.log('Using cached user after API fail');
            setUser(JSON.parse(cachedUser));
          } else {
            throw apiError;
          }
        }
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    try {
      const response = await apiClient.post<any>(
        apiConfig.endpoints.login,
        credentials
      );

      // apiClient.post returns response.data directly
      // Response structure: { success: true, message: "...", data: { user, tokens } }
      const responseData = response.data;

      // Check if 2FA is required
      if (responseData?.requiresTwoFactor) {
        setRequiresTwoFactor(true);
        setTemporaryToken(responseData?.temporaryToken);
        setUser(responseData?.user);
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

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      
      console.log('Login successful, tokens stored');
      setUser(user);
      setRequiresTwoFactor(false);
      setTemporaryToken(null);
      return { requiresTwoFactor: false };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  };

  const verify2FA = async (code: string) => {
    if (!temporaryToken) {
      throw new Error('No temporary token available. Please login first.');
    }

    try {
      const response = await apiClient.post<any>(
        apiConfig.endpoints.verify2FALogin,
        { code },
        {
          headers: {
            Authorization: `Bearer ${temporaryToken}`,
          },
        }
      );

      // apiClient.post returns response.data directly
      const responseData = response.data;
      const accessToken = responseData?.tokens?.accessToken;
      const refreshToken = responseData?.tokens?.refreshToken;

      if (!user || !accessToken || !refreshToken) {
        throw new Error('Invalid 2FA verification response');
      }

      localStorage.setItem('token', accessToken);
      localStorage.setItem('refreshToken', refreshToken);
      localStorage.setItem('user', JSON.stringify(user));
      
      console.log('2FA verified, tokens stored');
      
      // Clear 2FA state
      setRequiresTwoFactor(false);
      setTemporaryToken(null);
    } catch (error) {
      console.error('2FA verification error:', error);
      throw error;
    }
  };

  const register = async (data: RegisterData) => {
    try {
      await apiClient.post(apiConfig.endpoints.register, data);
      // After registration, user needs to verify email
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      const refreshToken = localStorage.getItem('refreshToken');
      if (refreshToken) {
        await apiClient.post(apiConfig.endpoints.logout, { refreshToken });
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
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
      localStorage.setItem('user', JSON.stringify(updatedUser));
    }
  };

  const value = {
    user,
    isLoading,
    isAuthenticated: !!user && !requiresTwoFactor,
    requiresTwoFactor,
    temporaryToken,
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
