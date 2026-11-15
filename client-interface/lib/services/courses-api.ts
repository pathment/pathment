import { apiClient } from './api-client';

/**
 * External courses (Buildment). The browser only ever talks to the Pathment
 * API — provider keys live on the server and are never sent here.
 */

/** Access state, owned by the provider. PENDING_ACCOUNT is a successful enrollment. */
export type CourseLifecycle = 'PENDING_ACCOUNT' | 'PAYMENT_REQUIRED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'EXPIRED';

export interface CourseStatus {
  connected: boolean;
  provider: string;
  organizationName: string | null;
  appUrl: string | null;
}

export interface Course {
  /** The provider's id — the only id an enrollment accepts. */
  courseId: string;
  courseSlug: string | null;
  title: string;
  description: string | null;
  /** Integer cents. */
  price: number;
  currency: string;
  pricingType: 'FREE' | 'PAID';
  expiresAt: string | null;
  availableSeats: number | null;
  /** A paid course this workspace has for free. */
  freeForOrganization?: boolean;
  /** Edorax's cover, once its course list sends one; the picker draws one meanwhile. */
  coverUrl?: string | null;
}

export interface CourseEnrollment {
  taskId: string;
  taskStatus: string | null;
  provider: string;
  courseId: string;
  courseTitle: string;
  learnerEmail: string;
  lifecycle: CourseLifecycle;
  progressStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETED';
  overallProgress: number;
  completedLessons: number | null;
  totalLessons: number | null;
  currentChapter: { id?: string; title?: string; progress?: number } | null;
  lastSyncedAt: string | null;
  appUrl: string | null;
  /** The course itself on Edorax; falls back to appUrl when its slug is unknown. */
  courseUrl?: string | null;
  /** Set when the latest refresh failed and this is the previous snapshot. */
  syncError: string | null;
}

/** One mentee's answer from "Enroll". `assignmentId` is what the task is then assigned with. */
export interface CourseEnrollResult {
  menteeId: string;
  ok: boolean;
  assignmentId?: string;
  lifecycle?: CourseLifecycle;
  learnerEmail?: string;
  error?: string;
}

export const coursesApi = {
  status: () => apiClient.get('/courses/status'),
  list: (refresh = false) => apiClient.get('/courses', { params: refresh ? { refresh: true } : undefined }),
  getForTask: (taskId: string, refresh = false) =>
    apiClient.get(`/courses/assignments/${taskId}`, { params: refresh ? { refresh: true } : undefined }),
  /** Enroll mentees on the provider ahead of assigning the course task. */
  enroll: (courseId: string, menteeIds: string[]) => apiClient.post('/courses/enrollments', { courseId, menteeIds }),
  /** Cancel enrollments that were never assigned as a task. */
  release: (courseId: string, enrollments: { menteeId: string; assignmentId: string }[]) =>
    apiClient.post('/courses/enrollments/release', { courseId, enrollments }),
};

export const formatCoursePrice = (course: Pick<Course, 'price' | 'currency' | 'pricingType'>) =>
  course.pricingType === 'FREE' || !course.price
    ? 'Free'
    : new Intl.NumberFormat(undefined, { style: 'currency', currency: course.currency || 'USD' }).format(course.price / 100);
