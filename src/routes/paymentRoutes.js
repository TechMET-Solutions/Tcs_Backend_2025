const express = require('express');
const router = express.Router();
const paymentController = require('../Controller/paymentController');

router.post('/request', paymentController.createRequest);
router.get('/pending', paymentController.getPendingRequests);
router.put('/update-status', paymentController.handleStatusUpdate);

module.exports = router;