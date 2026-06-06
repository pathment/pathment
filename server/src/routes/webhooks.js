const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhookController');

// Public (provider-signed) webhooks — no app auth.
router.post('/resend', webhookController.handleResendWebhook);

module.exports = router;
