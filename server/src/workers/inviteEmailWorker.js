const inviteEmailQueue = require('../queues/inviteEmailQueue');
const notificationOrchestrator = require('../services/notificationOrchestrator');

const CONCURRENCY = 10;

/**
 * Process each invite-email job: build the invite URL and send the email.
 * Bull retries automatically on failure (up to 3 attempts with exponential backoff).
 */
inviteEmailQueue.process(CONCURRENCY, async (job) => {
  const { email, role, rawToken, clientBaseUrl } = job.data;
  const inviteUrl = `${clientBaseUrl}/register?invite=${encodeURIComponent(rawToken)}`;

  const result = await notificationOrchestrator.sendRegistrationInviteEmail({
    email,
    role,
    inviteUrl,
  });

  if (!result?.sent) {
    // Throwing causes Bull to retry the job according to defaultJobOptions.
    throw new Error(result?.reason || 'email_not_sent');
  }
});

inviteEmailQueue.on('failed', (job, err) => {
  console.error(`[invite-email-queue] job ${job.id} failed for ${job.data.email}:`, err.message);
});

inviteEmailQueue.on('error', (err) => {
  console.error('[invite-email-queue] queue error:', err.message);
});
