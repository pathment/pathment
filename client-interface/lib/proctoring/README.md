# Proctoring

One package that watches a timed attempt. Interviews, quizzes and intake assessments all use it, and a new system plugs in without touching it.

| Side | Where | What |
| --- | --- | --- |
| Client | `lib/proctoring/` | Hooks and types |
| Client | `components/proctoring/` | The candidate's screens and the reviewer's summary |
| Server | `server/src/proctoring/` | Rules, the proctor log, snapshots, video answers, the review summary |

The package knows nothing about any host. A host gives it a **transport**, the place an attempt's events and snapshots go, and stores the log on its own attempts table.

## What it does

### While an attempt runs

- **Camera.** Snapshots are taken at random moments, about every 25 s. If the camera goes off, the questions are covered (`CameraOffOverlay`) until it's back.
- **Entire screen.** Only a whole-monitor share is accepted, and screen snapshots are taken at random moments. When the candidate leaves the tab or window, the screen is captured on the spot. If sharing stops, the questions are covered (`ScreenOffOverlay`).
- **Fullscreen.** `fullscreen: 'required'`:
  - Esc is locked (Chrome and Edge), so leaving needs a press-and-hold.
  - If they leave anyway, the questions are covered (`FullscreenRequiredOverlay`) until they return.
  - The clock keeps running, and every exit is logged with how long they were out.
  - If their browser can't go fullscreen at all, they can continue, and that is flagged.
  - `'track'` only logs, and `'off'` ignores fullscreen.
- **Behaviour.** Tab and window switches are counted. Copy and right-click are blocked and logged. Paste in a code editor is blocked and logged.
- **Video and audio answers.**
  - Recorded in the browser and sent straight to Cloudinary with a signed upload, falling back to the host's server.
  - Retried with backoff, and again when the connection comes back.
  - Kept in the page until stored; closing the tab asks first.

### When things go wrong

| What happens | What the package does |
| --- | --- |
| **Connection lost** | The candidate keeps answering, and an offline banner (`ConnectionBanner`) says so. Answers are saved on the device (`useOfflineSave`) and sent when the connection is back; events wait the same way. The drop and its length are logged. |
| **Crash, closed tab, power cut** | Unsent answers and events stay on the device (localStorage) and go out the next time the attempt opens. The clock lives on the host's server, so it kept running. Every opening is logged, and on the same device we also know how long they were away. |
| **Reopened on another device** | The second opening is logged, so the reviewer still sees that they came back. |

### What the reviewer sees

`ProctorSummary` shows:
- **Interruptions:** coming back after closing the page (with time away), going offline (with how long), and leaving fullscreen (with how long).
- **Flags in words:** for example "Left the tab · 2" or "Paste blocked · 1".
- **Every snapshot,** marked as webcam or screen.

### What a browser can't do

A web page can't stop a candidate from:
- holding Esc,
- switching apps with the OS (Alt+Tab, the Windows key),
- using a second device.

The package makes all of these visible:
- Leaving fullscreen covers the questions.
- Switches are counted and captured on screen.
- Snapshots are random.

Only a lockdown browser (for example Safe Exam Browser) can stop them outright.

## Adding it to a new system

### Server

1. **Give your attempts table a log column:** `proctor_log jsonb NOT NULL DEFAULT '[]'`, plus `updated_at`. For a timed attempt, also store `started_at` and enforce the deadline on the server.
2. **Register the table once, at load:**
   ```js
   const { media, rules } = require('../proctoring');
   media.registerLogTable('exam_attempts');
   ```
3. **Expose two endpoints** that check the caller owns the attempt:
   ```js
   // POST /exams/attempts/:id/proctor  { events }
   await media.appendProctorEvents('exam_attempts', attempt.id, media.cleanClientEvents(req.body.events));

   // POST /exams/attempts/:id/snapshot  (multipart: image, questionId, source)
   await media.storeSnapshot('exam_attempts', attempt.id, req.file, {
     questionId: req.body.questionId, source: req.body.source, folder: 'pathment/exams/snapshots',
   });
   ```
4. **For video or audio answers**, add sign and attach endpoints. `media.signDirectVideo(rules.videoPublicIdPrefix('exams', attempt.id, questionId) + Date.now())` signs, and `media.resolveVideo({ file, publicId, prefix, folder })` checks and stores. `media.removeRecording(oldPublicId)` deletes a replaced take.
5. **Before the clock starts**, check the client can do what the attempt needs: `rules.missingCapability(rules.requirementsFor(...), rules.parseCapabilities(req.body.capabilities))`.
6. **For review**, send `media.splitProctorLog(attempt.proctorLog)`. It returns `{ snapshots, flags, flagCounts, stats }`, and `ProctorSummary` takes it as is.

### Client

```tsx
import { useProctor, useScreenShare, useOfflineSave, useOnline, type ProctorTransport } from '@/lib/proctoring';
import {
  ScreenShareStep, CameraOffOverlay, ScreenOffOverlay, FullscreenRequiredOverlay, ConnectionBanner,
} from '@/components/proctoring';

const transport: ProctorTransport = {
  logProctor: (id, events) => api.post(`/exams/attempts/${id}/proctor`, { events }),
  uploadSnapshot: (id, blob, questionId, source) => api.post(`/exams/attempts/${id}/snapshot`, form(blob, questionId, source)),
};

const screen = useScreenShare((type, meta) => proctor.log(type, meta));
const proctor = useProctor({
  sessionId: attempt?.id ?? null, active: running, transport, videoRef, cameraRequired: true,
  screenStream: screen.stream, currentQuestionId: question?.id, fullscreen: 'required',
});
const saves = useOfflineSave({
  storageKey: attempt ? `exam.${attempt.id}` : null,
  send: (questionId, answer) => api.patch(`/exams/attempts/${attempt.id}/answers/${questionId}`, answer),
});
const online = useOnline();
```

- **Start click:** call `proctor.requestFullscreen()` from the click, because the browser only allows fullscreen from a user's click.
- **On load:** lay `readUnsent(storageKey)` over the answers the server returned, so a candidate who comes back sees their latest typing.
- **Screens:**
  - `CameraOffOverlay` when `!proctor.cameraLive`.
  - `ScreenOffOverlay` when `!screen.live`.
  - `FullscreenRequiredOverlay` when `proctor.fullscreenBlocked`, passing `onEnter={proctor.requestFullscreen}` and `onCannot={proctor.continueWithoutFullscreen}`.
  - `ConnectionBanner` when offline.
- **Review:** render `<ProctorSummary proctor={splitProctorLogResult} />`.

Hosts today: `app/mentee/interviews/[taskId]`, `app/mentee/quizzes/[taskId]` and `components/apply/AssessmentRunner.tsx`.
