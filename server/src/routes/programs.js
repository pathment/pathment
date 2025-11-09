const express = require('express');
const router = express.Router();
const programController = require('../controllers/programController');

// Enroll a user into a program
router.post('/:id/enroll', programController.enroll);

// Create program (admin)
router.post('/', programController.createProgram);

module.exports = router;
