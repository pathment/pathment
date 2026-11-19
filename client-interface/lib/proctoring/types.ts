/**
 * The proctoring package's contract with whatever system uses it.
 *
 * A host (interviews, quizzes, intake assessments, or anything new) supplies a
 * `ProctorTransport`: where an attempt's events and snapshots are sent. Nothing
 * in the package knows about any host's routes or data.
 */

/** Where a picture came from. */
export type SnapshotSource = 'camera' | 'screen';

/** One thing that happened during an attempt (a tab switch, a paste, …). */
export interface ProctorEvent {
  type: string;
  /** ISO time it happened on the candidate's device. */
  at?: string;
  meta?: Record<string, unknown>;
}

/**
 * How an attempt reaches its host. `attemptId` is whatever identifies the
 * attempt to the host (a session id, or a private link's token).
 */
export interface ProctorTransport {
  logProctor: (attemptId: string, events: ProctorEvent[]) => Promise<unknown>;
  uploadSnapshot: (attemptId: string, blob: Blob, questionId?: string | null, source?: SnapshotSource) => Promise<unknown>;
}

/** A stored snapshot, as a reviewer sees it. */
export interface ProctorSnapshot { url: string; at: string; questionId?: string | null; source?: SnapshotSource }
