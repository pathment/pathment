/**
 * Sending one recorded video answer — the same for interviews and quizzes.
 *
 * Straight to Cloudinary when the server signs for it (no size or time limit
 * from our own servers on the way), else through our server. Each assessment
 * supplies its own three endpoints; everything else is shared.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface SignedVideoUpload {
  direct: boolean;
  uploadUrl?: string;
  fields?: Record<string, string>;
  publicId?: string;
}

export interface VideoUploadEndpoints {
  /** Ask the server for a signed direct upload for this answer. */
  sign: (sessionId: string, questionId: string) => Promise<any>;
  /** Tell the server where the direct upload landed. */
  attach: (sessionId: string, questionId: string, publicId: string) => Promise<any>;
  /** The fallback: send the file through our server. */
  uploadFile: (sessionId: string, questionId: string, blob: Blob, onProgress?: (fraction: number) => void) => Promise<any>;
}

/** File extension for a recorded video blob. */
export const videoExt = (blob: Blob) => (blob.type.includes('mp4') ? 'mp4' : 'webm');

/** Multipart body for the fallback upload through our server. */
export function videoFormData(questionId: string, blob: Blob): FormData {
  const fd = new FormData();
  fd.append('questionId', questionId);
  fd.append('video', blob, `answer-${questionId}.${videoExt(blob)}`);
  return fd;
}

/** POST a file straight to a signed upload URL, reporting progress. */
function postDirect(url: string, fields: Record<string, string>, blob: Blob, filename: string, onProgress?: (f: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
    fd.append('file', blob, filename);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.timeout = 10 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error('network error'));
    xhr.ontimeout = () => reject(new Error('upload timed out'));
    xhr.send(fd);
  });
}

/** Send one video answer and attach it. Resolves with the stored URL; throws if neither path worked. */
export async function uploadVideoAnswer(
  endpoints: VideoUploadEndpoints, sessionId: string, questionId: string, blob: Blob, onProgress?: (fraction: number) => void,
): Promise<string | null> {
  let signed: SignedVideoUpload | null = null;
  try {
    const res = await endpoints.sign(sessionId, questionId);
    signed = res?.data ?? null;
  } catch (e: any) {
    // The session or question refused it: retrying elsewhere won't change that.
    if (e?.response?.status && e.response.status < 500) throw e;
  }
  if (signed?.direct && signed.uploadUrl && signed.fields && signed.publicId) {
    try {
      await postDirect(signed.uploadUrl, signed.fields, blob, `answer.${videoExt(blob)}`, onProgress);
      const res = await endpoints.attach(sessionId, questionId, signed.publicId);
      return res?.data?.videoUrl ?? null;
    } catch {
      // Cloudinary unreachable from here (a filtering network): try our server.
    }
  }
  onProgress?.(0);
  const res = await endpoints.uploadFile(sessionId, questionId, blob, onProgress);
  return res?.data?.videoUrl ?? null;
}
