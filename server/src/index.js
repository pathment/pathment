require('dotenv').config();
const express = require('express');
const bodyParser = require('express').json;
const { sequelize } = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(bodyParser());

app.get('/', (req, res) => res.send({ status: 'ok', env: process.env.NODE_ENV || 'development' }));

app.use('/api', routes);

// global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
});

async function start() {
  try {
    // sync models (for dev). In production use migrations.
    await sequelize.authenticate();
    console.log('Database connection established.');
    await sequelize.sync();
    console.log('Models synchronized.');

    app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
  } catch (err) {
    console.error('Failed to start server', err);
    process.exit(1);
  }
}

start();
