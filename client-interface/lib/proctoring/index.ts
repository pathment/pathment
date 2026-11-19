/**
 * Proctoring, client side — one package any host can use. See README.md.
 *
 * Hooks: useProctor (watching an attempt), useScreenShare (entire-screen share),
 * useVideoTake (recording a video or audio answer), useAnswerUploads (getting
 * recordings to the host), useOfflineSave (answers that survive a lost
 * connection, a crash or a power cut), useOnline.
 * Screens and the reviewer's summary are in `@/components/proctoring`.
 */
export * from './types';
export { useProctor, type ProctorState, type FullscreenMode } from './useProctor';
export { useScreenShare, type ScreenShare, type ScreenShareProblem } from './useScreenShare';
export { useVideoTake } from './useVideoTake';
export { useAnswerUploads, type UploadStatus, type RecordingKind, type AnswerUploadTargets } from './useAnswerUploads';
export { useOfflineSave, readUnsent } from './useOfflineSave';
export { useOnline } from './useOnline';
export { uploadVideoAnswer, type VideoUploadEndpoints } from './videoUpload';
export { browserCapabilities, deviceProblemFor } from './capabilities';
export {
  VideoAnswerRecorder, grabFrame, randomDelay, fmtClock, MAX_VIDEO_BYTES,
  videoRecordingSupported, audioRecordingSupported, screenShareSupported, pickVideoMime, pickAudioMime,
} from './media';
