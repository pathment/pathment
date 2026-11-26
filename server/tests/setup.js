'use strict';

/**
 * Global Jest setup — runs after the Jest test framework is installed,
 * before each test file. Safe to use jest.mock() and jest.fn() here.
 *
 * Environment variables are loaded by tests/env.js (setupFiles) which
 * runs earlier in the Jest lifecycle.
 */

// ─── Mock notification orchestrator (email, push, in-app) ────────────────────
jest.mock('../src/services/notificationOrchestrator', () => {
  const stub = jest.fn().mockResolvedValue({ delivered: 0, skipped: 0 });
  return {
    dispatch: stub,
    // The push half, used by paths that write their own notification row (a
    // direct message). Stubbed here too, or every send in every suite would
    // reach for a method that is not on the mock.
    pushOnly: jest.fn().mockResolvedValue({ sent: 0 }),
    sendWelcomeEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendRegistrationInviteEmail: jest.fn().mockResolvedValue({ sent: true }),
    // What an applicant who ALREADY has an account gets instead of the
    // "set up your account" invitation (adminService.createRegistrationInvite).
    sendProgramAcceptedEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendApplicationRejectedEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendEmailVerificationEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendSignInLinkEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendWorkspaceOwnerActivationEmail: jest.fn().mockResolvedValue({ sent: true }),
    sendWorkspaceReadyEmail: jest.fn().mockResolvedValue({ sent: true }),
  };
});

// ─── Mock email service ───────────────────────────────────────────────────────
jest.mock('../src/services/emailService', () => ({
  // The queue is how everything is mailed now (a Postgres-backed queue with
  // retries and a dead letter), so a suite that exercises any notifying path
  // reaches for `enqueue`. Without it on the mock the call throws, and every
  // caller wraps mail in a non-fatal try/catch, so it threw unnoticed.
  enqueue: jest.fn().mockResolvedValue({ queued: true, id: 'mock-queued-id' }),
  sendEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendVerificationEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendWelcomeEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
  sendInviteEmail: jest.fn().mockResolvedValue({ id: 'mock-email-id' }),
}));

// ─── Mock Groq / AI service ───────────────────────────────────────────────────
jest.mock('../src/services/groqService', () => {
  const mockRoadmap = {
    totalWeeks: 1,
    weeks: [
      {
        weekNumber: 1,
        title: 'Introduction to REST APIs',
        objectives: ['Understand REST principles', 'Implement CRUD'],
        milestone: 'Build a basic REST API',
        tasks: [
          {
            title: 'Build a basic REST API',
            description: 'Create a Node.js REST API with CRUD operations',
            type: 'project',
            difficulty: 'medium',
            estimatedHours: 5,
            taskOrder: 1,
            deliverable: 'GitHub repository link',
            objectives: [],
            resources: [],
          },
        ],
      },
    ],
  };

  const mockMatchScore = {
    mentorId: null,
    score: 80,
    breakdown: { skillMatch: 80, availabilityMatch: 80, experienceMatch: 80, styleMatch: 80 },
    reasoning: 'Mock matching score',
    strengths: ['Good skill alignment'],
    concerns: [],
  };

  const mockInstance = {
    enabled: true,
    generateRoadmap: jest.fn().mockResolvedValue(mockRoadmap),
    batchGenerateMatchingScores: jest.fn().mockImplementation((mentors) =>
      Promise.resolve(mentors.map(m => ({ ...mockMatchScore, mentorId: m.id })))
    ),
    generateMatchingScore: jest.fn().mockResolvedValue(mockMatchScore),
    determineBestLevel: jest.fn().mockResolvedValue(null),
    calculateBasicMatchScore: jest.fn().mockReturnValue({ score: 70, breakdown: {}, reasoning: '', strengths: [], concerns: [] }),
    generateAdaptiveRecommendations: jest.fn().mockResolvedValue({ recommendations: [], confidence: 0, summary: '' }),
  };

  return mockInstance;
});

// ─── Mock Cloudinary upload ───────────────────────────────────────────────────
jest.mock('../src/utils/cloudinaryUpload', () => ({
  uploadToCloudinary: jest.fn().mockResolvedValue({
    secure_url: 'https://res.cloudinary.com/test/image/upload/test.pdf',
    public_id: 'pathment/test/mock-file',
  }),
  deleteFromCloudinary: jest.fn().mockResolvedValue({ result: 'ok' }),
}));

// ─── Mock Video Metadata ──────────────────────────────────────────────────────
jest.mock('../src/utils/videoMetadata', () => ({
  extractYoutubeId: jest.fn((url) => {
    const match = String(url || '').match(/(?:v=|\/)([a-zA-Z0-9_-]{11})/);
    return match ? match[1] : null;
  }),
  getYoutubeThumbnail: jest.fn((id) => (id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null)),
  fetchVideoMetadata: jest.fn().mockImplementation(async (url) => {
    const ytId = /(?:v=|\/)([a-zA-Z0-9_-]{11})/.exec(String(url || ''))?.[1];
    return {
      title: 'Simple made easy',
      speaker: 'Rich Hickey',
      thumbnailUrl: ytId ? `https://img.youtube.com/vi/${ytId}/hqdefault.jpg` : 'https://img.youtube.com/vi/mock/hqdefault.jpg',
      description: 'A mock talk description for tests',
      durationMins: 45
    };
  })
}));
