const { Sequelize } = require('sequelize');
const fs = require('fs');
const path = require('path');

const connectionString = process.env.DATABASE_URL || 'postgres://postgres:password@localhost:5432/pathment_dev';

const sequelize = new Sequelize(connectionString, {
  dialect: 'postgres',
  logging: false,
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
