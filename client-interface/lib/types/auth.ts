// Auth Types
export interface User {
  id: string;
  email: string;
  role: UserRole;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
  profile?: UserProfile;
}

export type UserRole = 'admin' | 'mentor' | 'mentee';

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
  email: string;
  password: string;
  confirmPassword: string;
  role: UserRole;
}

export interface tokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse {
  user: User;
  tokens: tokens;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirm {
  token: string;
  newPassword: string;
  confirmPassword: string;
}
