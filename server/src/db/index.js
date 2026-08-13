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
      const model = require(fullPath)(sequelize, Sequelize.DataTypes);
      models[model.name] = model;
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

module.exports = {
  sequelize,
  Sequelize,
  models
};
