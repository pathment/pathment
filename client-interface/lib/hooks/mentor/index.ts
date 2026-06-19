// Mentor Hooks barrel
export { useMentorDashboard } from './useMentorDashboard';
export type { UseMentorDashboardReturn } from './useMentorDashboard';

export { useMentorCohort } from './useMentorCohort';
export type {
  UseMentorCohortReturn,
  CohortMentee,
  CohortTotals,
  CohortRisk,
  CohortMomentum,
} from './useMentorCohort';

export { useMenteeProfile } from './useMenteeProfile';
export type {
  UseMenteeProfileReturn,
  MenteeProfile,
  ProfileBlocker,
  ProfileDelay,
  Personality,
  ProfileInsight,
  MeetingNote,
  ProfileCollaborator,
} from './useMenteeProfile';

export { useMentorApprovals } from './useMentorApprovals';
export type { UseMentorApprovalsReturn, ApprovalItem, BulkReviewPayload } from './useMentorApprovals';

export { useMentorRoadmaps } from './useMentorRoadmaps';
export type { UseMentorRoadmapsReturn, LinearRoadmap, RoadmapStep } from './useMentorRoadmaps';

export { useMentorSchedule } from './useMentorSchedule';
export type { UseMentorScheduleReturn, AvailabilitySlot, Meeting } from './useMentorSchedule';

export { useMentorPromotions } from './useMentorPromotions';
export type { UseMentorPromotionsReturn, PromotionCandidate, PromotionStage } from './useMentorPromotions';

export { useFeedbackSnippets } from './useFeedbackSnippets';
export type { UseFeedbackSnippetsReturn, FeedbackSnippet } from './useFeedbackSnippets';

export { useRewards } from './useRewards';
export type { UseRewardsReturn, Gift, Redemption } from './useRewards';

export { useLibrary } from './useLibrary';
export type { UseLibraryReturn, LibraryDoc } from './useLibrary';

export { useScheduleTemplates } from './useScheduleTemplates';
export type { UseScheduleTemplatesReturn, ScheduleTemplate } from './useScheduleTemplates';

export { useTracks } from './useTracks';
export type { UseTracksReturn } from './useTracks';

export { useMenteeActivity } from './useMenteeActivity';
export type { UseMenteeActivityReturn } from './useMenteeActivity';

export { useMentorMentees } from './useMentorMentees';
export type { UseMentorMenteesReturn } from './useMentorMentees';

export { useMenteeDetailPage } from './useMenteeDetailPage';
export type { UseMenteeDetailPageReturn } from './useMenteeDetailPage';

export { useMentorPrograms } from './useMentorPrograms';
export type { UseMentorProgramsReturn } from './useMentorPrograms';

export { useMentorProgramDetail } from './useMentorProgramDetail';
export type { UseMentorProgramDetailReturn, MentorProgramInfo, ProgramClanDetail, ProgramPerson } from './useMentorProgramDetail';

export { useMentorTaskDetail } from './useMentorTaskDetail';
export type { UseMentorTaskDetailReturn } from './useMentorTaskDetail';

export { useMentorTaskFeedback } from './useMentorTaskFeedback';
export type { UseMentorTaskFeedbackReturn, InlineFeedbackItem } from './useMentorTaskFeedback';

export { useTaskAssignment } from './useTaskAssignment';

export { useSubmissionReview } from './useSubmissionReview';
export type { Submission } from './useSubmissionReview';

export { useMentorSettings } from './useMentorSettings';
export type {
  UseMentorSettingsReturn,
  MentorProfileData,
  MentorProfessionalProfile,
  MentorAvailabilitySettings,
  MentorNotificationSettings,
} from './useMentorSettings';
