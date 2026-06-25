const express = require('express');
const router = express.Router();
const communityController = require('../controllers/communityController');
const { authenticate } = require('../middlewares/auth');
const { requirePermission, requirePermissionMinScope } = require('../middlewares/authz');
const { PERMISSIONS } = require('../config/permissions');
const upload = require('../middlewares/upload');

// All community routes require auth; per-space access is enforced in the
// service via communitySpaceService (membership-derived), so a member only
// ever reads/writes spaces they belong to.
router.use(authenticate);

// Spaces & people
router.get('/spaces', communityController.listSpaces);
router.get('/members', communityController.members);
router.get('/people', communityController.people);
router.get('/leaderboard', communityController.leaderboard);

// Feed
router.get('/feed', communityController.feed);

// Attachments (images/files) for posts
router.post('/upload', upload.arraySafe('files', 4), communityController.uploadAttachments);

// Posts
router.post('/posts', communityController.createPost);
router.patch('/posts/:id', communityController.updatePost);
router.delete('/posts/:id', communityController.deletePost);
router.post('/posts/:id/pin', communityController.pinPost);
router.post('/posts/:id/react', communityController.react);

// Comments / threads
router.get('/posts/:id/comments', communityController.listComments);
router.post('/posts/:id/comments', communityController.addComment);
router.post('/posts/:id/accept', communityController.acceptAnswer);
router.patch('/comments/:id', communityController.updateComment);
router.delete('/comments/:id', communityController.deleteComment);

// Moderation
router.post('/reports', communityController.report);
router.get('/reports', requirePermissionMinScope(PERMISSIONS.COMMUNITY_MODERATE), communityController.listReports);
router.patch('/reports/:id', requirePermissionMinScope(PERMISSIONS.COMMUNITY_MODERATE), communityController.resolveReport);

module.exports = router;
