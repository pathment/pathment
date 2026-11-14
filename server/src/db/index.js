const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/pathment_dev';

// Managed Postgres (DigitalOcean etc.) uses TLS with a CA Node doesn't trust by
// default → "self-signed certificate in certificate chain". If you point
// DB_SSL_CA_PATH at the provider's CA cert, we verify strictly against it;
// otherwise we encrypt without CA verification (fine behind an IP allow-list).
function dbSsl() {
  // Local/containerised Postgres has no TLS — set DB_SSL=false to connect plainly (staging).
  if (String(process.env.DB_SSL).toLowerCase() === 'false') return false;
  const caPath = process.env.DB_SSL_CA_PATH;
  if (caPath && fs.existsSync(caPath)) {
    return { require: true, rejectUnauthorized: true, ca: fs.readFileSync(caPath, 'utf8') };
  }
  return {
    require: true,
    rejectUnauthorized: String(process.env.DB_SSL_REJECT_UNAUTHORIZED).toLowerCase() === 'true',
  };
}

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  logging: false,
  dialectOptions: { ssl: dbSsl() },
  define: {
    underscored: true,
    freezeTableName: false,
    timestamps: true
  },
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000
  }
});

require('./workspaceModelAttributes')(sequelize, Sequelize.DataTypes);

// Auto-load all models from subdirectories
const models = {};
const modelsPath = path.join(__dirname, '../models');

function loadModelsFromDirectory(directory) {
  const files = fs.readdirSync(directory);

  files.forEach(file => {
    const fullPath = path.join(directory, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      loadModelsFromDirectory(fullPath);
    } else if (file.endsWith('.js') && file !== 'index.js') {
      const result = require(fullPath)(sequelize, Sequelize.DataTypes);
      if (Array.isArray(result)) {
        result.forEach(m => { if (m && m.name) models[m.name] = m; });
      } else if (result && result.name) {
        models[result.name] = result;
      }
    }
  });
}

loadModelsFromDirectory(modelsPath);

// Feature-Driven Models
const ragModels = require('../features/rag/models')(sequelize);
Object.assign(models, ragModels);


// Set up associations
Object.keys(models).forEach(modelName => {
  if (models[modelName].associate) {
    models[modelName].associate(models);
  }
});

require('./organizationScope')(sequelize, models);

// Identity is global, but every newly created account must enter exactly one
// workspace. Keeping this at the model boundary covers imports, tests and admin
// scripts as well as the normal registration service.
//
// The workspace is the one the caller names, never a guess when it knows
// better. A public sign-up request carries no workspace, so the request context
// is the default tenant. Without the option below, everyone who created their
// own workspace also became an ADMIN of DevWeekends, the default one, and saw
// it in their workspace list.
//   workspaceMembership: false  -> the caller creates the membership itself
//   workspaceMembership: '<id>' -> join exactly that workspace
if (models.User && models.OrganizationMembership) {
  models.User.addHook('afterCreate', async (user, options = {}) => {
    if (options.workspaceMembership === false) return;
    let organizationId = typeof options.workspaceMembership === 'string'
      ? options.workspaceMembership
      : require('../utils/auditContext').getRequestContext().organizationId;
    if (!organizationId) {
      const slug = String(process.env.DEFAULT_ORGANIZATION_SLUG || process.env.TENANT_SLUG || 'devweekends').toLowerCase();
      const fallback = await models.Organization.findOne({ where: { slug }, skipOrganizationScope: true, transaction: options.transaction });
      organizationId = fallback?.id || null;
    }
    if (!organizationId) return;
    await models.OrganizationMembership.findOrCreate({
      where: { organizationId, userId: user.id },
      defaults: { role: user.role === 'admin' ? 'admin' : 'member', status: 'active', joinedAt: new Date() },
      transaction: options.transaction,
    });
  });
}

module.exports = {
  sequelize,
  Sequelize,
  models
};
