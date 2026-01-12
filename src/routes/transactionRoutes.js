const express = require('express');
const router = express.Router();
const transactionController = require('../Controller/transactionController');

// Define Routes
router.post('/createTransaction', transactionController.createTransaction);
router.get('/GetAllTransaction', transactionController.getAllTransactions);

module.exports = router;