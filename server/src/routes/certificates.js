const express = require('express');
const router = express.Router();
const certificateController = require('../controllers/certificateController');
const { authenticate, authorize } = require('../middlewares/auth');
const upload = require('../middlewares/upload');

router.post(
  '/templates',
  authenticate,
  authorize(['admin']),
  certificateController.createTemplate
);

router.get(
  '/templates',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.listTemplates
);

router.get(
  '/templates/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplate
);

router.get(
  '/templates/:id/qualification',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getQualification
);

router.put(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.updateTemplate
);

router.delete(
  '/templates/:id',
  authenticate,
  authorize(['admin']),
  certificateController.deleteTemplate
);

router.post(
  '/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.issueCertificates
);

router.get(
  '/instances/mentee/:menteeId',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.listMenteeCertificates
);

router.get(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor', 'mentee']),
  certificateController.getCertificateInstance
);

router.post(
  '/upload',
  authenticate,
  authorize(['admin']),
  upload.singleSafe('file'),
  certificateController.uploadAsset
);

router.post(
  '/templates/:id/send-to-mentors',
  authenticate,
  authorize(['admin']),
  certificateController.sendToMentors
);

router.get(
  '/templates/:id/history',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getTemplateHistory
);

router.delete(
  '/instances/:id',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.deleteCertificateInstance
);

router.post(
  '/instances/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendCertificateInstance
);

router.delete(
  '/templates/:id/instances',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.revokeAllTemplateCertificates
);

router.post(
  '/templates/:id/resend',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.resendAllTemplateCertificates
);

router.post(
  '/templates/:id/ai-evaluate',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.runAIEvaluation
);

router.get(
  '/templates/:id/ai-evaluate/status',
  authenticate,
  authorize(['admin', 'mentor']),
  certificateController.getAIEvaluationStatus
);

module.exports = router;
