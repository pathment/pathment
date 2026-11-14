const { catchAsync } = require('./errorHandler');
const organizationService = require('../services/organizationService');
const { setRequestOrganization } = require('../utils/auditContext');
const { ValidationError } = require('../utils/errors/errorTypes');
const AppError = require('../utils/errors/AppError');

function originHostname(req) {
  try { return new URL(req.headers.origin).hostname; } catch { return null; }
}

// These endpoints operate on the Pathment account itself. When the shared app
// origin calls them without an explicit workspace header, falling back to the
// legacy default tenant leaks that tenant into login/bootstrap and turns a stale
// cookie into a redirect loop. Explicit workspace requests remain scoped.
const ACCOUNT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/audit-logs',
  '/api/auth/change-password',
  '/api/auth/2fa/setup',
  '/api/auth/2fa/verify',
  '/api/auth/2fa/disable',
  '/api/auth/2fa/status',
  '/api/auth/2fa/regenerate-backup-codes',
  '/api/organizations',
  '/api/organizations/me',
]);

// A public apply link names its cohort, and the cohort belongs to exactly one
// workspace. Links shared before they carried /w/<workspace> reach the API with
// no workspace at all, so the link itself decides rather than the default
// tenant, where the cohort does not exist. Only the public, unauthenticated
// cohort routes do this; everything else still needs an explicit workspace.
const PUBLIC_COHORT = /^\/api\/public\/cohorts\/([^/]+)/;
async function workspaceOfPublicLink(path) {
  const match = path.match(PUBLIC_COHORT);
  if (!match) return null;
  let slug;
  try { slug = decodeURIComponent(match[1]); } catch { return null; }
  const { models } = require('../db');
  const cohort = await models.Cohort.findOne({
    where: { publicSlug: slug }, attributes: ['organizationId'], skipOrganizationScope: true,
  });
  if (!cohort?.organizationId) return null;
  return models.Organization.findByPk(cohort.organizationId, { skipOrganizationScope: true });
}

/** Resolve workspace before authentication; authentication validates membership. */
module.exports = catchAsync(async (req, _res, next) => {
  // The platform console spans every workspace, so resolving one here would
  // silently scope operator queries to the default tenant. Platform handlers
  // enter a target workspace's context deliberately when they need one.
  if (req.path.startsWith('/api/platform')) return next();
  // Public catalog and health checks do not require a selected workspace.
  if (['/api/organizations/plans', '/api/health', '/'].includes(req.path)) return next();
  const header = req.headers['x-pathment-workspace'];
  const requested = organizationService.normalizeSlug(header);
  if (header !== undefined && !requested) throw new ValidationError('Invalid workspace identifier');
  if (!requested && ACCOUNT_PATHS.has(req.path)) return next();
  let organization = requested ? await organizationService.bySlug(requested) : null;
  if (requested && !organization) throw new AppError('The selected workspace was not found', 404, 'WORKSPACE_NOT_FOUND');
  if (!organization && header === undefined) organization = await workspaceOfPublicLink(req.path);
  if (!organization) organization = await organizationService.byHostname(originHostname(req) || req.hostname);
  if (!organization) organization = await organizationService.bySlug(organizationService.defaultSlug());
  if (!organization) throw new AppError('The default workspace has not been initialized. Contact your administrator.', 503, 'WORKSPACE_NOT_INITIALIZED');
  organizationService.assertWorkspaceAvailable(organization);
  const demo = require('../utils/stagingWorkspaceDemo');
  if (demo.isDemo(organization) && !demo.allows(req.method, req.path)) {
    throw new AppError('This staging demo supports workspace identity, members and plans only. Other modules are awaiting isolation validation.', 403, 'WORKSPACE_DEMO_RESTRICTED');
  }
  if (organization) {
    req.organization = organization;
    req.organizationId = organization.id;
    setRequestOrganization(organization.id, organization.slug);
  }
  next();
});
