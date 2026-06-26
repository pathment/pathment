// Auth Types
export interface User {
  id: string;
  email: string;
  role: UserRole;
  /**
   * Platform capabilities (role views the user can switch into). Always a
   * superset that includes `role`. A user can be e.g. an admin who is also a
   * mentee, or a mentee later elevated to mentor.
   */
  capabilities?: UserRole[];
  /** Active clan memberships (clan-scoped roles), returned by /auth/me. */
  clanMemberships?: ClanMembership[];
  firstName: string;
  lastName: string;
  /** Profile photo URL (Cloudinary). Required for mentors/mentees via the gate. */
  profilePictureUrl?: string | null;
  isVerified: boolean;
  /** Onboarding state (mirrors the server User model). */
  profileCompleted?: boolean;
  /** 0=registered, 1=profile, 2=skills, 3=finished. */
  onboardingStep?: number;
  createdAt: string;
  updatedAt: string;
  profile?: UserProfile;
}

export type UserRole = 'admin' | 'mentor' | 'mentee';

/** Clan-scoped role (distinct from platform role/capabilities). */
export type ClanRole = 'lead_mentor' | 'co_mentor' | 'mentee' | 'core_team';

export interface ClanSummary {
  id: string;
  name: string;
  programId: string;
  status: string;
}

export interface ClanMembership {
  id: string;
  clanId: string;
  userId: string;
  role: ClanRole;
  status: string;
  clan?: ClanSummary;
}

export interface UserProfile {
  firstName: string;
  lastName: string;
  avatar?: string;
  bio?: string;
  skills?: string[];
  interests?: string[];
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegisterData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  inviteToken: string;
}

export interface tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: tokens;
}

export interface TwoFactorLoginResponse {
  requiresTwoFactor: boolean;
  temporaryToken: string;
  user: User;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}
