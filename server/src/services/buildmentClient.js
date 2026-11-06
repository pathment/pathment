const AppError = require('../utils/errors/AppError');

/**
 * buildmentClient - the one HTTP helper for the Buildment Organization API
 * (`{apiBaseUrl}/integrations/v1`). Server-only: the two key headers are
 * set here and nowhere else, and never reach a browser.
 *
 * Field names are Buildment's contract, snake_case, exactly as documented —
 * note enroll takes `student_email` while cancel takes `email`.
 *
 * Buildment owns courses, enrollments, accounts and progress. This client never
 * creates a Buildment user and never writes progress.
 */

const TIMEOUT_MS = 15000;

/** A non-2xx answer (or no answer) from Buildment. `upstreamStatus` is theirs. */
class BuildmentError extends AppError {
  constructor(message, upstreamStatus, upstreamCode = null) {
    // Never forward Buildment's 401/403 as ours — the web client treats those as
    // "your Pathment session/permission is gone". 502 = the integration failed.
    super(message, 502, 'BUILDMENT_ERROR');
    this.upstreamStatus = upstreamStatus;
    this.upstreamCode = upstreamCode;
  }
}

const trimUrl = (value) => String(value || '').trim().replace(/\/+$/, '');

/**
 * The API host. It comes from the Buildment app in the platform catalog
 * (Platform → Apps), carried on the credentials as `baseUrl`; the
 * BUILDMENT_BASE_URL env var is only a fallback for servers not migrated yet.
 */
function baseUrl(credentials) {
  const url = trimUrl(credentials?.baseUrl || process.env.BUILDMENT_BASE_URL);
  if (!url) throw new AppError('Buildment has no API URL. A platform owner needs to set it in Platform → Apps.', 503, 'BUILDMENT_NOT_CONFIGURED');
  return url;
}

/** Where a learner signs up / studies. Defaults to the API host. */
function appUrl(target) {
  const url = trimUrl(
    target?.appUrl || target?.baseUrl || process.env.BUILDMENT_APP_URL || process.env.BUILDMENT_BASE_URL,
  );
  return url || null;
}

async function request(credentials, method, path, { query, body } = {}) {
  const url = new URL(`${baseUrl(credentials)}/integrations/v1${path}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  const headers = {
    'x-buildment-access-key': credentials.accessKey,
    'x-buildment-secret-key': credentials.secretKey,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BuildmentError('Could not reach Buildment. Try again in a moment.', 0);
  }
  let data = null;
  try { data = await res.json(); } catch { data = null; }
  if (!res.ok) {
    throw new BuildmentError(data?.error || `Buildment request failed (${res.status})`, res.status, data?.code || null);
  }
  return { status: res.status, data: data || {} };
}

const buildmentClient = {
  /**
   * Verify keys. Returns { connected, organizationSlug, organizationName, error }.
   * A 401 here is an ANSWER ("these keys are wrong"), not a failure, so it does
   * not throw; an unreachable Buildment still does.
   */
  async verifyConnection(credentials) {
    try {
      const { data } = await request(credentials, 'GET', '/connection');
      return {
        connected: data.connected === true,
        organizationSlug: data.organization_slug || null,
        organizationName: data.organization_name || null,
        error: data.connected === true ? null : (data.error || 'Buildment did not confirm the connection'),
      };
    } catch (error) {
      if (error instanceof BuildmentError && error.upstreamStatus === 401) {
        return { connected: false, organizationSlug: null, organizationName: null, error: error.message };
      }
      throw error;
    }
  },

  /** Courses this organization may assign. */
  async listCourses(credentials) {
    const { data } = await request(credentials, 'GET', '/courses');
    return Array.isArray(data.courses) ? data.courses : [];
  },

  /** Idempotent on externalAssignmentId: 201 (created) and 200 (existed) are both success. */
  async enroll(credentials, { studentEmail, courseId, externalAssignmentId, mentorId }) {
    const { data } = await request(credentials, 'POST', '/enrollments', {
      body: {
        student_email: studentEmail,
        course_id: courseId,
        external_assignment_id: externalAssignmentId,
        ...(mentorId ? { mentor_id: mentorId } : {}),
      },
    });
    return data;
  },

  async getEnrollment(credentials, externalAssignmentId) {
    const { data } = await request(credentials, 'GET', '/enrollments', {
      query: { external_assignment_id: externalAssignmentId },
    });
    return data.enrollment || null;
  },

  /** The organization's enrollment of one learner in one course, whatever created it. */
  async findEnrollment(credentials, { courseId, learnerEmail }) {
    const { data } = await request(credentials, 'GET', '/enrollments', {
      query: { course_id: courseId, learner_email: learnerEmail },
    });
    return data.enrollment || null;
  },

  async getProgress(credentials, { courseId, learnerEmail }) {
    const { data } = await request(credentials, 'GET', '/progress', {
      query: { course_id: courseId, learner_email: learnerEmail },
    });
    return data;
  },

  /**
   * Release the seat. `user_id` / `mentor_id` are deliberately omitted: Buildment
   * 409s when they do not match its row, and the assignment id already
   * identifies the enrollment.
   */
  async cancel(credentials, { orgSlug, email, courseId, externalAssignmentId }) {
    const { data } = await request(credentials, 'POST', '/enrollments/cancel', {
      body: {
        org_slug: orgSlug,
        email,
        course_id: courseId,
        external_assignment_id: externalAssignmentId,
      },
    });
    return data;
  },
};

module.exports = buildmentClient;
module.exports.BuildmentError = BuildmentError;
module.exports.appUrl = appUrl;
