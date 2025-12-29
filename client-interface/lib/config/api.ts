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
    refreshToken: '/auth/refresh-token',
    logout: '/auth/logout',
    me: '/auth/me',
    
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
    enrollInProgram: '/enrollments',
    
    // Matching
    matchSuggestions: '/matching/suggestions',
    createMatch: '/matching/create',
    
    // Tasks
    tasks: '/tasks',
    taskById: (id: string) => `/tasks/${id}`,
    assignTask: '/tasks/assign',
    submitTask: (id: string) => `/tasks/${id}/submit`,
    reviewSubmission: (id: string) => `/tasks/submissions/${id}/review`,
    
    // Notifications
    notifications: '/notifications',
    markAsRead: (id: string) => `/notifications/${id}/read`,
  },
};
