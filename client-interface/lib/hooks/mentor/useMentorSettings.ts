/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/services/api-client';
import { apiConfig } from '@/lib/config/api';
import { useAuth } from '@/lib/context/AuthContext';
import { extractApiErrorMessage } from '@/lib/utils/api-error';
import { validateProfileFields } from '@/lib/utils/validation';
import { toast } from 'sonner';

export interface MentorProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  bio: string;
  city: string;
  country: string;
  languages: string[];
  timezone: string;
  autoReplyEnabled?: boolean;
}

export interface MentorProfessionalProfile {
  title: string;
  organization: string;
  yearsOfExperience: number;
  specialization: string[];
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
}

export interface MentorAvailabilitySettings {
  isAcceptingMentees: boolean;
  maxMentees: number;
  currentMenteeCount: number;
}

export interface UseMentorSettingsReturn {
  loading: boolean;
  saving: boolean;
  activeTab: string;
  profileData: MentorProfileData;
  mentorProfile: MentorProfessionalProfile;
  availabilitySettings: MentorAvailabilitySettings;
  setActiveTab: (v: string) => void;
  setProfileData: React.Dispatch<React.SetStateAction<MentorProfileData>>;
  setMentorProfile: React.Dispatch<React.SetStateAction<MentorProfessionalProfile>>;
  setAvailabilitySettings: React.Dispatch<React.SetStateAction<MentorAvailabilitySettings>>;
  handleProfileUpdate: () => Promise<void>;
  handleMentorProfileUpdate: () => Promise<void>;
  handleAvailabilityUpdate: () => Promise<void>;
  handleAutoReplyUpdate: (enabled: boolean) => Promise<void>;
}

export function useMentorSettings(): UseMentorSettingsReturn {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  const [profileData, setProfileData] = useState<MentorProfileData>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    bio: '',
    city: '',
    country: '',
    languages: [],
    timezone: '',
  });

  const [mentorProfile, setMentorProfile] = useState<MentorProfessionalProfile>({
    title: '',
    organization: '',
    yearsOfExperience: 0,
    specialization: [],
    linkedinUrl: '',
    githubUrl: '',
    portfolioUrl: '',
  });

  const [availabilitySettings, setAvailabilitySettings] = useState<MentorAvailabilitySettings>({
    isAcceptingMentees: true,
    maxMentees: 5,
    currentMenteeCount: 0,
  });

  const fetchSettings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiClient.get(apiConfig.endpoints.profile);
      const data = response.data;

      setProfileData({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        email: data.email || '',
        phone: data.phone || '',
        bio: data.bio || '',
        city: data.city || '',
        country: data.country || '',
        languages: Array.isArray(data.languages) ? data.languages : [],
        timezone: data.settings?.timezone || '',
        autoReplyEnabled: data.styleProfile?.autoReplyEnabled ?? false,
      });

      if (data.mentorProfile) {
        setMentorProfile({
          title: data.mentorProfile.title || '',
          organization: data.mentorProfile.organization || '',
          yearsOfExperience: data.mentorProfile.yearsOfExperience || 0,
          specialization: data.mentorProfile.specialization || [],
          linkedinUrl: data.mentorProfile.linkedinUrl || '',
          githubUrl: data.mentorProfile.githubUrl || '',
          portfolioUrl: data.mentorProfile.portfolioUrl || '',
        });

        setAvailabilitySettings({
          isAcceptingMentees: data.mentorProfile.isAcceptingMentees ?? true,
          maxMentees: data.mentorProfile.maxMentees || 100,
          currentMenteeCount: data.mentorProfile.currentMenteeCount || 0,
        });
      }

    } catch (error: any) {
      console.error('Failed to fetch settings:', error);
      toast.error('Failed to load settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleProfileUpdate = useCallback(async () => {
    const invalid = validateProfileFields(profileData);
    if (invalid) { toast.error(invalid); return; }
    try {
      setSaving(true);
      await apiClient.put(apiConfig.endpoints.profile, profileData);
      await refreshUser();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      console.error('Failed to update profile:', error);
      toast.error(extractApiErrorMessage(error, 'Failed to update profile'));
    } finally {
      setSaving(false);
    }
  }, [profileData, refreshUser]);

  const handleMentorProfileUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await apiClient.post(`${apiConfig.endpoints.profile}/complete-mentor`, mentorProfile);
      toast.success('Mentor profile updated successfully');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to update mentor profile:', error);
      toast.error(extractApiErrorMessage(error, 'Failed to update mentor profile'));
    } finally {
      setSaving(false);
    }
  }, [mentorProfile, fetchSettings]);

  const handleAvailabilityUpdate = useCallback(async () => {
    try {
      setSaving(true);
      await apiClient.patch(`${apiConfig.endpoints.profile}/mentor/availability`, {
        isAcceptingMentees: availabilitySettings.isAcceptingMentees,
        maxMentees: availabilitySettings.maxMentees,
      });
      toast.success('Availability settings updated successfully');
      await fetchSettings();
    } catch (error: any) {
      console.error('Failed to update availability:', error);
      toast.error(extractApiErrorMessage(error, 'Failed to update availability settings'));
    } finally {
      setSaving(false);
    }
  }, [availabilitySettings, fetchSettings]);

  const handleAutoReplyUpdate = useCallback(async (enabled: boolean) => {
    try {
      setSaving(true);
      await apiClient.patch(`${apiConfig.endpoints.profile}/mentor/auto-reply`, {
        autoReplyEnabled: enabled
      });
      setProfileData(prev => ({ ...prev, autoReplyEnabled: enabled }));
      toast.success(enabled ? 'Auto-replies enabled' : 'Auto-replies disabled');
    } catch (error: any) {
      console.error('Failed to update auto-reply settings:', error);
      toast.error(extractApiErrorMessage(error, 'Failed to update auto-reply settings'));
      // revert toggle on error
      setProfileData(prev => ({ ...prev, autoReplyEnabled: !enabled }));
    } finally {
      setSaving(false);
    }
  }, []);

  return {
    loading,
    saving,
    activeTab,
    profileData,
    mentorProfile,
    availabilitySettings,
    setActiveTab,
    setProfileData,
    setMentorProfile,
    setAvailabilitySettings,
    handleProfileUpdate,
    handleMentorProfileUpdate,
    handleAvailabilityUpdate,
    handleAutoReplyUpdate,
  };
}
