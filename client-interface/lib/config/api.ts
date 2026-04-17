export const apiConfig = {
  baseUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  endpoints: {
    // Auth
    login: '/auth/login',
    register: '/auth/register',
    verifyEmail: '/auth/verify-email',
    resendVerification: '/auth/resend-verification',
    forgotPassword: '/auth/forgot-password',
    resetPassword: '/auth/reset-password',
    refreshToken: '/auth/refresh',
    logout: '/auth/logout',
    me: '/auth/me',
    verify2FALogin: '/auth/verify-2fa-login',
    validateInvite: (token: string) => `/auth/invites/${encodeURIComponent(token)}`,
    
    // Profile
    profile: '/profile',
    
    // Programs
    programs: '/programs',
    programById: (id: string) => `/programs/${id}`,
    publishProgram: (id: string) => `/programs/${id}/publish`,
    
    // Roadmap
    generateRoadmap: '/roadmap/generate',
    roadmapById: (id: string) => `/roadmap/${id}`,
    updateRoadmap: (id: string) => `/roadmap/${id}`,
    
    // Enrollment
    enrollments: '/enrollments',
    enrollmentById: (id: string) => `/enrollments/${id}`,
    enrollmentStatus: (id: string) => `/enrollments/${id}/status`,
    
    // Matching
    matches: '/matches',
    matchById: (id: string) => `/matches/${id}`,
    matchStatus: (id: string) => `/matches/${id}/status`,
    matchSuggestions: (enrollmentId: string) => `/matches/suggestions/${enrollmentId}`,
    levelMentors: (levelId: string) => `/matches/levels/${levelId}/mentors`,
    
    // Level Mentor Assignments
    programMentorAssignments: (programId: string) => `/programs/${programId}/mentor-assignments`,
    assignMentorToLevel: (programId: string, levelId: string) => `/programs/${programId}/levels/${levelId}/mentors`,
    getLevelMentorAssignments: (programId: string, levelId: string) => `/programs/${programId}/levels/${levelId}/mentors`,
    removeMentorFromLevel: (programId: string, levelId: string, mentorId: string) => `/programs/${programId}/levels/${levelId}/mentors/${mentorId}`,
    
    // Mentors
    mentors: '/mentors',

    // Admin invites
    adminInvites: '/admin/invites',
    revokeAdminInvite: (id: string) => `/admin/invites/${id}/revoke`,
  },
};
