const { catchAsync } = require('../middlewares/errorHandler');
const { successResponse } = require('../utils/responses');
const accessService = require('../services/accessService');
const authzService = require('../services/authzService');

const getRoleCatalog = catchAsync(async (req, res) => {
  const roles = await accessService.listRoleCatalog();
  res.status(200).json(successResponse('Role catalog', { roles }));
});

// ── Custom roles ─────────────────────────────────────────────────────────────
const listCustomRoles = catchAsync(async (req, res) => {
  const roles = await accessService.listCustomRoles();
  res.status(200).json(successResponse('Custom roles', { roles }));
});

const createCustomRole = catchAsync(async (req, res) => {
  const role = await accessService.createCustomRole(req.body, req.user.id);
  res.status(201).json(successResponse('Custom role created', { role }, 201));
});

const updateCustomRole = catchAsync(async (req, res) => {
  const role = await accessService.updateCustomRole(req.params.id, req.body);
  res.status(200).json(successResponse('Custom role updated', { role }));
});

const deleteCustomRole = catchAsync(async (req, res) => {
  const result = await accessService.deleteCustomRole(req.params.id);
  res.status(200).json(successResponse('Custom role deleted', result));
});

const getUserAccess = catchAsync(async (req, res) => {
  const access = await accessService.listUserAccess(req.params.userId);
  res.status(200).json(successResponse('User access', access));
});

const getDirectory = catchAsync(async (req, res) => {
  const result = await accessService.listDirectory(req.query);
  res.status(200).json(successResponse('Directory', result));
});

const grantRole = catchAsync(async (req, res) => {
  const assignment = await accessService.grantRole(
    { userId: req.body.userId, role: req.body.role, scopeType: req.body.scopeType, scopeId: req.body.scopeId },
    req.user.id
  );
  res.status(201).json(successResponse('Role granted', { assignment }, 201));
});

const revokeRole = catchAsync(async (req, res) => {
  const result = await accessService.revokeRole(req.params.id, req.user.id);
  res.status(200).json(successResponse('Role revoked', result));
});

const inviteWithRole = catchAsync(async (req, res) => {
  const result = await accessService.inviteWithRole(
    { email: req.body.email, baseRole: req.body.baseRole, role: req.body.role, scopeType: req.body.scopeType, scopeId: req.body.scopeId },
    req.user.id
  );
  res.status(201).json(successResponse('Invite sent', result, 201));
});

/** The current user's permission union (any scope) + admin-area flag - UI gating. */
const myPermissions = catchAsync(async (req, res) => {
  const [permissions, canAccessAdmin] = await Promise.all([
    authzService.getPermissionUnion(req.user),
    authzService.hasAdminAccess(req.user)
  ]);
  res.status(200).json(successResponse('My permissions', { permissions, canAccessAdmin }));
});

const getAuditLogs = catchAsync(async (req, res) => {
  const { actorUserId, action, entityType, from, to, limit, offset } = req.query;
  const result = await accessService.listAuditLogs({ actorUserId, action, entityType, from, to, limit, offset });
  res.status(200).json(successResponse('Audit logs', result));
});

module.exports = {
  getRoleCatalog, getUserAccess, getDirectory, grantRole, revokeRole, myPermissions, inviteWithRole,
  listCustomRoles, createCustomRole, updateCustomRole, deleteCustomRole, getAuditLogs
};
