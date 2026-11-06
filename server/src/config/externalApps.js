/**
 * External app catalog vocabulary. `type` is a Postgres ENUM
 * (enum_external_apps_type) — adding a value here needs a migration that runs
 * ALTER TYPE ... ADD VALUE, and the client mirror in lib/services/apps-api.ts.
 */
const APP_TYPES = ['course', 'communication', 'productivity', 'developer', 'analytics', 'other'];

/**
 * Server-side integrations a catalog app can be backed by
 * (external_apps.integration_key). `credentialFields` drives the connect
 * dialog; the values are verified with the provider and stored encrypted on
 * organization_apps — they are never returned to a client.
 */
const INTEGRATIONS = {
  // Key stays 'buildment' (stored on external_apps and course_enrollments);
  // the product is now called Edorax, which is what users see.
  buildment: {
    label: 'Edorax',
    credentialFields: [
      { key: 'accessKey', label: 'Access key', secret: false },
      { key: 'secretKey', label: 'Secret key', secret: true },
    ],
  },
};
const INTEGRATION_KEYS = Object.keys(INTEGRATIONS);

module.exports = { APP_TYPES, INTEGRATIONS, INTEGRATION_KEYS };
