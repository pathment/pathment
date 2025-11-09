const express = require('express');
const router = express.Router();

const programRoutes = require('./programs');

router.use('/programs', programRoutes);

module.exports = router;
