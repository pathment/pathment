/**
 * Pure file-type helpers. Keep these framework-free so any module (components,
 * hooks, utilities) can classify a file without coupling to rendering.
 */

import { isDirectVideoUrl } from './video';

/** True when the MIME type is an image we can preview inline. */
export function isImageFile(fileType?: string | null): boolean {
  return Boolean(fileType && fileType.startsWith('image/'));
}
/** True when the file is a video we can play inline (by MIME, or by name for legacy rows). */
export function isVideoFile(fileType?: string | null, fileName?: string | null): boolean {
  if (fileType) return fileType.startsWith('video/');
  return isDirectVideoUrl(fileName);
}
